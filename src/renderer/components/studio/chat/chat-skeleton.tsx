import { useEffect, useState } from "react"
import type { TurnUsage } from "@shared/api"

import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { elapsed } from "@/lib/chat/since"
import { usageDetail, usageLine } from "@/lib/chat/usage"

import {
  MARK_STEP,
  MARK_STROKE,
  MARK_STUB_LOWER,
  MARK_STUB_UPPER,
  MARK_VIEWBOX,
} from "../mark"

/**
 * What the chat pane shows while a turn is being sent: the loader, and how long
 * it has been going. Placeholder bars mimicking a turn's shape were tried here
 * and read as content arriving that never did — the rows a turn actually draws
 * land within a second of the spinner anyway.
 *
 * The loader is the mark drawing itself and a light passing over
 * `Working…` (`styles/motion.css`). It was a GIF swordsman for a while, then a
 * stock spinner, then three dots — `docs/design.md` § The chat's loading
 * indicator has why.
 *
 * Which subagents are running is not said here — each one's row in the
 * transcript spins and counts its calls, so the loader stays one line however
 * wide a turn fans out.
 */
export function ChatSkeleton({
  startedAt,
  live,
}: {
  startedAt?: number
  /** The running turn's spend so far — see `live` in the chat store. */
  live?: TurnUsage
}) {
  const t = useT()
  return (
    <div
      className={cn(
        LOADER_H,
        "flex min-w-0 items-center gap-2 px-1 text-xs text-muted-foreground"
      )}
    >
      <WorkingMark />
      <span className="text-shimmer shrink-0">
        {t("transcript.skeleton.working")}
      </span>
      {startedAt !== undefined && <Elapsed startedAt={startedAt} />}
      {/* The model and the tokens while they are still moving, in the turn
          line's own words, so the row under the answer reads as this one
          arriving early. */}
      {live && (
        <span
          title={usageDetail(live)}
          className="truncate text-muted-foreground/50 tabular-nums"
        >
          {usageLine(live)}
        </span>
      )}
    </div>
  )
}

/** The loader's row height, shared by the dots' box so they centre on it. */
const LOADER_H = "h-5"

/**
 * The mark drawing itself — the step first, left to right and up onto the
 * next lane, then the two stubs — holding a beat, and wiping off from where
 * it started (`.mark-trace` in `styles/motion.css`). A faint copy sits under
 * it so the row keeps its shape between the wipe and the next stroke. All in
 * `currentColor`, for the reason `Wordmark` gives: the mark is black and
 * white, and the text's ink is the one that is right in either theme.
 */
function WorkingMark() {
  const t = useT()
  return (
    <div
      role="status"
      aria-label={t("transcript.skeleton.workingLabel")}
      className={cn(LOADER_H, "flex shrink-0 items-center px-0.5")}
    >
      <svg
        viewBox={MARK_VIEWBOX}
        fill="none"
        aria-hidden
        className="mark-trace"
        stroke="currentColor"
        strokeWidth={MARK_STROKE}
      >
        <g className="mark-trace-ghost">
          <path d={MARK_STEP} />
          <path d={MARK_STUB_UPPER} />
          <path d={MARK_STUB_LOWER} />
        </g>
        <path className="mark-trace-step" d={MARK_STEP} pathLength={100} />
        <path
          className="mark-trace-stub"
          d={MARK_STUB_UPPER}
          pathLength={100}
        />
        <path
          className="mark-trace-stub"
          d={MARK_STUB_LOWER}
          pathLength={100}
        />
      </svg>
    </div>
  )
}

/**
 * The running clock beside `Working…`.
 *
 * Its own component so the tick re-renders this line and not the transcript
 * above it — a pane of rendered markdown redrawn once a second is the whole
 * chat's worth of work for two changing characters.
 *
 * A second is also the resolution the label has, so a faster interval would
 * only produce renders that draw the same string. `tabular-nums` keeps a digit
 * changing from nudging the ones beside it.
 */
export function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())

  // `now` is an absolute time rather than a duration, so it does not need
  // resetting when `startedAt` changes — the next tick is at most a second away
  // and the label's resolution is a second.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className="text-muted-foreground/50 tabular-nums">
      {elapsed(startedAt, now)}
    </span>
  )
}

/**
 * Skeleton for a chat whose lines are still being read off disk — opening a
 * conversation for the first time this run.
 *
 * A different shape from `ChatSkeleton`, which is one turn being worked on at
 * the end of a transcript: this stands in for a whole conversation, so it is
 * alternating bubbles down the pane and says nothing about "working". Without
 * it the pane drew the welcome — "this chat is empty, ask it something" — for
 * the moment before the lines landed, which is the wrong thing to say about a
 * chat that has a hundred of them.
 */
export function ChatTranscriptSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      {[0, 1, 2].map((turn) => (
        <div key={turn} className="flex flex-col gap-3">
          {/* The user's message: short, and to the right, as a real one is. */}
          <div className="flex justify-end">
            <SkeletonBlock
              lines={1}
              className="w-2/5"
              barClassName="h-8 rounded-lg"
            />
          </div>
          <SkeletonBlock
            lines={turn === 1 ? 4 : 3}
            className="ml-4"
            barClassName="h-3 rounded last:w-2/3"
          />
        </div>
      ))}
    </div>
  )
}

/**
 * A vertical stack of placeholder bars, each pulsing at the same rate.
 */
function SkeletonBlock({
  lines,
  className,
  barClassName,
}: {
  lines: number
  className?: string
  barClassName?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn("w-full bg-muted/50", barClassName ?? "h-3 rounded")}
        />
      ))}
    </div>
  )
}
