import type { Diagnostic } from "@codemirror/lint"
import type { Text } from "@codemirror/state"

import type { PluginDiagnostic, PluginTextPosition } from "./registry"

/**
 * A plugin's diagnostic as CodeMirror draws it — the pure half of
 * `editor-lint.ts`, so `test/plugin-lint.ts` can check the arithmetic without
 * an editor.
 */

/**
 * The offset of a 1-based line and column in `doc`, held inside it: a linter
 * answering about a line past the end, or a column past a line's end (ESLint
 * puts "unexpected end of file" one past it), lands on the nearest real place
 * rather than throwing out of `doc.line`.
 */
export function offsetOf(doc: Text, at: PluginTextPosition): number {
  if (!(at.line >= 1)) return 0
  if (at.line > doc.lines) return doc.length
  const line = doc.line(Math.floor(at.line))
  return Math.min(line.from + Math.max(0, Math.floor(at.column) - 1), line.to)
}

/**
 * `found` against the document it was linted from.
 *
 * A fix is applied only while the editor still holds that exact document: its
 * edits are offsets into the text the linter was handed, and the moment
 * somebody types they point somewhere else. A stale fix does nothing rather
 * than something wrong, and the lint that follows the typing brings a fresh
 * one.
 */
export function diagnosticOf(found: PluginDiagnostic, doc: Text): Diagnostic {
  const from = offsetOf(doc, found.from)
  const to = found.to ? Math.max(from, offsetOf(doc, found.to)) : from
  const fixes = (found.fixes ?? []).filter(
    (fix) =>
      Array.isArray(fix.edits) &&
      fix.edits.every(
        (edit) =>
          0 <= edit.from && edit.from <= edit.to && edit.to <= doc.length
      )
  )

  return {
    from,
    to,
    severity: found.severity,
    message: String(found.message),
    ...(found.source ? { source: String(found.source) } : {}),
    ...(fixes.length
      ? {
          actions: fixes.map((fix) => ({
            name: String(fix.name),
            apply: (view) => {
              if (view.state.doc !== doc) return
              view.dispatch({
                changes: fix.edits.map((edit) => ({
                  from: edit.from,
                  to: edit.to,
                  insert: edit.insert,
                })),
                userEvent: "input.fix",
              })
            },
          })),
        }
      : {}),
  }
}
