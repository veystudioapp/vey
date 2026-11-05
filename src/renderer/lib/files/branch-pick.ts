import type { GitLogScope } from "@shared/api"

/**
 * The `Git Graph` tab's `Branches` list as a set of ticks, and back.
 *
 * The list ticks several branches at once, plus two entries that are not
 * branches: every branch, and whatever is checked out. Those two stand alone —
 * ticking one clears the rest, and ticking a branch clears them — and nothing
 * ticked at all is every branch again, since a graph of no branches is a blank
 * tab. Pure, so `test/branch-pick.ts` can hold those rules down.
 */

/** Not refnames — `refs/` starts every one of those — so never a branch. */
export const PICK_ALL = "*all"
export const PICK_HEAD = "*head"

/** What is ticked for a scope. */
export function picksOf(scope: GitLogScope): string[] {
  switch (scope.kind) {
    case "all":
      return [PICK_ALL]
    case "head":
      return [PICK_HEAD]
    case "branches":
      return scope.refs
  }
}

/**
 * The scope after the list's ticks changed from `picksOf(previous)` to `next`.
 *
 * Read off what was **added**, not the whole list: ticking a branch while
 * `Show All` is ticked hands back both, and it is the branch that was meant.
 */
export function scopeOfPicks(
  previous: GitLogScope,
  next: readonly string[]
): GitLogScope {
  const before = picksOf(previous)
  const added = next.filter((pick) => !before.includes(pick))
  // Back to every branch from a pick is with the remotes, the way the tab
  // opens; only the checkbox takes them out.
  const all: GitLogScope = {
    kind: "all",
    remotes: previous.kind === "all" ? previous.remotes : true,
  }

  if (added.includes(PICK_ALL)) return all
  if (added.includes(PICK_HEAD)) return { kind: "head" }

  const refs = next.filter((pick) => pick !== PICK_ALL && pick !== PICK_HEAD)
  if (refs.length > 0) return { kind: "branches", refs }
  // Unticking the one thing ticked: `Current branch` stays as it is only if it
  // is still there; everything else falls back to every branch.
  return next.includes(PICK_HEAD) ? { kind: "head" } : all
}

/** `refs/heads/main` → `main`, `refs/remotes/origin/x` → `origin/x`. */
export function shortRef(ref: string): string {
  return ref.replace(/^refs\/(heads|remotes|tags)\//, "")
}
