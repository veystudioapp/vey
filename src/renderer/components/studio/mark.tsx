/**
 * The app's mark, `resources/mark.svg` path for path, for the wordmark, the
 * system bar and the chat's `Working…` (`chat-skeleton.tsx`), which draws it
 * stroke by stroke. A lane stepping up onto the next, the lane it joined
 * running on to the left and the one it left to the right: the switch that
 * does not stop. Three elements rather than one path with moves in it: each
 * carries its own `pathLength={100}` and keyframe there, so the step is drawn
 * and then the two stubs without depending on whether a dash pattern restarts
 * at a subpath, which engines have disagreed on.
 *
 * The box is the ink's measured bounds, the stroke's own half-width included.
 */
export const MARK_VIEWBOX = "6 21.5 88 57"
export const MARK_STEP = "M6 72H34L62 28H94"
export const MARK_STUB_UPPER = "M6 28H22"
export const MARK_STUB_LOWER = "M78 72H94"
export const MARK_STROKE = 13

/** The mark alone, in `currentColor`, sized by its caller. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth={MARK_STROKE}>
        <path d={MARK_STEP} />
        <path d={MARK_STUB_UPPER} />
        <path d={MARK_STUB_LOWER} />
      </g>
    </svg>
  )
}
