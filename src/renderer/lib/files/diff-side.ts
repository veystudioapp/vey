import type { DiffSide, GitChange } from "@shared/api"

/**
 * Which pair the `Changes` pane draws for a file, given the row it was opened
 * from — `staged` true or false, or null for a selection no row made (the
 * stacked view's scroll-to).
 *
 * Only a file with **both** rows takes a side. Every other file has one pair to
 * compare, and `head` is that pair: an unstaged-only file's index is `HEAD`, a
 * staged-only file's working tree is its index. Keeping `head` there keeps the
 * right-hand side the file's own buffer, which is what `Diff | Edit` and an
 * unsaved edit are drawn through; only the two-row file has a row whose `+`/`-`
 * are about a pair the buffer is not half of.
 */
export function diffSideOf(
  changes: GitChange[] | undefined,
  path: string,
  staged: boolean | null
): DiffSide {
  if (staged === null || !hasBothSides(changes, path)) return "head"
  return staged ? "staged" : "unstaged"
}

/**
 * Whether a row is the one the pane is drawing. Both rows of a two-row file
 * when no side was picked, since the pane is then drawing `head` — the pair
 * neither of them is.
 */
export function isShownRow(
  changes: GitChange[] | undefined,
  selected: { path: string | null; staged: boolean | null },
  change: GitChange
): boolean {
  if (selected.path !== change.path) return false
  return diffSideOf(changes, change.path, selected.staged) === "head"
    ? true
    : selected.staged === change.staged
}

function hasBothSides(changes: GitChange[] | undefined, path: string): boolean {
  let staged = false
  let unstaged = false
  for (const change of changes ?? []) {
    if (change.path !== path || change.directory) continue
    if (change.staged) staged = true
    else unstaged = true
  }
  return staged && unstaged
}
