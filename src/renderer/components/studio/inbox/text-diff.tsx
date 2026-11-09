import { useEffect, useRef } from "react"
import { unifiedMergeView } from "@codemirror/merge"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { useTheme } from "next-themes"

import { baseChrome, editorTheme, readOnly } from "@/lib/editor"
import {
  DIFF_CONTEXT,
  DIFF_MIN_COLLAPSE,
  githubDiffGutters,
  githubDiffTheme,
} from "@/lib/files/diff-chrome"

/**
 * Two ClickUp texts against each other — a description or a comment before
 * and after — in the `Changes` tab's own diff chrome, so a diff reads the same
 * everywhere in the app. Nothing about being a file: no buffer, no language,
 * no side-by-side. Read-only, as everything from ClickUp is here.
 *
 * The default export, imported only through a `lazy`: an editor is the largest
 * thing in the bundle, and an inbox nobody opens should not load one.
 */
export default function TextDiff({
  before,
  after,
}: {
  before: string
  after: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: after,
        extensions: [
          ...baseChrome(),
          ...readOnly(),
          editorTheme(isDark),
          githubDiffGutters(),
          githubDiffTheme(isDark),
          // Prose, so the wrapping `baseChrome` turns on does the work here.
          EditorView.theme({
            "&": { fontSize: "0.75rem" },
            ".cm-scroller": { overflow: "auto", lineHeight: "1.5" },
            ".cm-content": { padding: "4px 0" },
          }),
          unifiedMergeView({
            original: before,
            // The file diff's own settings: a flat tint per row, deletions
            // still readable, and no accept/reject — there is nothing to edit.
            highlightChanges: true,
            gutter: false,
            syntaxHighlightDeletions: true,
            mergeControls: false,
            collapseUnchanged: {
              margin: DIFF_CONTEXT,
              minSize: DIFF_MIN_COLLAPSE,
            },
          }),
        ],
      }),
    })

    return () => view.destroy()
    // Rebuilt on a theme swap: Primer's palette is baked into the view's
    // configuration, and this is a few paragraphs, not a file.
  }, [before, after, isDark])

  return <div ref={hostRef} className="overflow-hidden rounded-md border" />
}
