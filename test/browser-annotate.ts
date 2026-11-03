/**
 * The annotation toolbar's model (`lib/browser/annotate.ts`): undo and redo
 * through every step including `Clear`, what is dropped as a stray click, and
 * the numbers picked elements carry on the picture.
 *
 *   bun test/browser-annotate.ts
 */
import {
  add,
  clear,
  elementNumbers,
  emptySketch,
  isTrivial,
  redo,
  undo,
  type Mark,
} from "../src/renderer/lib/browser/annotate"
import { check, finish, section } from "./harness"

const pen: Mark = {
  kind: "pen",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  color: "#ef4444",
  width: 4,
}
const box: Mark = {
  kind: "rect",
  from: { x: 0, y: 0 },
  to: { x: 40, y: 20 },
  color: "#ef4444",
  width: 4,
}
const element = (selector: string, text: string): Mark => ({
  kind: "element",
  element: { rect: { x: 0, y: 0, width: 10, height: 10 }, selector, text },
  color: "#3b82f6",
})

section("undo and redo")
{
  let sketch = add(add(emptySketch, pen), box)
  check("two marks", sketch.present.length === 2)
  sketch = undo(sketch)
  check("undo takes the last off", sketch.present.length === 1)
  sketch = redo(sketch)
  check("redo puts it back", sketch.present.at(-1) === box)
  sketch = clear(sketch)
  check("clear empties it", sketch.present.length === 0)
  sketch = undo(sketch)
  check("and is undone like any step", sketch.present.length === 2)
  sketch = add(undo(sketch), pen)
  check("a new mark drops what could be redone", sketch.future.length === 0)
  check(
    "undo with nothing to undo is the same sketch",
    undo(emptySketch) === emptySketch
  )
  check(
    "clear with nothing drawn is no step",
    clear(emptySketch) === emptySketch
  )
}

section("stray strokes")
{
  check("a click with the pen", isTrivial({ ...pen, points: [{ x: 1, y: 1 }] }))
  check("a shape dragged nowhere", isTrivial({ ...box, to: { x: 1, y: 2 } }))
  check(
    "empty text",
    isTrivial({
      kind: "text",
      at: { x: 0, y: 0 },
      text: "  ",
      color: "#000",
      width: 2,
    })
  )
  check("a real stroke is kept", !isTrivial(pen) && !isTrivial(box))
}

section("numbers on the picture")
{
  const first = element("#login > button.primary", "Sign in")
  const second = element("nav > a:nth-of-type(2)", "")
  const numbers = elementNumbers([pen, first, box, second])
  check(
    "elements are numbered in the order picked, drawings are not",
    numbers.get(first) === 1 && numbers.get(second) === 2 && !numbers.has(pen)
  )
}

finish()
