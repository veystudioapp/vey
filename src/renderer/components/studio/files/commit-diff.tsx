import { lazy, Suspense, useEffect, useState } from "react"
import { Copy } from "lucide-react"

import type { GitCommitFileDiff } from "@shared/api"
import type { CommitFileTarget } from "@/lib/files/changes"
import { useT } from "@/lib/i18n"
import { useSettings } from "@/lib/settings"
import { IconButton } from "../icon-button"
import { DiffControls } from "./file-workspace"

const CodeMirrorFileDiff = lazy(() => import("./codemirror-diff"))

/**
 * One file as a commit changed it, in the checkout's diff tab — a row under a
 * commit opened in the `Commits` view.
 *
 * Not `FilePane`, which is a file on disk with a buffer, a save and an `Edit`
 * half: both sides here are out of the object store, so there is nothing to
 * edit, and the file may not exist any more. What it shares is the merge view
 * (handed its right-hand side as `modified`, which keeps it out of the shared
 * buffers) and the toolbar's layout controls, so the diff reads the way every
 * other diff in the studio does.
 *
 * The previous diff stays on screen until the next one is read, for the reason
 * `FileDiff` gives: a click through a commit's files should not flash empty.
 */
export function CommitDiff({
  folderId,
  target,
}: {
  folderId: string
  target: CommitFileTarget
}) {
  const t = useT()
  const [read, setRead] = useState<{
    key: string
    target: CommitFileTarget
    diff: GitCommitFileDiff
  } | null>(null)
  const key = `${target.hash}:${target.path}`

  useEffect(() => {
    let alive = true
    void window.desktop
      .gitCommitFileDiff(folderId, target.hash, target.path, target.from)
      .catch((): GitCommitFileDiff => ({
        before: null,
        after: null,
        patch: null,
        binary: false,
      }))
      .then((diff) => {
        if (alive) setRead({ key, target, diff })
      })
    return () => {
      alive = false
    }
    // `key` is the target's identity; the object is rebuilt per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, key])

  const sideBySide = useSettings((state) => state.diffSideBySide)
  const whitespace = useSettings((state) => state.diffWhitespace)

  const shown = read?.target ?? target
  const slash = shown.path.lastIndexOf("/")
  const name = shown.path.slice(slash + 1)
  const directory = slash > 0 ? shown.path.slice(0, slash) : ""

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span
          title={`${shown.path}\n\n${shown.hash}\n${shown.subject}`}
          className="flex min-w-0 flex-1 items-baseline gap-2 font-mono text-xs"
        >
          <span className="shrink-0 rounded bg-amber-500/10 px-1 font-medium text-amber-600 dark:text-amber-400">
            {shown.shortHash}
          </span>
          <span className="shrink-0">{name}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {shown.from
              ? t("files.commitDiff.from", { path: shown.from })
              : directory}
          </span>
        </span>
        <DiffControls />
        <IconButton
          label={t("files.copyPath")}
          className="shrink-0"
          onClick={() => void navigator.clipboard.writeText(shown.path)}
        >
          <Copy />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1">
        {read === null ? null : read.diff.binary ? (
          <Note>{t("files.commitDiff.binary")}</Note>
        ) : read.diff.before === null && read.diff.after === null ? (
          <Note>{t("files.commitDiff.nothing")}</Note>
        ) : (
          <Suspense fallback={<div className="h-full w-full" />}>
            <CodeMirrorFileDiff
              path={read.target.path}
              initialText=""
              sideBySide={sideBySide}
              whitespace={whitespace}
              original={read.diff.before}
              patch={read.diff.patch}
              modified={read.diff.after ?? ""}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

function Note({ children }: { children: string }) {
  return (
    <p className="p-4 text-center text-xs text-muted-foreground">{children}</p>
  )
}
