import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

/**
 * One config for the whole app, scoped by directory.
 *
 * The main process and the renderer do not share globals — `process` is not in
 * a page and `document` is not in the main process — so the two halves get
 * their own `languageOptions` rather than a union that would typecheck code
 * neither side can run.
 *
 * `only-warn` turns every rule into a warning, and `lint` runs with
 * `--max-warnings 0`, so nothing is silently tolerated while the output still
 * reads as a list of things to fix rather than a wall of errors.
 */
export default [
  {
    ignores: [
      "dist-electron/**",
      "dist-renderer/**",
      "dist-plugins/**",
      "release/**",
      "src/renderer/public/**",
      /*
       * The site in `web/`: `vitepress build` writes minified chunks into
       * `.vitepress/dist/`, and `vitepress dev` pre-bundles Vue and minisearch
       * into its cache. Both are gitignored, so one local run of either failed
       * `--max-warnings 0` on a clean tree.
       */
      "web/.vitepress/dist/**",
      "web/.vitepress/cache/**",
      "web/.wrangler/**",
      /*
       * The VS Code extension in `vscode-notes/` is a package of its own — its
       * own `package.json`, its own `tsconfig`, its own dependencies, and a
       * different runtime on both sides of it (an extension host, and a webview
       * with no Node in it). It is linted by its own `typecheck` rather than by
       * this config, which is written for the app's two environments and would
       * be judging code it has no `languageOptions` for.
       */
      "vscode-notes/**",
      /*
       * `*.local.*` is gitignored scratch (repros, one-off experiments) that
       * may not even run. `make test` lints the working tree, so a stray one
       * on this machine would fail the gate for code nobody ships.
       */
      "**/*.local.*",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  { plugins: { onlyWarn } },

  {
    files: ["src/main/**", "src/preload/**", "scripts/**", "test/**"],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["src/renderer/**"],
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    plugins: {
      ...pluginReact.configs.flat.recommended.plugins,
      "react-hooks": pluginReactHooks,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      // Unnecessary with the new JSX transform.
      "react/react-in-jsx-scope": "off",
      // TypeScript already describes a component's props.
      "react/prop-types": "off",
    },
  },
]
