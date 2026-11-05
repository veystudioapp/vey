/**
 * The `Git Graph` tab's column widths, and what dragging a border between two
 * columns does to them.
 *
 * Description is the one column that stretches; the four around it are
 * pixels. A drag moves **the border under the pointer** and nothing else: the
 * column on each side of it grows or shrinks by what the other gave up, and
 * where one side is Description, Description takes the difference — so a
 * border never runs ahead of the pointer or lags behind it, which is what
 * resizing only the column to the left did once Description began absorbing.
 * Every column keeps a floor, Description included, so no drag can squeeze a
 * column out of sight (`test/graph-columns.ts`).
 */

export type GraphColumns = {
  /** Null: as wide as the lanes need. */
  graph: number | null
  date: number
  author: number
  commit: number
}

/** The border to the right of each column but the last. */
export type GraphBorder = "graph" | "description" | "date" | "author"

export const DEFAULT_GRAPH_COLUMNS: GraphColumns = {
  graph: null,
  date: 160,
  author: 128,
  commit: 88,
}

/** The narrowest each may be dragged — its heading, roughly, or a sliver of
 * graph that still shows where the lanes are. */
export const MIN_COLUMN = {
  graph: 32,
  description: 120,
  date: 64,
  author: 48,
  commit: 48,
}

/**
 * The widths after `border` is dragged `dx` pixels from where it was when the
 * drag began. `graph` is the graph column's width as drawn (its own or the
 * lanes'), and `description` the width Description had then.
 */
export function moveBorder(
  start: GraphColumns,
  border: GraphBorder,
  dx: number,
  graph: number,
  description: number
): GraphColumns {
  const clamp = (value: number, low: number, high: number) =>
    Math.round(Math.max(low, Math.min(high, value)))
  const spare = description - MIN_COLUMN.description

  switch (border) {
    case "graph": {
      const move = clamp(dx, MIN_COLUMN.graph - graph, spare)
      return { ...start, graph: graph + move }
    }
    case "description": {
      const move = clamp(dx, -spare, start.date - MIN_COLUMN.date)
      return { ...start, date: start.date - move }
    }
    case "date": {
      const move = clamp(
        dx,
        MIN_COLUMN.date - start.date,
        start.author - MIN_COLUMN.author
      )
      return { ...start, date: start.date + move, author: start.author - move }
    }
    case "author": {
      const move = clamp(
        dx,
        MIN_COLUMN.author - start.author,
        start.commit - MIN_COLUMN.commit
      )
      return {
        ...start,
        author: start.author + move,
        commit: start.commit - move,
      }
    }
  }
}

/** Widths read back from settings, any that are missing or nonsense taken
 * from the defaults rather than dropping the whole record. */
export function graphColumnsOf(value: unknown): GraphColumns {
  if (typeof value !== "object" || value === null) return DEFAULT_GRAPH_COLUMNS
  const record = value as Record<string, unknown>
  const width = (key: keyof typeof MIN_COLUMN, fallback: number) => {
    const raw = record[key]
    return typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(MIN_COLUMN[key], Math.round(raw))
      : fallback
  }
  return {
    graph:
      record.graph === null || record.graph === undefined
        ? null
        : width("graph", MIN_COLUMN.graph),
    date: width("date", DEFAULT_GRAPH_COLUMNS.date),
    author: width("author", DEFAULT_GRAPH_COLUMNS.author),
    commit: width("commit", DEFAULT_GRAPH_COLUMNS.commit),
  }
}
