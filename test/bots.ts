import {
  DEFAULT_CHAT_OPTIONS,
  type Bot,
  type BotSchedule,
  type ChatEvent,
} from "../src/shared/api"
import {
  botMessage,
  isQuietReply,
  latestDue,
  nextDue,
  QUIET_MARK,
} from "../src/shared/bots"
import { botInputOf, Bots, scheduleOf } from "../src/main/bots"
import { check, finish, section } from "./harness"

/**
 * Bots: when one is due, what it is told, and what a run's chat events make
 * of it — `docs/design.md` § Bots.
 *
 * The clock is the part with edges in it: a missed weekend owing one run and
 * not six, a schedule edited at 08:31 not owing the 08:30 it just passed. Every
 * date here is built in local time, as the schedules are.
 */

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min)
const WEEKDAYS = [1, 2, 3, 4, 5]
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
// 2026-11-09 is a Monday.
const daily: BotSchedule = { kind: "daily", time: "08:30", days: WEEKDAYS }

section("latestDue")
check(
  "due at its minute",
  latestDue(daily, at(2026, 11, 9, 8, 0), at(2026, 11, 9, 8, 30))?.getTime() ===
    at(2026, 11, 9, 8, 30).getTime()
)
check(
  "not before it",
  latestDue(daily, at(2026, 11, 9, 8, 0), at(2026, 11, 9, 8, 29)) === null
)
check(
  "not twice",
  latestDue(daily, at(2026, 11, 9, 8, 30), at(2026, 11, 9, 17, 0)) === null
)
check(
  "a weekend asleep owes Monday's alone",
  latestDue(daily, at(2026, 11, 6, 8, 30), at(2026, 11, 9, 9, 0))?.getTime() ===
    at(2026, 11, 9, 8, 30).getTime()
)
check(
  "asleep from Friday to Monday 08:00 owes nothing yet — Saturday is off",
  latestDue(daily, at(2026, 11, 6, 8, 30), at(2026, 11, 9, 8, 0)) === null
)
check(
  "a missed day owes its latest slot",
  latestDue(
    daily,
    at(2026, 11, 9, 8, 30),
    at(2026, 11, 11, 7, 0)
  )?.getTime() === at(2026, 11, 10, 8, 30).getTime()
)
const every2: BotSchedule = { kind: "every", hours: 2, days: EVERY_DAY }
check(
  "every 2 hours is the even hours",
  latestDue(
    every2,
    at(2026, 11, 9, 9, 0),
    at(2026, 11, 9, 11, 59)
  )?.getTime() === at(2026, 11, 9, 10, 0).getTime()
)
check(
  "and not the odd ones",
  latestDue(every2, at(2026, 11, 9, 10, 0), at(2026, 11, 9, 11, 59)) === null
)
check(
  "no days, never due",
  latestDue({ ...daily, days: [] }, at(2026, 11, 1), at(2026, 11, 20)) === null
)

section("nextDue")
check(
  "later today",
  nextDue(daily, at(2026, 11, 9, 7, 0))?.getTime() ===
    at(2026, 11, 9, 8, 30).getTime()
)
check(
  "Friday evening's next is Monday",
  nextDue(daily, at(2026, 11, 13, 18, 0))?.getTime() ===
    at(2026, 11, 16, 8, 30).getTime()
)
check(
  "strictly after",
  nextDue(daily, at(2026, 11, 9, 8, 30))?.getTime() ===
    at(2026, 11, 10, 8, 30).getTime()
)
check(
  "every 12 hours",
  nextDue(
    { kind: "every", hours: 12, days: EVERY_DAY },
    at(2026, 11, 9, 1, 0)
  )?.getTime() === at(2026, 11, 9, 12, 0).getTime()
)

section("the quiet mark")
check("the last line", isQuietReply(`Nothing new.\n\n${QUIET_MARK}`))
check("in backticks", isQuietReply(`\`${QUIET_MARK}\``))
check("bold", isQuietReply(`**${QUIET_MARK}**`))
check(
  "mentioned and then gone on from",
  !isQuietReply(`${QUIET_MARK} would be wrong:\n\n- PR #12 needs you`)
)
check("an empty reply has said nothing quiet", !isQuietReply(""))
check(
  "the ask goes after the prompt when quiet is on",
  botMessage({ prompt: " Brief me ", quiet: true }).startsWith(
    "Brief me\n\n"
  ) && botMessage({ prompt: "Brief me", quiet: true }).includes(QUIET_MARK)
)
check(
  "and not when it is off",
  botMessage({ prompt: "Brief me", quiet: false }) === "Brief me"
)

