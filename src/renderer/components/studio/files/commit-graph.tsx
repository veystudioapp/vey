import { graphSegments, type GraphRow } from "@/lib/files/commit-graph"

/** One lane's width. */
const LANE = 12
/** Space either side of the lanes. */
const INSET = 4

/** What the working tree's own row is drawn in: not a lane's colour, since it
 * is not a commit on any branch yet. */
const UNCOMMITTED = "var(--muted-foreground)"

/**
 * The lanes' colours. Fixed hues rather than the palette's chart colours, which
 * some palettes make greys — two branches are told apart by hue or not at all.
 * The first lane — the newest commit's, usually the checked-out branch — is
 * the palette's own primary.
 */
const LANE_COLORS = [
  "oklch(0.62 0.17 255)",
  "oklch(0.7 0.16 55)",
  "oklch(0.64 0.15 150)",
  "oklch(0.62 0.2 305)",
  "oklch(0.64 0.2 10)",
  "oklch(0.66 0.11 195)",
  "oklch(0.72 0.14 95)",
]

function laneColor(index: number): string {
  if (index === 0) return "var(--primary)"
  return LANE_COLORS[(index - 1) % LANE_COLORS.length]!
}

const x = (column: number) => INSET + column * LANE + LANE / 2

/** How wide the graph column is for a list `lanes` lanes wide, past `max`
 * cut off rather than pushing the descriptions off the tab. */
export function graphPixels(lanes: number, max: number): number {
  return INSET * 2 + Math.min(lanes, max) * LANE
}

/** A row of the `Git Graph` tab, which has every row the same height — what
 * lets its graph be one drawing rather than a slice per row. */
export const GRAPH_ROW = 28

/**
 * The whole graph as one SVG, laid over the left of a list of `GRAPH_ROW`-high
 * rows: every line from one dot to the next, curving across the whole gap
 * between them, and the dots on top.
 *
 * One drawing rather than a slice per row, which is what the graph was first:
 * a slice can only bend inside its own half row, so a branch leaving a merge
 * turned in 14px, and two slices meet at a seam. The paths are grouped
 * by colour, so a list of a thousand commits is a handful of `path`s and its
 * dots, not three elements a row.
 */
export function CommitGraphCanvas({
  rows,
  merges,
  pixels,
  uncommitted = false,
  selected = -1,
}: {
  rows: readonly GraphRow[]
  /** Which rows are merges, drawn as rings. */
  merges: readonly boolean[]
  pixels: number
  /** Whether row 0 is the working tree's rather than a commit. */
  uncommitted?: boolean
  /** The row whose dot is drawn larger, or -1. */
  selected?: number
}) {
  const y = (row: number) => row * GRAPH_ROW + GRAPH_ROW / 2
  const byColor = new Map<number, string[]>()
  const dashed: string[] = []

  for (const segment of graphSegments(rows)) {
    const x0 = x(segment.from)
    const x1 = x(segment.to)
    const y0 = y(segment.row)
    const y1 = y(segment.row + 1)
    const d =
      x0 === x1
        ? `M${x0} ${y0}V${y1}`
        : `M${x0} ${y0}C${x0} ${y0 + GRAPH_ROW * 0.6} ${x1} ${y1 - GRAPH_ROW * 0.6} ${x1} ${y1}`
    if (uncommitted && segment.row === 0 && segment.from === rows[0]?.column) {
      dashed.push(d)
      continue
    }
    const list = byColor.get(segment.color) ?? []
    list.push(d)
    byColor.set(segment.color, list)
  }

  return (
    <svg
      aria-hidden
      width={pixels}
      height={rows.length * GRAPH_ROW}
      className="pointer-events-none absolute top-0 left-0"
      fill="none"
      strokeWidth={1.75}
      strokeLinecap="round"
    >
      {[...byColor].map(([color, paths]) => (
        <path key={color} d={paths.join("")} stroke={laneColor(color)} />
      ))}
      {dashed.length > 0 && (
        <path d={dashed.join("")} stroke={UNCOMMITTED} strokeDasharray="2 3" />
      )}
      {rows.map((row, index) => {
        const working = uncommitted && index === 0
        const ring = working || merges[index] === true
        const color = working ? UNCOMMITTED : laneColor(row.color)
        return (
          <circle
            key={index}
            cx={x(row.column)}
            cy={y(index)}
            // Larger, never haloed: a ring of the background round it read
            // as the lane breaking at the commit somebody had just picked.
            r={index === selected ? (ring ? 4.5 : 5) : ring ? 3.5 : 4}
            fill={ring ? "var(--background)" : color}
            stroke={color}
            strokeWidth={ring ? 2 : 0}
          />
        )
      })}
    </svg>
  )
}
