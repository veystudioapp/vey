import type { EslintFix, EslintMessage, EslintResult } from "@shared/eslint"
import type { PluginDiagnostic } from "@/lib/plugins/registry"

/**
 * ESLint's answer as the editor's squiggles — the pure half of the plugin,
 * checked by `test/plugin-lint.ts`.
 */

/** What ESLint is asked about. The family it parses on its own, plus what
 * `typescript-eslint` adds; a `.vue` or `.svelte` needs a parser the project
 * may not have, and lint text it cannot parse is a red line on every one. */
export const ESLINT_EXTENSIONS = [
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
]

function editOf(fix: EslintFix) {
  return { from: fix.range[0], to: fix.range[1], insert: fix.text }
}

/** One squiggle per message; a rule's autofix and its suggestions as the
 * tooltip's buttons, the autofix first. */
export function diagnosticsOf(messages: EslintMessage[]): PluginDiagnostic[] {
  return messages.map((message) => ({
    from: { line: message.line, column: message.column },
    ...(message.endLine !== undefined && message.endColumn !== undefined
      ? { to: { line: message.endLine, column: message.endColumn } }
      : {}),
    severity: message.severity === 2 ? "error" : "warning",
    message: message.message,
    source: message.ruleId ? `eslint(${message.ruleId})` : "eslint",
    fixes: [
      ...(message.fix ? [{ name: "Fix", edits: [editOf(message.fix)] }] : []),
      ...(message.suggestions ?? []).map((suggestion) => ({
        name: suggestion.desc,
        edits: [editOf(suggestion.fix)],
      })),
    ],
  }))
}

/**
 * The whole answer for the editor: null to keep what is drawn, empty for a
 * file ESLint has nothing to do with.
 *
 * An ESLint that could not run — a config that throws, a plugin it names that
 * is not installed — is one mark at the top of the file saying why, rather
 * than nothing: the command line would say so, and an editor that silently
 * stopped linting is the one failure with nothing on screen to go on.
 */
export function answerOf(
  result: EslintResult | null
): PluginDiagnostic[] | null {
  if (result === null) return null
  if (result.status === "unavailable") return []
  if (result.status === "failed") {
    return [
      {
        from: { line: 1, column: 1 },
        severity: "warning",
        message: `ESLint could not run: ${result.error
          .split("\n")
          .slice(0, 6)
          .join("\n")}`,
        source: "eslint",
      },
    ]
  }
  return diagnosticsOf(result.messages)
}
