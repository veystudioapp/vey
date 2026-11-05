import {
  DEFAULT_GRAPH_COLUMNS,
  graphColumnsOf,
  MIN_COLUMN,
  moveBorder,
  type GraphColumns,
} from "../src/renderer/lib/files/graph-columns"
import { check, finish, section } from "./harness"

/**
 * Dragging a border in the `Git Graph` tab's header.
 *
 * The failure worth a test is the border that stops following the pointer —
 * a drag that widens one column without narrowing its neighbour pushes every
 * column after it along, and the border under the pointer is no longer the
 * one being dragged — and the column dragged to nothing, which nobody can
 * then find to drag back.
 */

const START: GraphColumns = { graph: null, date: 160, author: 128, commit: 88 }
const GRAPH = 60
const DESCRIPTION = 400
const sum = (columns: GraphColumns) =>
  columns.date + columns.author + columns.commit

section("a border between two fixed columns")

const dateWider = moveBorder(START, "date", 20, GRAPH, DESCRIPTION)
check(
  "widens the one on its left by what it takes from the one on its right",
  dateWider.date === 180 && dateWider.author === 108,
  dateWider
)
check(
  "so the columns after it stay where they were",
  sum(dateWider) === sum(START)
)
check(
  "and stops at the right-hand column's floor",
  moveBorder(START, "author", 500, GRAPH, DESCRIPTION).commit ===
    MIN_COLUMN.commit
)
check(
  "or the left-hand one's",
  moveBorder(START, "date", -500, GRAPH, DESCRIPTION).date === MIN_COLUMN.date
)

section("the borders beside Description")

const dateLeft = moveBorder(START, "description", -30, GRAPH, DESCRIPTION)
check(
  "Description's right border dragged left widens Date",
  dateLeft.date === 190 && dateLeft.author === 128,
  dateLeft
)
check(
  "but never past Description's own floor",
  moveBorder(START, "description", -1000, GRAPH, DESCRIPTION).date ===
    160 + DESCRIPTION - MIN_COLUMN.description
)
const graphWider = moveBorder(START, "graph", 40, GRAPH, DESCRIPTION)
check(
  "the graph's border sets the graph column from the width it was drawn at",
  graphWider.graph === 100,
  graphWider
)
check(
  "down to a sliver, not to nothing",
  moveBorder(START, "graph", -500, GRAPH, DESCRIPTION).graph ===
    MIN_COLUMN.graph
)

section("read back from settings")

check(
  "nothing stored is the defaults",
  JSON.stringify(graphColumnsOf(null)) === JSON.stringify(DEFAULT_GRAPH_COLUMNS)
)
check(
  "a bad width falls back alone, and a tiny one is lifted to its floor",
  JSON.stringify(
    graphColumnsOf({ graph: 2, date: "wide", author: 90, commit: Infinity })
  ) ===
    JSON.stringify({
      graph: MIN_COLUMN.graph,
      date: DEFAULT_GRAPH_COLUMNS.date,
      author: 90,
      commit: DEFAULT_GRAPH_COLUMNS.commit,
    })
)

finish()
