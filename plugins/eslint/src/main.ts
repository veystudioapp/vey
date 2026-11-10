import type { PluginApp } from "@/lib/plugins/app"

import { answerOf, ESLINT_EXTENSIONS } from "./diagnostics"

/**
 * The project's own ESLint, in the file editor.
 *
 * A plugin so it can be switched off in the rail's Plugins view — a lint nobody
 * wants on is a process per project and a red line under work in progress.
 * The process itself is the app's (`main/eslint.ts`), since a plugin has no
 * Node to run one in; this decides which files and how the answer reads.
 */
export default {
  onload(app: PluginApp) {
    app.editor.addLinter({
      id: "eslint",
      name: "ESLint",
      extensions: ESLINT_EXTENSIONS,
      lint: async ({ path, text }) =>
        answerOf(await app.eslint.lint(path, text)),
    })
  },
}
