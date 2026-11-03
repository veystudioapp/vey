import path from "node:path"
import { parseArgs } from "node:util"

import * as esbuild from "esbuild"

/**
 * Bundles the main and preload entry points into `dist-electron/`.
 *
 * Bundling rather than plain `tsc` is what lets the preload script stay
 * sandboxed: a sandboxed preload cannot `require` a relative file, so the
 * shared API contract has to be inlined into it. `electron` and Node builtins
 * stay external — they are provided by the runtime.
 *
 *   node scripts/build-electron.mjs [--watch] [--minify]
 */
const { values } = parseArgs({
  options: {
    watch: { type: "boolean", default: false },
    minify: { type: "boolean", default: false },
  },
})

// A packaged app never reads `.env` and is launched from Finder or the Start
// menu with none of the builder's variables, so what it needs is baked in here
// — from `.env` on this machine, from the workflow's `env:` on CI. What the
// shell already set wins, since `loadEnvFile` does not override.
try {
  process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"))
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

/** Everything the three bundles agree on. @type {import("esbuild").BuildOptions} */
const shared = {
  outdir: "dist-electron",
  bundle: true,
  platform: "node",
  target: "node22",
  // Electron loads these as CommonJS; `__dirname` in main.ts depends on it.
  // The package is `"type": "module"`, so the extension — not the format — is
  // what Node believes: a `.js` file here would be loaded as ESM and fail on
  // the first `require`.
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  // It stays a real dependency resolved from node_modules rather than being
  // inlined: node-pty loads a prebuilt native binary. `pg` and `mysql2` were
  // external beside it — they carried dynamic requires esbuild could not
  // resolve — and went with the Database panel.
  external: ["electron", "@lydell/node-pty"],
  // The Settings item's icon travels inside the bundle as a data URL rather
  // than as a file read at runtime: `resources/` is not packaged — `files` in
  // package.json is `dist-electron` and `dist-renderer` — so a path would
  // resolve in dev and be missing from a built app.
  loader: { ".png": "dataurl" },
  sourcemap: true,
  minify: values.minify,
  logLevel: "info",
}

/**
 * Main, which is the only one that bundles the agent SDK.
 *
 * `@anthropic-ai/claude-agent-sdk` is ESM and reaches for `import.meta.url` to
 * build a `require` of its own. esbuild's CJS output turns `import.meta` into
 * `{}`, so that becomes `createRequire(undefined)` — which throws the first time
 * the SDK uses it. The define below points it at a real file URL instead.
 *
 * It is bundled rather than left external because `files` in package.json is
 * `dist-electron` and `dist-renderer` only: a `require` of node_modules
 * resolves in dev and is missing from a packaged app.
 *
 * Its own build rather than a field on `shared` because the banner cannot go
 * near the preload: that script is sandboxed and has no `require` of node
 * builtins, so a `require("node:url")` at the top of it would fail before
 * anything else ran.
 *
 * @type {import("esbuild").BuildOptions}
 */
const main = {
  ...shared,
  entryPoints: { main: "src/main/main.ts" },
  banner: {
    js: `const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;`,
  },
  // A URL, not a secret: anything defined here is readable in the bundle.
  // Read back by `serverUrl` (`main/studio-server.ts`), where the variable at
  // launch still wins.
  // `VSCLAUDE_AI_URL` is the same variable under the app's old name, still
  // read so a `.env` or a CI variable written before the rename keeps working.
  define: {
    "import.meta.url": "__importMetaUrl",
    "process.env.VEYSTUDIO_BUILD_AI_URL": JSON.stringify(
      process.env.VEYSTUDIO_AI_URL ?? process.env.VSCLAUDE_AI_URL ?? ""
    ),
  },
}

/** @type {import("esbuild").BuildOptions} */
const rest = {
  ...shared,
  entryPoints: {
    preload: "src/preload/index.ts",
    // The agent daemon: a separate process (see src/main/daemon.ts), so it
    // gets its own bundle rather than living inside main.cjs.
    daemon: "src/main/daemon.ts",
  },
}

if (values.watch) {
  for (const options of [main, rest]) {
    const context = await esbuild.context(options)
    await context.watch()
  }
} else {
  await Promise.all([esbuild.build(main), esbuild.build(rest)])
}
