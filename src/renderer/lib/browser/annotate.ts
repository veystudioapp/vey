import type { PickedElement } from "@shared/browser"

/**
 * The annotation toolbar over a tab of the chat's browser: what is drawn, its
 * undo, and how it is painted — once over the live page and once over the
 * capture that goes to the chat, by the same function so the two cannot
 * disagree. Pure (`test/browser-annotate.ts`); `chat/browser-annotate.tsx`
 * is the drawing.
 *
 * Every point is in the page's CSS pixels from the viewport's corner, which is
 * what `browserInspect` answers in too; `scale` maps them onto the capture,
 * which is in device pixels.
 */

export type Tool = "select" | "pen" | "rect" | "ellipse" | "arrow" | "text"
export type Shape = "rect" | "ellipse" | "arrow"
export type Point = { x: number; y: number }

export type Mark =
  | { kind: "pen"; points: Point[]; color: string; width: number }
  | { kind: Shape; from: Point; to: Point; color: string; width: number }
  | { kind: "text"; at: Point; text: string; color: string; width: number }
  | { kind: "element"; element: PickedElement; color: string }

export const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#111827",
  "#ffffff",
] as const

/** Thin, medium, thick — a stroke's width, and a text's size with it. */
export const WIDTHS = [2, 4, 8] as const

/** What has been drawn, with the states before and after it for undo. A
 * whole list per step rather than an operation, because `Clear` has to be
 * undoable too and a list is the one shape every step shares. */
export type Sketch = { past: Mark[][]; present: Mark[]; future: Mark[][] }

export const emptySketch: Sketch = { past: [], present: [], future: [] }

export function commit(sketch: Sketch, present: Mark[]): Sketch {
  return { past: [...sketch.past, sketch.present], present, future: [] }
}

export const add = (sketch: Sketch, mark: Mark): Sketch =>
  commit(sketch, [...sketch.present, mark])

export const clear = (sketch: Sketch): Sketch =>
  sketch.present.length === 0 ? sketch : commit(sketch, [])

export function undo(sketch: Sketch): Sketch {
  const previous = sketch.past.at(-1)
  if (!previous) return sketch
  return {
    past: sketch.past.slice(0, -1),
    present: previous,
    future: [sketch.present, ...sketch.future],
  }
}

export function redo(sketch: Sketch): Sketch {
  const [next, ...rest] = sketch.future
  if (!next) return sketch
  return { past: [...sketch.past, sketch.present], present: next, future: rest }
}

/** The text a text mark is drawn at — larger than the stroke it shares a
 * width with, which would be unreadable at 2. */
export const textSize = (width: number): number => 12 + width * 2

/** A stroke too small to be meant — a click with the pen, a shape dragged
 * nowhere — which is dropped rather than kept as a dot. */
export function isTrivial(mark: Mark): boolean {
  if (mark.kind === "pen") return mark.points.length < 2
  if (
    mark.kind === "rect" ||
    mark.kind === "ellipse" ||
    mark.kind === "arrow"
  ) {
    return (
      Math.abs(mark.to.x - mark.from.x) < 3 &&
      Math.abs(mark.to.y - mark.from.y) < 3
    )
  }
  if (mark.kind === "text") return !mark.text.trim()
  return false
}

/** The numbers element marks are labelled with on the picture, in the order
 * they were picked — what somebody writing about it can refer to. */
export function elementNumbers(marks: Mark[]): Map<Mark, number> {
  const numbers = new Map<Mark, number>()
  for (const mark of marks) {
    if (mark.kind === "element") numbers.set(mark, numbers.size + 1)
  }
  return numbers
}

/** Paints marks — every one, then the stroke still being drawn and the
 * element under the pointer, which are not marks yet. */
export function paint(
  context: CanvasRenderingContext2D,
  marks: Mark[],
  scale: number,
  extra: { draft?: Mark | null; hover?: PickedElement | null } = {}
): void {
  const numbers = elementNumbers(marks)
  context.save()
  context.scale(scale, scale)
  context.lineCap = "round"
  context.lineJoin = "round"
  for (const mark of marks) paintMark(context, mark, numbers.get(mark))
  if (extra.draft) paintMark(context, extra.draft, undefined)
  if (extra.hover) {
    const { x, y, width, height } = extra.hover.rect
    context.fillStyle = "rgba(59, 130, 246, 0.12)"
    context.fillRect(x, y, width, height)
    context.strokeStyle = "rgba(59, 130, 246, 0.9)"
    context.lineWidth = 1.5
    context.strokeRect(x, y, width, height)
  }
  context.restore()
}

function paintMark(
  context: CanvasRenderingContext2D,
  mark: Mark,
  number: number | undefined
): void {
  context.strokeStyle = mark.color
  context.fillStyle = mark.color
  switch (mark.kind) {
    case "pen": {
      context.lineWidth = mark.width
      context.beginPath()
      mark.points.forEach((point, index) =>
        index === 0
          ? context.moveTo(point.x, point.y)
          : context.lineTo(point.x, point.y)
      )
      context.stroke()
      return
    }
    case "rect": {
      context.lineWidth = mark.width
      const { x, y, width, height } = boxOf(mark.from, mark.to)
      context.strokeRect(x, y, width, height)
      return
    }
    case "ellipse": {
      context.lineWidth = mark.width
      const { x, y, width, height } = boxOf(mark.from, mark.to)
      context.beginPath()
      context.ellipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2
      )
      context.stroke()
      return
    }
    case "arrow": {
      context.lineWidth = mark.width
      const { from, to } = mark
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const head = 8 + mark.width * 2
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
      context.beginPath()
      context.moveTo(to.x, to.y)
      context.lineTo(
        to.x - head * Math.cos(angle - Math.PI / 6),
        to.y - head * Math.sin(angle - Math.PI / 6)
      )
      context.lineTo(
        to.x - head * Math.cos(angle + Math.PI / 6),
        to.y - head * Math.sin(angle + Math.PI / 6)
      )
      context.closePath()
      context.fill()
      return
    }
    case "text": {
      const size = textSize(mark.width)
      context.font = `600 ${size}px system-ui, -apple-system, sans-serif`
      context.textBaseline = "top"
      // A halo, so the words read over whatever the page has under them.
      context.lineWidth = 3
      context.strokeStyle =
        mark.color === "#ffffff" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)"
      mark.text.split("\n").forEach((line, index) => {
        const y = mark.at.y + index * size * 1.25
        context.strokeText(line, mark.at.x, y)
        context.fillText(line, mark.at.x, y)
      })
      return
    }
    case "element": {
      const { x, y, width, height } = mark.element.rect
      context.lineWidth = 2
      context.setLineDash([6, 4])
      context.strokeRect(x, y, width, height)
      context.setLineDash([])
      if (number !== undefined) {
        // The number the message's list refers to, on the element's corner.
        const label = String(number)
        context.font = "700 11px system-ui, -apple-system, sans-serif"
        const badge = Math.max(18, context.measureText(label).width + 10)
        const top = Math.max(0, y - 9)
        const left = Math.max(0, x - 9)
        context.beginPath()
        context.roundRect(left, top, badge, 18, 9)
        context.fill()
        context.fillStyle = mark.color === "#ffffff" ? "#111827" : "#ffffff"
        context.textAlign = "center"
        context.textBaseline = "middle"
        context.fillText(label, left + badge / 2, top + 9.5)
        context.textAlign = "start"
      }
      return
    }
  }
}

function boxOf(from: Point, to: Point) {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  }
}