section("narrowing")
check(
  "a time is padded",
  JSON.stringify(scheduleOf({ kind: "daily", time: "8:05", days: [1] })) ===
    JSON.stringify({ kind: "daily", time: "08:05", days: [1] })
)
check(
  "an hour count not offered is refused",
  scheduleOf({ kind: "every", hours: 5, days: [1] }) === null
)
check(
  "days are deduplicated and sorted",
  JSON.stringify(
    scheduleOf({ kind: "every", hours: 3, days: [5, 1, 5, 9] })
  ) === JSON.stringify({ kind: "every", hours: 3, days: [1, 5] })
)
const input = {
  id: "b1",
  projectId: "p1",
  folderId: "",
  name: "Morning brief",
  prompt: "What is on today?",
  schedule: daily,
  options: { ...DEFAULT_CHAT_OPTIONS, permission: "ask" },
  quiet: true,
  enabled: true,
}
const narrowed = botInputOf(input)
check("ask becomes read", narrowed?.options.permission === "read")
check("no checkout is the project's", narrowed?.folderId === "p1")
check("no prompt, no bot", botInputOf({ ...input, prompt: "  " }) === null)

section("the scheduler")
await (async () => {
  let now = at(2026, 11, 9, 8, 0)
  let kept: Bot[] = []
  const started: string[] = []
  const reported: string[] = []
  const busy = new Set<string>()
  const bots = new Bots({
    read: async () => kept,
    write: async (next) => {
      kept = next
    },
    folderIds: async () => ["p1"],
    start: async ({ chatId }) => {
      started.push(chatId)
      busy.add(chatId)
    },
    busy: (chatId) => busy.has(chatId),
    reported: (chatId) => reported.push(chatId),
    onChange: () => undefined,
    now: () => now,
  })

  await bots.save(input)
  await bots.tick()
  check("nothing before its time", started.length === 0)

  now = at(2026, 11, 9, 8, 30)
  await bots.tick()
  check("one run at its minute", started.length === 1)
  check("written down as running", kept[0]?.runs[0]?.state === "running")
  check("on schedule", kept[0]?.runs[0]?.trigger === "schedule")

  const first = started[0]!
  const event = (e: Record<string, unknown>) =>
    bots.onChatEvent({ chatId: first, ...e } as ChatEvent)
  event({ type: "text", text: `All quiet.\n\n${QUIET_MARK}` })
  busy.delete(first)
  event({ type: "busy", busy: false })
  await bots.list()
  // `settle` is queued behind the file; one more tick drains it.
  await bots.tick()
  check("a quiet reply is a quiet run", kept[0]?.runs[0]?.state === "quiet")
  check("and is not announced", reported.length === 0)

  now = at(2026, 11, 10, 9, 0)
  await bots.tick()
  check(
    "late by half an hour is a catch-up",
    kept[0]?.runs[0]?.trigger === "catch-up"
  )
  const second = started[1]!
  bots.onChatEvent({ chatId: second, type: "text", text: "PR #12 needs you." })
  // Still working at the next slot: skipped, not a second chat.
  now = at(2026, 11, 11, 8, 30)
  await bots.tick()
  check(
    "skipped while the last run works",
    kept[0]?.runs[0]?.state === "skipped"
  )
  check("no third chat", started.length === 2)
  busy.delete(second)
  bots.onChatEvent({ chatId: second, type: "busy", busy: false })
  await bots.tick()
  check(
    "a reply with something in it is reported",
    kept[0]?.runs.find((run) => run.chatId === second)?.state === "reported"
  )
  check("and announced", reported.includes(second))

  await bots.save({ ...input, schedule: { ...daily, time: "07:00" } })
  now = at(2026, 11, 11, 9, 0)
  await bots.tick()
  check(
    "an edited schedule owes nothing for the time just passed",
    started.length === 2
  )

  await bots.runNow("b1")
  check("Run now runs", started.length === 3)
  check("as manual", kept[0]?.runs[0]?.trigger === "manual")
})()

finish()
