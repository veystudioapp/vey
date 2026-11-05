import {
  commitGraph,
  graphSegments,
  graphWidth,
} from "../src/renderer/lib/files/commit-graph"
import { check, finish, section } from "./harness"

/**
 * The `Commits` graph's lanes: which column each dot sits in and which lines
 * cross its row.
 *
 * What is worth a test is the line that goes to the wrong place without
 * anything failing — a merge's second parent drawn into a lane that is not
 * waiting for it, a branch that never rejoins its base, a lane left open for a
 * parent already drawn above. A graph like that is still a picture, and nobody
 * checks a picture against `git log --graph` by eye.
 */

const c = (hash: string, ...parents: string[]) => ({ hash, parents })
const pairs = (edges: { from: number; to: number }[]) =>
  edges.map((edge) => `${edge.from}>${edge.to}`).join(" ")

section("a straight line")

const line = commitGraph([c("c", "b"), c("b", "a"), c("a")])
check(
  "is one column",
  line.every((row) => row.column === 0) && graphWidth(line) === 1,
  line
)
check(
  "with nothing above the newest and nothing below the root",
  line[0]!.top.length === 0 && line[2]!.bottom.length === 0,
  line
)
check(
  "and one colour all the way down",
  new Set(line.map((row) => row.color)).size === 1
)

section("a merge")

//   m       merge of f into b
//   | \
//   |  f
//   b  |
//   | /
//   a
const merge = commitGraph([c("m", "b", "f"), c("f", "a"), c("b", "a"), c("a")])
check(
  "opens a second lane for the merged branch",
  pairs(merge[0]!.bottom) === "0>0 0>1",
  merge[0]
)
check(
  "and draws its commits in it",
  merge[1]!.column === 1 && merge[2]!.column === 0,
  merge.map((row) => row.column)
)
check(
  "in a colour of its own",
  merge[1]!.color !== merge[2]!.color,
  merge.map((row) => row.color)
)
check(
  "until both lanes meet at the base",
  merge[3]!.column === 0 && pairs(merge[3]!.top) === "0>0 1>0",
  merge[3]
)
check("two columns wide", graphWidth(merge) === 2)

section("two tips off one base")

const tips = commitGraph([c("x", "a"), c("y", "a"), c("a")])
check(
  "a second tip opens beside the first",
  tips[0]!.column === 0 && tips[1]!.column === 1,
  tips.map((row) => row.column)
)
check("and comes in from nowhere", pairs(tips[1]!.top) === "0>0", tips[1])
check("both bend into the base", pairs(tips[2]!.top) === "0>0 1>0", tips[2])

section("a lane is reused")

const reused = commitGraph([
  c("m", "b", "f"),
  c("f", "b"),
  c("b", "a"),
  c("t", "a"),
  c("a"),
])
check(
  "once the branch in it has ended",
  reused[3]!.column === 1,
  reused.map((row) => row.column)
)

section("a merge into a lane already waiting")

// Both merges bring in `f`: the second should join the lane the first opened,
// not open a third.
const twice = commitGraph([
  c("m2", "m1", "f"),
  c("m1", "b", "f"),
  c("f", "b"),
  c("b"),
])
check(
  "joins it rather than opening another",
  pairs(twice[1]!.bottom) === "1>1 0>0 0>1" && graphWidth(twice) === 2,
  twice[1]
)

section("a parent listed above its child")

// A skewed clock: `p` printed before `k`, its child.
const skewed = commitGraph([c("p"), c("k", "p"), c("z")])
check(
  "leaves no lane waiting for it",
  skewed[1]!.bottom.length === 0 && skewed[2]!.top.length === 0,
  skewed
)

section("the end of a page")

const page = commitGraph([c("m", "b", "f"), c("b", "a")])
check(
  "runs the lanes off the bottom",
  pairs(page[1]!.bottom) === "1>1 0>0",
  page[1]
)

section("drawn in one piece")

const lines = (rows: ReturnType<typeof commitGraph>) =>
  graphSegments(rows)
    .map((line) => `${line.row}:${line.from}>${line.to}`)
    .join(" ")

check(
  "a straight line is one segment per gap, and one off the end",
  lines(commitGraph([c("c", "b"), c("b", "a")])) === "0:0>0 1:0>0",
  graphSegments(commitGraph([c("c", "b"), c("b", "a")]))
)
check(
  "a merge's second parent bends across the whole gap to its lane",
  lines(merge) === "0:0>0 0:0>1 1:0>0 1:1>1 2:1>0 2:0>0",
  graphSegments(merge)
)
check(
  "and a lane meeting its base bends across the gap above the base",
  graphSegments(merge).some(
    (line) => line.row === 2 && line.from === 1 && line.to === 0
  )
)
check(
  "the merged branch's line keeps the branch's colour",
  graphSegments(merge).find((line) => line.row === 0 && line.to === 1)
    ?.color === merge[1]!.color
)

finish()
