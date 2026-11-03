import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"
import { Mark } from "./mark"

/**
 * "Vey" as the brand writes it: the mark, then the name in the
 * surrounding type. The mark is `Mark`, which is `resources/mark.svg` — the
 * app icon with its plate taken away.
 *
 * Sized in `em` and sat on the baseline, so it is about the cap height of
 * whatever text it is set in and needs no size of its own. In `currentColor`:
 * the mark is black and white, and black here would vanish on the dark
 * theme, so it takes the ink of the text it is set in — which is the black
 * of `mark.svg` on the light one.
 */
export function Wordmark({
  className,
  textClassName,
  style,
}: {
  className?: string
  style?: CSSProperties
  /** For the name alone — the splash's faded gradient text, say. */
  textClassName?: string
}) {
  return (
    <span
      className={cn("inline-flex items-baseline gap-[0.22em]", className)}
      style={style}
      aria-label="Vey"
      role="img"
    >
      <Mark className="h-[0.72em] w-auto shrink-0 self-baseline" />
      <span aria-hidden className={textClassName}>
        Vey
      </span>
    </span>
  )
}
