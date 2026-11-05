import type { GitRef } from "@shared/api"

/**
 * The refs on a commit as the chips drawn before its subject — in the
 * `Commits` view and the `Git Graph` tab alike.
 *
 * Fewer chips than refs, on purpose. A pushed branch is the commonest case on
 * any row and drew as two chips saying one thing (`main` and `origin/main`),
 * so a remote-tracking branch with a local of the same name on the same commit
 * folds into the local's chip, which marks it (`remotes`). A remote's `HEAD`
 * (`origin/HEAD`) is dropped: it is the remote's default-branch pointer, not a
 * line of work, and it sits beside that branch's own chip saying nothing more.
 * In a sidebar's width those two rules were the difference between a subject
 * and no subject (`test/ref-chips.ts`).
 */
export type RefChip = {
  name: string
  kind: GitRef["kind"]
  /** The branch checked out, or a detached `HEAD`. */
  head: boolean
  /** Remote-tracking branches folded into this local one — `origin/main`. */
  remotes: string[]
}

/** Checked out first, then branches, remote-tracking ones, tags. */
const ORDER: Record<GitRef["kind"], number> = {
  head: 0,
  branch: 1,
  remote: 2,
  tag: 3,
}

export function chipsOf(refs: readonly GitRef[]): RefChip[] {
  const locals = new Map<string, RefChip>()
  const chips: RefChip[] = []

  for (const ref of refs) {
    if (ref.kind === "remote") continue
    const chip: RefChip = {
      name: ref.name,
      kind: ref.kind,
      head: ref.head === true,
      remotes: [],
    }
    if (ref.kind === "branch") locals.set(ref.name, chip)
    chips.push(chip)
  }

  for (const ref of refs) {
    if (ref.kind !== "remote") continue
    const slash = ref.name.indexOf("/")
    const branch = slash === -1 ? ref.name : ref.name.slice(slash + 1)
    if (branch === "HEAD") continue
    const local = locals.get(branch)
    if (local) local.remotes.push(ref.name)
    else
      chips.push({ name: ref.name, kind: "remote", head: false, remotes: [] })
  }

  return chips.sort(
    (a, b) => Number(b.head) - Number(a.head) || ORDER[a.kind] - ORDER[b.kind]
  )
}
