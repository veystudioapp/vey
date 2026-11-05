/**
 * The graph beside the `Commits` list: which column each commit's dot sits in,
 * and which lines cross its row.
 *
 * A row is drawn in two halves around its dot. `top` is what comes in from the
 * row above — a lane passing straight down, or a child's lane bending into this
 * commit — and `bottom` is what leaves for the row below: a lane passing
 * through, this commit's line to its first parent, and a merge's lines out to
 * its other parents. Each half is a list of `from` → `to` columns, so a row can
 * be drawn on its own, at whatever height it happens to be, without knowing the
 * rows around it.
 *
 * Pure, and over the commits as listed — newest first, a page at a time — so
 * the last row's lanes simply run off the bottom until `Show more` reads the
 * parents they were waiting for (`test/commit-graph.ts`).
 */

export type GraphEdge = {
  from: number
  to: number
  /** An index into the lane palette — see `laneColor` where it is drawn. */
  color: number
}

export type GraphRow = {
  /** The dot's column. */
  column: number
  color: number
  /** From the row's top edge into the dot (or straight past it). */
  top: GraphEdge[]
  /** From the dot's height to the row's bottom edge. */
  bottom: GraphEdge[]
}

/** Each lane waits for one commit — the parent of whatever was drawn in it
 * last — and keeps the colour it was opened with until it ends. */
type Lane = { hash: string; color: number } | null

export function commitGraph(
  commits: readonly { hash: string; parents: readonly string[] }[]
): GraphRow[] {
  let lanes: Lane[] = []
  let nextColor = 0
  /** Drawn already. A parent listed above its child — git's default order
   * follows commit dates, and two machines' clocks can disagree — gets no lane,
   * since one waiting for it would run to the bottom of the list. */
  const drawn = new Set<string>()
  const rows: GraphRow[] = []

  const free = () => {
    const open = lanes.indexOf(null)
    return open === -1 ? lanes.length : open
  }

  for (const commit of commits) {
    drawn.add(commit.hash)

    // The leftmost lane waiting for this commit is where it is drawn; any
    // others waiting for it (two branches off one commit) bend into it.
    let column = lanes.findIndex((lane) => lane?.hash === commit.hash)
    const tip = column === -1
    if (tip) column = free()
    const color = tip ? nextColor++ : lanes[column]!.color

    const top: GraphEdge[] = []
    lanes.forEach((lane, index) => {
      if (!lane) return
      top.push({
        from: index,
        to: lane.hash === commit.hash ? column : index,
        color: lane.color,
      })
    })
    lanes = lanes.map((lane) => (lane?.hash === commit.hash ? null : lane))

    const bottom: GraphEdge[] = []
    lanes.forEach((lane, index) => {
      if (lane) bottom.push({ from: index, to: index, color: lane.color })
    })

    const parents = commit.parents.filter((parent) => !drawn.has(parent))
    commit.parents.forEach((parent, index) => {
      if (!parents.includes(parent)) return
      if (index === 0) {
        // The first parent stays in this column even when another lane is
        // already waiting for it: the two meet at the parent, which is the
        // shape `git log --graph` gives a branch and its base.
        lanes[column] = { hash: parent, color }
        bottom.push({ from: column, to: column, color })
        return
      }
      // A merge's other parents join a lane already waiting for them rather
      // than opening a second one beside it.
      const waiting = lanes.findIndex((lane) => lane?.hash === parent)
      if (waiting !== -1) {
        bottom.push({ from: column, to: waiting, color: lanes[waiting]!.color })
        return
      }
      const lane = free()
      const opened = nextColor++
      lanes[lane] = { hash: parent, color: opened }
      bottom.push({ from: column, to: lane, color: opened })
    })

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    rows.push({ column, color, top, bottom })
  }

  return rows
}

/** How many columns the graph needs to draw every row of it. */
export function graphWidth(rows: readonly GraphRow[]): number {
  let width = 0
  for (const row of rows) {
    width = Math.max(width, row.column + 1)
    for (const edge of [...row.top, ...row.bottom]) {
      width = Math.max(width, edge.from + 1, edge.to + 1)
    }
  }
  return width
}

/** A line from one row's dot height to the next row's, in two columns. */
export type GraphSegment = {
  /** The row it starts at; it ends at `row + 1`. */
  row: number
  from: number
  to: number
  color: number
}

/**
 * The graph as lines from dot height to dot height, for drawing in one piece.
 *
 * A row's `bottom` and the next row's `top` meet at the boundary between them
 * in the same column, so each pair is one line: a branch leaving a merge bends
 * across the whole gap to the next row rather than within half of it, which is
 * what made a row-by-row drawing look kinked. The last row's lines run one
 * gap past it — off the page, to parents `Show more` has not read.
 */
export function graphSegments(rows: readonly GraphRow[]): GraphSegment[] {
  const segments: GraphSegment[] = []
  rows.forEach((row, index) => {
    const next = rows[index + 1]
    for (const edge of row.bottom) {
      const onward = next?.top.find((candidate) => candidate.from === edge.to)
      segments.push({
        row: index,
        from: edge.from,
        to: onward ? onward.to : edge.to,
        // A lane bending into the next dot keeps its own colour until it
        // arrives; one leaving this dot for a new lane takes that lane's.
        color:
          edge.from === row.column ? edge.color : (onward?.color ?? edge.color),
      })
    }
  })
  return segments
}
