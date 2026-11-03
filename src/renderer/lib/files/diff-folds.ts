/**
 * How much of a folded run of unchanged lines a click has shown — the pure half
 * of `diff-chrome.ts`'s folds, so the arithmetic can be tested without an editor.
 *
 * A fold is the unchanged lines between two hunks. Each click reveals a step of
 * them from one end: the end next to the hunk above (`fromAbove`), or the end next to
 * the hunk below (`fromBelow`). What is left stays folded until nothing is. Expanding
 * the whole thing at once is what `@codemirror/merge` does, and it is what made
 * a long unchanged stretch all-or-nothing.
 */

/** Inclusive line numbers in the new document. */
export type Fold = { from: number; to: number }

/** Lines shown so far, counted from the top and from the bottom of a fold. */
export type Reveal = { above: number; below: number }

export type RevealDir = "fromAbove" | "fromBelow" | "all"

/** Lines one click shows. Twenty is GitHub's step, and enough context to read a
 * change without the whole file arriving. */
export const DIFF_REVEAL_STEP = 20

export const NOTHING_REVEALED: Reveal = { above: 0, below: 0 }

/** What of a fold is still folded, or `null` once every line is shown. */
export function remaining(fold: Fold, reveal: Reveal): Fold | null {
  const from = fold.from + reveal.above
  const to = fold.to - reveal.below
  return from <= to ? { from, to } : null
}

/** The reveal after one click. A click past what is left shows what is left,
 * and a click on a fold that is already open changes nothing. */
export function revealed(
  fold: Fold,
  reveal: Reveal,
  dir: RevealDir,
  step = DIFF_REVEAL_STEP
): Reveal {
  const left = remaining(fold, reveal)
  if (!left) return reveal

  const size = left.to - left.from + 1
  if (dir === "all") return { above: reveal.above + size, below: reveal.below }
  const shown = Math.min(step, size)
  return dir === "fromAbove"
    ? { above: reveal.above + shown, below: reveal.below }
    : { above: reveal.above, below: reveal.below + shown }
}

/** Whether one click can open the whole of what is left. A fold no bigger than
 * a step is opened in one go, so it has one control rather than two. */
export function oneClickLeft(
  fold: Fold,
  reveal: Reveal,
  step = DIFF_REVEAL_STEP
): boolean {
  const left = remaining(fold, reveal)
  return left !== null && left.to - left.from + 1 <= step
}
