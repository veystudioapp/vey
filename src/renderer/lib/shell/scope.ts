/**
 * Which of the dock's shells belong to the project being worked in.
 *
 * The strip used to hold every project's shells at once, so five projects with
 * a dev server each was a row of `vite` tabs nobody could tell apart. It is
 * scoped now the way the tab strip is (`inScope` in `lib/panels.ts`), and the
 * same `allProjectTabs` setting lifts both. Only the *strip* is scoped: a
 * shell of another project stays mounted, its pty running, and is back the
 * moment its project is.
 *
 * Pure, so `test/shell-scope.ts` can import it without a store.
 */

type ScopeShell = { id: string; folderId: string }
type ScopeFolder = { id: string; worktreeOf?: string }

/** The project a folder is drawn under: a worktree's own project, or itself. */
export function projectOf(folders: ScopeFolder[], folderId: string): string {
  return (
    folders.find((folder) => folder.id === folderId)?.worktreeOf ?? folderId
  )
}

/** The shells the strip draws. No project picked yet is no scope — the same
 * reason `inScope` gives: a strip that empties itself on an empty workspace. */
export function scopedShells<S extends ScopeShell>(
  shells: S[],
  folders: ScopeFolder[],
  project: string | null,
  all: boolean
): S[] {
  if (all || project === null) return shells
  return shells.filter(
    (shell) => projectOf(folders, shell.folderId) === project
  )
}

/**
 * The shell the dock shows: the selected one when it is in scope, otherwise
 * the one last picked in this project — so coming back to a project lands on
 * the tab that was left there, not on its first — otherwise its first.
 */
export function shownShellId(
  scoped: ScopeShell[],
  activeId: string | null,
  picked: Record<string, string>,
  project: string | null
): string | null {
  const has = (id: string | null | undefined) =>
    id != null && scoped.some((shell) => shell.id === id)
  if (has(activeId)) return activeId
  const last = project === null ? undefined : picked[project]
  if (has(last)) return last ?? null
  return scoped[0]?.id ?? null
}
