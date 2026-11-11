import { DEFAULT_CHAT_OPTIONS, type Bot, type BotRun } from "../src/shared/api"
import {
  attentionOf,
  TRAY_CHATS,
  runningBotsOf,
  trayMenuOf,
  trayTitleOf,
  trayTooltipOf,
  whenOf,
  type TrayItem,
} from "../src/main/tray-menu"
import { check, finish, section } from "./harness"

/**
 * The menu bar icon's menu (`main/tray-menu.ts`): what it names, in what
 * order, and the narrowing of what the renderer sends it.
 */

/** Local time, the bots' clock. Month is 1-based here. */
const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi)

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

function bot(
  id: string,
  time: string,
  extra: { enabled?: boolean; runs?: BotRun[]; days?: number[] } = {}
): Bot {
  return {
    id,
    projectId: "p1",
    folderId: "p1",
    name: id,
    prompt: "What is on today?",
    schedule: { kind: "daily", time, days: extra.days ?? ALL_DAYS },
    options: DEFAULT_CHAT_OPTIONS,
    quiet: true,
    enabled: extra.enabled ?? true,
    createdAt: "2026-11-01T00:00:00.000Z",
    lastDueAt: "2026-11-01T00:00:00.000Z",
    runs: extra.runs ?? [],
  }
}

const labels = (items: TrayItem[], kind: TrayItem["kind"]) =>
  items.flatMap((item) =>
    item.kind === kind && "label" in item ? [item.label] : []
  )

// Wednesday 11 November 2026, 15:59.
const now = at(2026, 11, 11, 15, 59)

section("when a bot next runs")
check(
  "later today is the time",
  whenOf(at(2026, 11, 11, 18, 0), now) === "18:00"
)
check(
  "tomorrow says so",
  whenOf(at(2026, 11, 12, 8, 30), now) === "tomorrow 08:30"
)
check(
  "later in the week is the weekday",
  whenOf(at(2026, 11, 16, 8, 30), now) === "Mon 08:30"
)

section("the menu")
{
  const items = trayMenuOf({ attention: [], bots: [], now })
  check("it opens with the way back", items[0]?.kind === "open")
  check("and ends with Quit", items.at(-1)?.kind === "quit")
  check(
    "no chat wanting anybody is no Needs you",
    !labels(items, "heading").includes("Needs you")
  )
  check(
    "no bot switched on says so",
    labels(items, "note").includes("No bots switched on")
  )
}
{
  const items = trayMenuOf({
    attention: [
      { id: "a", title: "Fix the build", waiting: false },
      { id: "b", title: "Deploy", waiting: true },
    ],
    bots: [],
    now,
  })
  const chats = items.flatMap((item) => (item.kind === "chat" ? [item] : []))
  check(
    "a question comes first, and says it is asking",
    chats[0]?.chatId === "b" && chats[0].label === "Deploy · asking"
  )
  check("an unread chat is its title", chats[1]?.label === "Fix the build")
}
{
  const many = Array.from({ length: TRAY_CHATS + 3 }, (_, i) => ({
    id: `c${i}`,
    title: `Chat ${i}`,
    waiting: false,
  }))
  const items = trayMenuOf({ attention: many, bots: [], now })
  check(
    "past the cap the rest is a count",
    items.filter((item) => item.kind === "chat").length === TRAY_CHATS &&
      labels(items, "note").includes("3 more in Vey")
  )
}
{
  const items = trayMenuOf({
    attention: [],
    bots: [
      bot("evening", "18:00"),
      bot("morning", "08:30"),
      bot("off", "16:30", { enabled: false }),
      bot("working", "09:00", {
        runs: [
          {
            id: "r1",
            at: now.toISOString(),
            chatId: "x",
            state: "running",
            trigger: "schedule",
          },
        ],
      }),
    ],
    now,
  })
  const rows = labels(items, "bot")
  check(
    "bots switched on, a running one first, then by next run",
    rows.join(" | ") ===
      "working · running | evening · 18:00 | morning · tomorrow 08:30",
    rows
  )
}

section("the running bots")
{
  const running: BotRun = {
    id: "r1",
    at: now.toISOString(),
    chatId: "x",
    state: "running",
    trigger: "manual",
  }
  const done: BotRun = { ...running, id: "r0", state: "reported" }
  const bots = [
    bot("a", "08:00", { runs: [running] }),
    bot("b", "09:00", { runs: [done] }),
    bot("off", "10:00", { enabled: false, runs: [running] }),
    bot("idle", "11:00"),
  ]
  check(
    "a bot with a run working counts, switched off or not",
    runningBotsOf(bots) === 2
  )
  check(
    "beside the icon is the bots switched on, running or not",
    trayTitleOf(bots) === "3"
  )
  check(
    "none switched on is nothing beside it",
    trayTitleOf([bot("off", "11:00", { enabled: false })]) === ""
  )
  const items = trayMenuOf({ attention: [], bots, now })
  check(
    "the heading says how many",
    labels(items, "heading").includes("Bots · 2 running")
  )
  check(
    "a switched-off bot is listed while it runs, and not after",
    labels(items, "bot").includes("off · running") &&
      !labels(
        trayMenuOf({
          attention: [],
          bots: [bot("off", "10:00", { enabled: false })],
          now,
        }),
        "bot"
      ).length
  )
  check(
    "no run working, the heading is the word",
    labels(trayMenuOf({ attention: [], bots: [], now }), "heading").includes(
      "Bots"
    )
  )
}

section("the tooltip")
check("nothing is the name", trayTooltipOf([], []) === "Vey")
check(
  "bots switched on, none running",
  trayTooltipOf([], [bot("a", "08:00"), bot("b", "09:00")]) ===
    "Vey — 2 bots on"
)
check(
  "one chat is singular",
  trayTooltipOf([{ id: "a", title: "", waiting: false }], []) ===
    "Vey — 1 chat needs you"
)
check(
  "chats and running bots, both",
  trayTooltipOf(
    [{ id: "a", title: "", waiting: false }],
    [
      bot("a", "08:00", {
        runs: [
          {
            id: "r",
            at: now.toISOString(),
            chatId: "x",
            state: "running",
            trigger: "schedule",
          },
        ],
      }),
    ]
  ) === "Vey — 1 chat needs you, 1 bot on (1 running)"
)

section("what the renderer sends, narrowed")
check("not a list is nothing", attentionOf("3").length === 0)
check(
  "entries without an id are dropped, the rest defaulted",
  JSON.stringify(
    attentionOf([{ id: "a" }, { title: "x" }, null, { id: "b", waiting: true }])
  ) ===
    JSON.stringify([
      { id: "a", title: "", waiting: false },
      { id: "b", title: "", waiting: true },
    ])
)

finish()
