import {
  DIFF_REVEAL_STEP,
  NOTHING_REVEALED,
  oneClickLeft,
  remaining,
  revealed,
} from "../src/renderer/lib/files/diff-folds"
import { check, finish, section } from "./harness"

/**
 * The unchanged run between two hunks, expanded a step at a time —
 * `lib/files/diff-folds.ts`. Lines 10 to 60 are fifty-one lines, enough for
 * more than two steps, which is where the off-by-one would show.
 */
const fold = { from: 10, to: 60 }

section("a fold opens from either end, one step at a time")

const up = revealed(fold, NOTHING_REVEALED, "fromAbove")
check("up shows one step from the top", up.above === DIFF_REVEAL_STEP)
check("up leaves the bottom alone", up.below === 0)
check(
  "what is left after up is the rest of the run",
  JSON.stringify(remaining(fold, up)) === JSON.stringify({ from: 30, to: 60 })
)

const down = revealed(fold, NOTHING_REVEALED, "fromBelow")
check("down shows one step from the bottom", down.below === DIFF_REVEAL_STEP)
check(
  "what is left after down is the top of the run",
  JSON.stringify(remaining(fold, down)) === JSON.stringify({ from: 10, to: 40 })
)

const twice = revealed(fold, up, "fromBelow")
check("up then down keeps both ends", twice.above === 20 && twice.below === 20)

section("a click past what is left shows what is left, and no more")

const nearly = { above: 40, below: 0 }
const last = revealed(fold, nearly, "fromAbove")
check("the last partial step shows only what is there", last.above === 51)
check("a fully shown fold is no longer folded", remaining(fold, last) === null)
check(
  "a click on an open fold changes nothing",
  revealed(fold, last, "fromBelow") === last
)

check(
  "all shows the whole run from either side",
  remaining(fold, revealed(fold, up, "all")) === null
)

section("a fold no bigger than a step has one control")

check(
  "a run of one step or less opens in one click",
  oneClickLeft({ from: 1, to: DIFF_REVEAL_STEP }, NOTHING_REVEALED)
)
check(
  "a run of more than a step has two",
  !oneClickLeft(fold, NOTHING_REVEALED)
)
check(
  "what is left of a run can drop under a step",
  oneClickLeft(fold, { above: 25, below: 20 })
)
check("a fully shown run has nothing left", !oneClickLeft(fold, last))

finish()
