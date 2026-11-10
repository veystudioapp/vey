import {
  forEachDiagnostic,
  forceLinting,
  linter,
  type Diagnostic,
} from "@codemirror/lint"
import type { Extension } from "@codemirror/state"
import { EditorView, ViewPlugin } from "@codemirror/view"

import { nameOf } from "@/lib/files/paths"

import { diagnosticOf } from "./lint-diagnostics"
import type { PluginLinter } from "./registry"
import { usePlugins } from "./store"

/**
 * The squiggles plugins draw in the file editor — `app.editor.addLinter`.
 *
 * The app owns CodeMirror and a plugin never touches it: a built-in plugin
 * bundling its own `@codemirror/lint` would be a second copy of the view
 * package, the trap `CLAUDE.md` warns about, and a user's plugin could not be
 * expected to match the app's version. So a plugin is handed text and answers
 * with positions, and this is the one place that turns that into marks.
 *
 * Every file editor carries this whether or not any linter is registered: a
 * plugin switched on later has to reach editors that are already open, and an
 * editor with no linter for its file spends one empty call per pause in typing.
 */

/** How long typing settles before the buffer is linted. A lint is a process
 * round trip and, with type-aware rules, real work. */
const LINT_DELAY_MS = 500

/** Lower case, no dot; empty for a name with none. */
function extensionOf(filePath: string): string {
  const name = nameOf(filePath).toLowerCase()
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1) : ""
}

export function pluginLinting(filePath: string): Extension {
  const extension = extensionOf(filePath)
  const linters = (): PluginLinter[] =>
    usePlugins
      .getState()
      .linters.filter((candidate) => candidate.extensions.includes(extension))

  /** Which linter drew each mark, so one that does not answer this time keeps
   * its own marks and leaves the others' to their own answers. */
  const owner = new WeakMap<Diagnostic, string>()

  const source = async (view: EditorView): Promise<Diagnostic[]> => {
    const running = linters()
    if (running.length === 0) return []

    const { doc } = view.state
    const text = doc.toString()

    // Read now, against the document being linted: `linter` drops the answer
    // if the document has moved on by the time it comes back, so these are
    // only ever redrawn against the same text they were mapped onto.
    const drawn = new Map<string, Diagnostic[]>()
    forEachDiagnostic(view.state, (diagnostic, from, to) => {
      const id = owner.get(diagnostic)
      if (id === undefined) return
      const kept = { ...diagnostic, from, to }
      owner.set(kept, id)
      drawn.set(id, [...(drawn.get(id) ?? []), kept])
    })

    const lists = await Promise.all(
      running.map(async (linter) => {
        let found
        try {
          found = await linter.lint({ path: filePath, text })
        } catch (error) {
          console.error(`[plugin ${linter.pluginId}] linting`, error)
          found = null
        }
        if (!Array.isArray(found)) return drawn.get(linter.id) ?? []

        return found.map((entry) => {
          const diagnostic = diagnosticOf(entry, doc)
          owner.set(diagnostic, linter.id)
          return diagnostic
        })
      })
    )
    return lists.flat()
  }

  return [
    linter(source, { delay: LINT_DELAY_MS }),
    // A linter added or taken away — a plugin switched on or off — is news to
    // every editor already open, which would otherwise wait for a keystroke.
    ViewPlugin.define((view) => {
      let ids = linters()
        .map((entry) => entry.id)
        .join("\n")
      const stop = usePlugins.subscribe((state, previous) => {
        if (state.linters === previous.linters) return
        const next = linters()
          .map((entry) => entry.id)
          .join("\n")
        if (next === ids) return
        ids = next
        forceLinting(view)
      })
      return { destroy: stop }
    }),
    EditorView.theme({
      ".cm-diagnosticAction": {
        backgroundColor: "var(--secondary)",
        color: "var(--secondary-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.75rem",
      },
      ".cm-diagnosticSource": { color: "var(--muted-foreground)" },
    }),
  ]
}
