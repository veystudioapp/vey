/**
 * How long ago a chat was last touched, in the width a sidebar row can spare.
 *
 * `9h`, `23h`, `1d` — the form the column needs, which is not the form
 * `Intl.RelativeTimeFormat` gives: "9 hours ago" is the whole row, and the row
 * is already carrying a title that wants every pixel of it. The one in
 * `lib/db/display.ts` is the long form and stays there, since a cell in the data
 * browser has the width and a reader of it wants the sentence.
 *
 * Deliberately coarse, one unit and no decimal. What the label answers is "is
 * this the conversation I was in, or one from last week" — a question a single
 * character of precision settles and a second one only clutters. So 90 minutes
 * is `1h` rather than `1.5h`, and everything past a year is `1y+` rather than a
 * count nobody is comparing.
 *
 * `now` under a minute rather than `0m`: a chat answered while the column is on
 * screen would otherwise draw a zero, which reads as missing data.
 */

import { t, type MessageKey } from "../i18n"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const YEAR = 365 * DAY

export function since(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso)
  // A record written by a build that stored something else here, or a field
  // that never arrived: no label is better than `NaNd` in the corner of a row.
  if (Number.isNaN(at)) return ""

  // Clocks go backwards — a machine correcting its time, a record copied from
  // one that was ahead — and a future timestamp is still "just now" rather than
  // a negative count.
  const ms = Math.max(0, now - at)

  if (ms < MINUTE) return t("transcript.time.now")
  if (ms < HOUR)
    return t("transcript.time.minutes", { n: Math.floor(ms / MINUTE) })
  if (ms < DAY) return t("transcript.time.hours", { n: Math.floor(ms / HOUR) })
  if (ms < WEEK) return t("transcript.time.days", { n: Math.floor(ms / DAY) })
  if (ms < YEAR) return t("transcript.time.weeks", { n: Math.floor(ms / WEEK) })
  return t("transcript.time.overYear")
}

const SECOND = 1000

/**
 * How long the turn under the spinner has been going: `1s`, `45s`, `1m5s`,
 * `1h1m6s`.
 *
 * Every unit down to the second rather than `since`'s single coarse one, and
 * for the opposite reason: this label is watched while it moves, so what it has
 * to show is that something is still happening — a `1m` sitting still for the
 * next fifty-nine seconds is exactly the "is this stuck" it exists to answer.
 * Which is also why the seconds stay once the minutes appear: they are the part
 * that is moving.
 *
 * Units are dropped from the left only, never the middle — an hour in, `1h0m5s`
 * rather than `1h5s`, which reads as five seconds at a glance.
 *
 * Clocks going backwards are floored at zero, as in `since`.
 */
export function elapsed(startedAt: number, now: number = Date.now()): string {
  return duration(now - startedAt)
}

/**
 * The same label for a stretch that has already finished: a turn's own wall
 * time, off its usage line.
 *
 * Shared with the spinner's clock rather than written again, because it is the
 * same number twice — what a turn is drawn as having taken has to be what
 * somebody watched it count up to, and two formatters would drift the moment
 * one of them rounded.
 */
export function duration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / SECOND)
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`
  if (minutes > 0) return `${minutes}m${seconds}s`
  return `${seconds}s`
}

/**
 * When a line was written, in the corner of its bubble: `14:05`.
 *
 * Local time and twenty-four hours, with no date: the date is the divider's job
 * (`dayLabel`) and the bubble's corner has room for five characters. Built from
 * the parts rather than `toLocaleTimeString`, which on some locales adds the
 * seconds or an `AM` the corner has no room for.
 *
 * Empty for a line with no readable `at`, which is every line written before
 * the field existed — `NaN:NaN` would read as the clock being broken.
 */
export function timeOf(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** The same moment in full, for the hover line: the local date and time in the
 * machine's own locale, since a tooltip is read rather than scanned. */
export function dateTimeOf(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  return at.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/**
 * The day a line fell on, as the divider between days says it: `Today`,
 * `Yesterday`, or `Mon 29 Sep` — with the year on the end only once it is not
 * this one, which is the one time it says anything.
 *
 * Local calendar days, which is why the comparison is on date parts rather than
 * on 24-hour spans: a line at 23:50 and one at 00:10 are ten minutes apart and
 * on different days, and the divider is about the day.
 *
 * The dictionary's short names rather than `Intl`'s, for the reason `since` is
 * not `Intl.RelativeTimeFormat`: the label is three short tokens in a thin
 * rule, and a locale's long form does not fit the rule.
 */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  const today = new Date(now)
  if (sameDay(at, today)) return t("transcript.time.today")
  if (sameDay(at, new Date(now - DAY))) return t("transcript.time.yesterday")
  const parts = {
    weekday: t(WEEKDAYS[at.getDay()]!),
    day: at.getDate(),
    month: t(MONTHS[at.getMonth()]!),
  }
  return at.getFullYear() === today.getFullYear()
    ? t("transcript.time.date", parts)
    : t("transcript.time.dateYear", { ...parts, year: at.getFullYear() })
}

/**
 * Whether a divider belongs between two lines: both are stamped, and the stamps
 * fall on different local days.
 *
 * False when either stamp is missing rather than treating the missing one as a
 * day of its own — a transcript written before `at` existed has none on its
 * older lines, and a divider between "no day" and today would say the chat
 * jumped a day it did not.
 */
export function dayBreak(prev?: string, next?: string): boolean {
  if (!prev || !next) return false
  const a = new Date(prev)
  const b = new Date(next)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false
  return !sameDay(a, b)
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function pad(part: number): string {
  return part.toString().padStart(2, "0")
}

const WEEKDAYS: MessageKey[] = [
  "transcript.time.weekdays.sun",
  "transcript.time.weekdays.mon",
  "transcript.time.weekdays.tue",
  "transcript.time.weekdays.wed",
  "transcript.time.weekdays.thu",
  "transcript.time.weekdays.fri",
  "transcript.time.weekdays.sat",
]
const MONTHS: MessageKey[] = [
  "transcript.time.months.jan",
  "transcript.time.months.feb",
  "transcript.time.months.mar",
  "transcript.time.months.apr",
  "transcript.time.months.may",
  "transcript.time.months.jun",
  "transcript.time.months.jul",
  "transcript.time.months.aug",
  "transcript.time.months.sep",
  "transcript.time.months.oct",
  "transcript.time.months.nov",
  "transcript.time.months.dec",
]
