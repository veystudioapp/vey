import type { BotSchedule, ChatPermission } from "./api"

/**
 * When a bot is due, and what it is told — the half of `main/bots.ts` both
 * sides need: main to decide a run, the `Bots` tab to say when the next one
 * is. Pure, in the machine's local clock, so `test/bots.ts` holds it.
 * `docs/design.md` § Bots.
 */

/** How many runs a bot keeps in its history. Its chats are the record; this
 * is only the tab's list of them. */
export const MAX_BOT_RUNS = 30

/** What `every` offers. Each divides 24, so the run hours are the same every
 * day and somebody can say which they are without a calculator. */
export const BOT_HOURS = [1, 2, 3, 4, 6, 8, 12] as const

/** Every permission but `ask`: a bot's turn has nobody in front of it, and a
 * mode that stops on every call would hold a run until somebody came back. */
export const BOT_PERMISSIONS: ChatPermission[] = [
  "plan",
  "read",
  "edits",
  "full",
]

/** The line a run ends on when there is nothing worth anybody's attention. */
export const QUIET_MARK = "NOTHING_TO_REPORT"

/**
 * What a run with `quiet` on is told, after its own prompt.
 *
 * In the message, not the system prompt, for the cached prefix's reason (see
 * `CLAUDE.md`), and on the user line rather than hidden: the transcript is the
 * conversation that was had, and a sentence the model was given and the reader
 * was not is the start of a chat nobody can explain.
 */
export const QUIET_ASK = `If, having done this, there is nothing worth my attention, end your reply with a line saying only ${QUIET_MARK}.`

/** The message a run sends. */
export function botMessage(bot: { prompt: string; quiet: boolean }): string {
  const prompt = bot.prompt.trim()
  return bot.quiet ? `${prompt}\n\n${QUIET_ASK}` : prompt
}

/**
 * Whether a reply ended on `QUIET_MARK` — its last non-blank line, with the
 * markdown a model wraps a token in taken off. Only the last line: a reply
 * that mentions the mark and then goes on has said something.
 */
export function isQuietReply(text: string): boolean {
  const last = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
  if (!last) return false
  // From the ends only: the mark has underscores of its own.
  return last.replaceAll(/^[`*_\s]+|[`*_.\s]+$/g, "") === QUIET_MARK
}

/** `"08:30"` as hours and minutes, or null for anything else. */
export function clockOf(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** How far either search looks: a week and a day covers any one weekday. */
const SEARCH_DAYS = 8

/**
 * The due times of a schedule on one local day, earliest first.
 *
 * Built with `setHours` on that day rather than by adding milliseconds, so a
 * daylight-saving change moves nothing: 08:30 is 08:30 on the day the clocks
 * go forward too.
 */
function dueOn(schedule: BotSchedule, day: Date): Date[] {
  if (!schedule.days.includes(day.getDay())) return []
  if (schedule.kind === "daily") {
    const clock = clockOf(schedule.time)
    if (!clock) return []
    const at = new Date(day)
    at.setHours(clock.hour, clock.minute, 0, 0)
    return [at]
  }
  const step = BOT_HOURS.includes(schedule.hours as never) ? schedule.hours : 0
  if (!step) return []
  const times: Date[] = []
  for (let hour = 0; hour < 24; hour += step) {
    const at = new Date(day)
    at.setHours(hour, 0, 0, 0)
    times.push(at)
  }
  return times
}

/** Local midnight of the day `at` is in, `offset` days on. */
function dayOf(at: Date, offset: number): Date {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  day.setDate(day.getDate() + offset)
  return day
}

/**
 * The latest due time after `after` and no later than `now`, or null.
 *
 * **The latest, alone**: a machine asleep all weekend owes a Monday-morning
 * brief one run, not one per missed slot — three briefs of the same repository
 * in a row is the noise this feature cannot afford.
 */
export function latestDue(
  schedule: BotSchedule,
  after: Date,
  now: Date
): Date | null {
  for (let offset = 0; offset > -SEARCH_DAYS; offset--) {
    const times = dueOn(schedule, dayOf(now, offset)).reverse()
    for (const at of times) {
      if (at > now) continue
      return at > after ? at : null
    }
    if (dayOf(now, offset) <= after) return null
  }
  return null
}

/** The first due time strictly after `after`, or null for a schedule that
 * has none (no days ticked). */
export function nextDue(schedule: BotSchedule, after: Date): Date | null {
  for (let offset = 0; offset <= SEARCH_DAYS; offset++) {
    for (const at of dueOn(schedule, dayOf(after, offset))) {
      if (at > after) return at
    }
  }
  return null
}
