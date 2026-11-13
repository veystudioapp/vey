import type { AttentionChat, Bot } from "../shared/api"
import { nextDue } from "../shared/bots"

/**
 * What the menu bar icon's menu says — the half of `tray.ts` that needs no
 * Electron, so `test/tray-menu.ts` can hold it. `docs/design.md` § The menu
 * bar, for bots.
 *
 * English, like the notifications: the strings are main's, and the language
 * setting is the renderer's.
 */
export type TrayItem =
  | { kind: "open" }
  | { kind: "heading"; label: string }
  | { kind: "chat"; chatId: string; label: string }
  | { kind: "bot"; label: string }
  | { kind: "note"; label: string }
  | { kind: "separator" }
  | { kind: "quit" }

/** How many chats the menu names before it says how many more. A menu is not
 * the column, and one that runs off the screen is worse than a count. */
export const TRAY_CHATS = 8
/** The same for bots. */
export const TRAY_BOTS = 10

/** A row's title, cut to what a menu item can hold without going wide. */
function clip(text: string, max = 48): string {
  const line = text.replaceAll(/\s+/g, " ").trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function clock(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** `08:30` today, `tomorrow 08:30`, `Mon 08:30` within the week — the local
 * clock, which is what a bot's schedule is written in. */
export function whenOf(at: Date, now: Date): string {
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  // Rounded rather than divided: a day the clocks change on is 23 or 25 hours.
  const days = Math.round((day(at) - day(now)) / 86_400_000)
  if (days === 0) return clock(at)
  if (days === 1) return `tomorrow ${clock(at)}`
  return `${WEEKDAYS[at.getDay()]} ${clock(at)}`
}

function isRunning(bot: Bot): boolean {
  return bot.runs.some((run) => run.state === "running")
}

/**
 * How many bots have a run working now — the Bots heading's count. Bots
 * rather than runs: a bot has one run at a time (the next is skipped while
 * one works). Switched off or not, since `Run now` runs either.
 */
export function runningBotsOf(bots: Bot[]): number {
  return bots.filter(isRunning).length
}

/**
 * What is written beside the icon: how many bots are switched on — what the
 * app is being kept running for — or nothing when none is, since an icon with
 * a `0` beside it is one more thing in a shared strip. Not the running ones:
 * a run is minutes a day, and a number that is almost never there says
 * nothing about whether the bots are set up at all.
 */
export function trayTitleOf(bots: Bot[]): string {
  const on = bots.filter((bot) => bot.enabled).length
  return on > 0 ? String(on) : ""
}

/** One bot's row: its project, what it is doing now or when it next runs.
 * The project ahead of the name because two projects' bots are often called
 * the same thing — a recap, a security pass — and the menu mixes them, sorted
 * by time. A project that has left the workspace is no prefix. */
function botLine(
  bot: Bot,
  project: string | undefined,
  now: Date
): { label: string; at: number } {
  const name = project
    ? `${clip(project, 24)}: ${clip(bot.name, 36)}`
    : clip(bot.name, 36)
  if (isRunning(bot)) return { label: `${name} · running`, at: -1 }
  const next = nextDue(bot.schedule, now)
  return next
    ? { label: `${name} · ${whenOf(next, now)}`, at: +next }
    : { label: `${name} · no days picked`, at: Infinity }
}

/**
 * The menu, top to bottom: the way back into the studio, the chats that want
 * somebody (a question first), the bots switched on by when they next run,
 * and Quit — the one way to stop them, since closing the window no longer
 * does.
 */
export function trayMenuOf({
  attention,
  bots,
  projects = {},
  now,
}: {
  attention: AttentionChat[]
  bots: Bot[]
  /** A project's name by its folder id. */
  projects?: Record<string, string>
  now: Date
}): TrayItem[] {
  const items: TrayItem[] = [{ kind: "open" }, { kind: "separator" }]

  if (attention.length > 0) {
    items.push({ kind: "heading", label: "Needs you" })
    const ordered = [...attention].sort(
      (a, b) => Number(b.waiting) - Number(a.waiting)
    )
    for (const chat of ordered.slice(0, TRAY_CHATS)) {
      items.push({
        kind: "chat",
        chatId: chat.id,
        label: chat.waiting
          ? `${clip(chat.title || "Untitled chat")} · asking`
          : clip(chat.title || "Untitled chat"),
      })
    }
    if (ordered.length > TRAY_CHATS) {
      items.push({
        kind: "note",
        label: `${ordered.length - TRAY_CHATS} more in Vey`,
      })
    }
    items.push({ kind: "separator" })
  }

  const running = runningBotsOf(bots)
  items.push({
    kind: "heading",
    label: running > 0 ? `Bots · ${running} running` : "Bots",
  })
  // A switched-off bot started by `Run now` is listed while it runs, or the
  // heading would count a row nobody can see.
  const enabled = bots
    .filter((bot) => bot.enabled || isRunning(bot))
    .map((bot) => botLine(bot, projects[bot.projectId], now))
    .sort((a, b) => a.at - b.at)
  if (enabled.length === 0) {
    items.push({ kind: "note", label: "No bots switched on" })
  }
  for (const line of enabled.slice(0, TRAY_BOTS)) {
    items.push({ kind: "bot", label: line.label })
  }
  if (enabled.length > TRAY_BOTS) {
    items.push({ kind: "note", label: `${enabled.length - TRAY_BOTS} more` })
  }

  items.push({ kind: "separator" }, { kind: "quit" })
  return items
}

/** The icon's tooltip: what the dot and the number beside it stand for. */
export function trayTooltipOf(attention: AttentionChat[], bots: Bot[]): string {
  const parts: string[] = []
  const count = attention.length
  if (count > 0) {
    parts.push(count === 1 ? "1 chat needs you" : `${count} chats need you`)
  }
  const on = bots.filter((bot) => bot.enabled).length
  if (on > 0) {
    const running = runningBotsOf(bots)
    parts.push(
      (on === 1 ? "1 bot on" : `${on} bots on`) +
        (running > 0 ? ` (${running} running)` : "")
    )
  }
  return parts.length > 0 ? `Vey — ${parts.join(", ")}` : "Vey"
}

/** How many chats one `setAttention` may carry — far past any column, and a
 * cap on what a confused renderer can make main hold. */
const MAX_ATTENTION = 500

/** `setAttention`'s argument, narrowed: whatever is not a chat is dropped. */
export function attentionOf(raw: unknown): AttentionChat[] {
  if (!Array.isArray(raw)) return []
  const chats: AttentionChat[] = []
  for (const entry of raw.slice(0, MAX_ATTENTION)) {
    if (!entry || typeof entry !== "object") continue
    const { id, title, waiting } = entry as Record<string, unknown>
    if (typeof id !== "string" || !id) continue
    chats.push({
      id,
      title: typeof title === "string" ? title : "",
      waiting: waiting === true,
    })
  }
  return chats
}
