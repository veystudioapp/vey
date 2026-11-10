import type { PluginApp } from "@/lib/plugins/app"
import { commitAt } from "@/lib/files/git-blame"

import { mountBlameCard } from "./card"
import { annotationOf } from "./words"

/**
 * GitLens's current-line blame: who last changed the caret's line, faintly
 * after it, and the commit behind that in a card when the words are hovered.
 *
 * A plugin so it can be switched off in the rail's Plugins view — it was a
 * switch in Settings. The editor half is the app's
 * (`lib/plugins/editor-line-annotation.ts`, through `addLineAnnotation`): where
 * the words sit, when they are asked for, when they hide. This is the git half
 * — one `git blame` of the buffer per ask (`blame` in `main/git.ts`), read a
 * line at a time — and the card.
 */
export default {
  onload(app: PluginApp) {
    app.editor.addLineAnnotation({
      id: "blame",
      name: "Git blame",
      async annotate({ path, text }) {
        const blame = await app.git.blame(path, text).catch(() => null)
        if (!blame) return null
        return (line) => {
          const commit = commitAt(blame, line)
          if (commit === undefined) return null
          const words = { t: app.t, locale: app.locale() }
          return {
            text: annotationOf(commit, words),
            // A line nobody has committed has no commit to show.
            ...(commit
              ? {
                  card: (host, { close, remeasure }) =>
                    mountBlameCard(host, app, {
                      filePath: path,
                      blame,
                      commit,
                      line,
                      source: blame.sources[line - 1] ?? null,
                      close,
                      remeasure,
                    }),
                }
              : {}),
          }
        }
      },
    })
  },
}
