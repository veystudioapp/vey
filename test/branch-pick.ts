import type { GitLogScope } from "../src/shared/api"
import {
  PICK_ALL,
  PICK_HEAD,
  picksOf,
  scopeOfPicks,
  shortRef,
} from "../src/renderer/lib/files/branch-pick"
import { check, finish, section } from "./harness"

/**
 * The `Git Graph` tab's branch list: which ticks become which scope.
 *
 * The rules are the kind that read as obvious and break quietly — a branch
 * ticked while `Show All` is ticked has to *replace* it, not join it, or the
 * graph keeps drawing everything and the tick looks broken; and the last tick
 * taken off must not leave a scope of nothing, which git would answer with an
 * empty log.
 */

const ALL: GitLogScope = { kind: "all", remotes: true }
const MAIN = "refs/heads/main"
const FEAT = "refs/heads/feat"
const ORIGIN = "refs/remotes/origin/main"
const same = (a: GitLogScope, b: GitLogScope) =>
  JSON.stringify(a) === JSON.stringify(b)

section("ticking")

check(
  "a branch while Show All is ticked replaces it",
  same(scopeOfPicks(ALL, [PICK_ALL, MAIN]), { kind: "branches", refs: [MAIN] })
)
check(
  "a second branch joins the first",
  same(scopeOfPicks({ kind: "branches", refs: [MAIN] }, [MAIN, ORIGIN]), {
    kind: "branches",
    refs: [MAIN, ORIGIN],
  })
)
check(
  "Show All clears the branches",
  same(
    scopeOfPicks({ kind: "branches", refs: [MAIN, FEAT] }, [
      MAIN,
      FEAT,
      PICK_ALL,
    ]),
    ALL
  )
)
check(
  "Current branch clears them too",
  same(scopeOfPicks({ kind: "branches", refs: [MAIN] }, [MAIN, PICK_HEAD]), {
    kind: "head",
  })
)
check(
  "a branch while Current branch is ticked replaces it",
  same(scopeOfPicks({ kind: "head" }, [PICK_HEAD, FEAT]), {
    kind: "branches",
    refs: [FEAT],
  })
)

section("unticking")

check(
  "one of two leaves the other",
  same(scopeOfPicks({ kind: "branches", refs: [MAIN, FEAT] }, [FEAT]), {
    kind: "branches",
    refs: [FEAT],
  })
)
check(
  "the last branch falls back to every branch",
  same(scopeOfPicks({ kind: "branches", refs: [MAIN] }, []), ALL)
)
check(
  "and so does Show All itself, rather than a graph of nothing",
  same(scopeOfPicks(ALL, []), ALL)
)
check(
  "and back to every branch is with the remotes",
  same(scopeOfPicks({ kind: "branches", refs: [MAIN] }, [MAIN, PICK_ALL]), ALL)
)

section("reading a scope back")

check(
  "into its ticks",
  picksOf(ALL).join() === PICK_ALL &&
    picksOf({ kind: "head" }).join() === PICK_HEAD &&
    picksOf({ kind: "branches", refs: [MAIN, FEAT] }).join() ===
      `${MAIN},${FEAT}`
)
check(
  "and a ref into the name a reader knows",
  shortRef(MAIN) === "main" && shortRef(ORIGIN) === "origin/main"
)

finish()
