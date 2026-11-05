import type { GitRef } from "../src/shared/api"
import { chipsOf } from "../src/renderer/lib/files/ref-chips"
import { check, finish, section } from "./harness"

/**
 * The chips before a commit's subject: which refs fold into which.
 *
 * Folding is where a chip can quietly lie — a remote branch folded into a
 * local one of a *different* name, or one dropped with no local to stand for
 * it, would leave a commit that is on `origin` looking as though it is not.
 */

const ref = (name: string, kind: GitRef["kind"], head = false): GitRef =>
  head ? { name, kind, head } : { name, kind }
const names = (refs: GitRef[]) =>
  chipsOf(refs)
    .map(
      (chip) =>
        chip.name + (chip.remotes.length ? `[${chip.remotes.join(",")}]` : "")
    )
    .join(" ")

section("folding")

check(
  "a pushed branch is one chip, marked with its remote",
  names([ref("main", "branch", true), ref("origin/main", "remote")]) ===
    "main[origin/main]"
)
check(
  "on every remote that has it",
  names([
    ref("main", "branch"),
    ref("origin/main", "remote"),
    ref("upstream/main", "remote"),
  ]) === "main[origin/main,upstream/main]"
)
check(
  "a remote branch with no local of its name keeps its own chip",
  names([ref("main", "branch"), ref("origin/feat", "remote")]) ===
    "main origin/feat"
)
check(
  "and a local branch whose name has a slash is matched whole",
  names([ref("backup/x", "branch"), ref("origin/backup/x", "remote")]) ===
    "backup/x[origin/backup/x]"
)
check(
  "a remote's HEAD pointer is dropped",
  names([
    ref("v0.0.3", "tag"),
    ref("origin/main", "remote"),
    ref("origin/HEAD", "remote"),
  ]) === "origin/main v0.0.3"
)

section("order")

check(
  "checked out first, then branches, remotes and tags",
  names([
    ref("v1", "tag"),
    ref("origin/x", "remote"),
    ref("feat", "branch"),
    ref("main", "branch", true),
  ]) === "main feat origin/x v1"
)
check(
  "a detached HEAD leads",
  chipsOf([ref("v1", "tag"), ref("HEAD", "head", true)])[0]?.kind === "head"
)
check("no refs, no chips", chipsOf([]).length === 0)

finish()
