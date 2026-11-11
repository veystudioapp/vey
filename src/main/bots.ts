import { randomUUID } from "node:crypto"

import {
  chatOptions,
  type Bot,
  type BotInput,
  type BotRun,
  type BotSchedule,
  type ChatEvent,
  type ChatOptions,
} from "../shared/api"
import {
  BOT_HOURS,
  BOT_PERMISSIONS,
  botMessage,
  clockOf,
  isQuietReply,
  latestDue,
  MAX_BOT_RUNS,
} from "../shared/bots"

/**
 * Bots: a saved prompt sent into a **new chat of its project** on a schedule
 * — `docs/design.md` § Bots.
 *
 * Every run is an ordinary chat, opened through the same `Chats` a `+` is, so
 * it is listed, unread, notified and continued the way any other is. What is
 * here is only when, and what came of it: a timer over `workspace/bots.json`,
 * and a watch over the chat events of the runs in flight to tell a run that
 * said something from one that ended on `QUIET_MARK`.
 *
 * Runs only while the app is open. A due time missed — the app shut, the Mac
 * asleep (a suspended timer simply fires late) — is owed **one** run, the
 * latest, flagged `catch-up`.
 *
 * Free of `electron` and of `Chats` itself: both come in through `deps`, so
 * `test/bots.ts` drives the clock and the chats.
 */

/** How often the timer looks. A run lands within this of its minute. */
const TICK_MS = 30_000
/** The first look after launch — late enough not to compete with the window
 * opening, soon enough that a catch-up is the first thing that happens. */
const FIRST_MS = 8_000
/** Past this, a due run is a catch-up rather than on time. */
const LATE_MS = 5 * 60_000

export type BotDeps = {
  read: () => Promise<Bot[]>
  write: (bots: Bot[]) => Promise<void>
  /** The workspace's folder ids: a bot whose checkout has left is kept and
   * not run, so putting the folder back picks it up again. */
  folderIds: () => Promise<string[]>
  /** Opens a chat with id `chatId` in `folderId`, named `title`, on
   * `options`, and sends `message` into it. Resolves once it is written down
   * and the message is on its way — not when the turn ends. */
  start: (input: {
    chatId: string
    folderId: string
    title: string
    options: ChatOptions
    message: string
  }) => Promise<void>
  /** Whether a chat is working now. */
  busy: (chatId: string) => boolean
  /** A run has finished with something to say — the notice `ipc.ts` held
   * back for it (`holds`). */
  reported: (chatId: string) => void
  onChange: (bots: Bot[]) => void
  now?: () => Date
}

/** A run in flight, by its chat id. */
type Running = { botId: string; runId: string; quiet: boolean; text: string }

export class Bots {
  private timer: NodeJS.Timeout | null = null
  private first: NodeJS.Timeout | null = null
  /** Every read-modify-write of the file, one at a time. */
  private writes: Promise<unknown> = Promise.resolve()
  private readonly running = new Map<string, Running>()

  constructor(private readonly deps: BotDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /**
   * Starts the timer, after settling any run the last launch left `running`:
   * its `claude` ended with the app (`killAll` on quit), so nothing will ever
   * finish it.
   */
  start(): void {
    if (this.timer) return
    void this.update((bots) =>
      bots.some((bot) => bot.runs.some((run) => run.state === "running"))
        ? bots.map((bot) => ({
            ...bot,
            runs: bot.runs.map((run) =>
              run.state === "running"
                ? {
                    ...run,
                    state: "failed",
                    note: "The app closed while it ran.",
                  }
                : run
            ),
          }))
        : null
    )
    this.first = setTimeout(() => void this.tick(), FIRST_MS)
    this.first.unref?.()
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.first) clearTimeout(this.first)
    if (this.timer) clearInterval(this.timer)
    this.first = null
    this.timer = null
  }

  list(): Promise<Bot[]> {
    return this.deps.read()
  }

  async save(raw: unknown): Promise<Bot> {
    const input = botInputOf(raw)
    if (!input)
      throw new Error(
        "A bot needs a name, a prompt, a time and at least one day."
      )
    const now = this.now().toISOString()
    let saved: Bot | undefined
    await this.update((bots) => {
      const before = bots.find((bot) => bot.id === input.id)
      // When it runs moved — a new schedule, or switched back on — so it
      // counts from now rather than owing a run for the time just passed.
      const moved =
        !before ||
        before.enabled !== input.enabled ||
        JSON.stringify(before.schedule) !== JSON.stringify(input.schedule)
      saved = {
        ...input,
        createdAt: before?.createdAt ?? now,
        lastDueAt: moved ? now : before.lastDueAt,
        runs: before?.runs ?? [],
      }
      return before
        ? bots.map((bot) => (bot.id === input.id ? saved! : bot))
        : [...bots, saved]
    })
    return saved!
  }

  async remove(id: string): Promise<void> {
    await this.update((bots) =>
      bots.some((bot) => bot.id === id)
        ? bots.filter((bot) => bot.id !== id)
        : null
    )
  }

  /** `Run now`: one run, whatever the schedule says, and the schedule left
   * where it was. */
  async runNow(id: string): Promise<void> {
    const bot = (await this.deps.read()).find((entry) => entry.id === id)
    if (!bot) throw new Error("That bot no longer exists.")
    await this.run(bot, "manual")
  }

  /**
   * Every enabled bot that has come due since it was last acted on.
   *
   * `lastDueAt` moves before the run starts, so a tick that lands while a
   * slow `start` is still opening the chat cannot start a second.
   */
  async tick(): Promise<void> {
    const now = this.now()
    const folders = new Set(await this.deps.folderIds())
    const due: { bot: Bot; late: boolean }[] = []
    await this.update((bots) => {
      let changed = false
      const next = bots.map((bot) => {
        if (!bot.enabled) return bot
        const at = latestDue(bot.schedule, new Date(bot.lastDueAt), now)
        if (!at) return bot
        changed = true
        // A checkout gone from the workspace is passed over, not owed: the
        // project coming back next week should not bring a stale brief.
        if (folders.has(bot.folderId)) {
          due.push({ bot, late: now.getTime() - at.getTime() > LATE_MS })
        }
        return { ...bot, lastDueAt: at.toISOString() }
      })
      return changed ? next : null
    })
    for (const { bot, late } of due) {
      await this.run(bot, late ? "catch-up" : "schedule")
    }
  }

  /**
   * One run: a chat opened and sent to, or a `skipped` line saying why not.
   *
   * Skipped while the bot's previous run is still working — two of one bot's
   * chats at once is the same question asked twice of one checkout.
   */
  private async run(bot: Bot, trigger: BotRun["trigger"]): Promise<void> {
    const at = this.now()
    const runId = randomUUID()
    const working = [...this.running].some(
      ([chatId, run]) => run.botId === bot.id && this.deps.busy(chatId)
    )
    if (working) {
      await this.record(bot.id, {
        id: runId,
        at: at.toISOString(),
        chatId: null,
        state: "skipped",
        trigger,
        note: "The previous run was still working.",
      })
      return
    }

    // Minted here, watched and written down before the chat exists, so no
    // event of the run — a turn that fails at once included — can arrive
    // ahead of the watch or settle a run not yet on the list.
    const chatId = randomUUID()
    const running: Running = {
      botId: bot.id,
      runId,
      quiet: bot.quiet,
      text: "",
    }
    this.running.set(chatId, running)
    await this.record(bot.id, {
      id: runId,
      at: at.toISOString(),
      chatId,
      state: "running",
      trigger,
    })
    try {
      await this.deps.start({
        chatId,
        folderId: bot.folderId,
        title: runTitle(bot.name, at),
        options: bot.options,
        message: botMessage(bot),
      })
    } catch (error) {
      this.running.delete(chatId)
      await this.settle(running, {
        state: "failed",
        chatId: null,
        note: error instanceof Error ? error.message : String(error),
      })
      return
    }
    // Once more now the chat is on the listing, so a window re-reading it
    // finds the row.
    this.deps.onChange(await this.deps.read())
  }

  /** Whether a chat is a run in flight — whose `done` notice is this
   * module's to ring or not, once the reply has been read. */
  holds(chatId: string): boolean {
    return this.running.has(chatId)
  }

  /**
   * A chat event, for the runs in flight.
   *
   * The reply is the last main-loop `text` — a subagent's last sentence is
   * not the turn's answer. The verdict is taken at **quiet**, `busy: false`,
   * for the reason `main/notify.ts` gives: `done` ends a turn, and a
   * background subagent can outlive it.
   */
  onChatEvent(event: ChatEvent): void {
    const run = this.running.get(event.chatId)
    if (!run) return

    if (event.type === "text" && !event.parent) {
      run.text = event.text
      return
    }

    if (event.type === "done" && event.error) {
      this.running.delete(event.chatId)
      void this.settle(run, { state: "failed", note: event.error })
      return
    }

    if (event.type === "busy" && !event.busy) {
      this.running.delete(event.chatId)
      const quiet = run.quiet && isQuietReply(run.text)
      if (!quiet) this.deps.reported(event.chatId)
      void this.settle(run, { state: quiet ? "quiet" : "reported" })
    }
  }

  /** A chat deleted mid-run: nothing will finish it now. */
  forget(chatId: string): void {
    const run = this.running.get(chatId)
    if (!run) return
    this.running.delete(chatId)
    void this.settle(run, { state: "failed", note: "Its chat was deleted." })
  }

  private settle(
    running: Running,
    outcome: Partial<Pick<BotRun, "state" | "note" | "chatId">>
  ): Promise<void> {
    return this.update((bots) => {
      const bot = bots.find((entry) => entry.id === running.botId)
      if (!bot?.runs.some((run) => run.id === running.runId)) return null
      return bots.map((entry) =>
        entry === bot
          ? {
              ...bot,
              runs: bot.runs.map((run) =>
                run.id === running.runId ? { ...run, ...outcome } : run
              ),
            }
          : entry
      )
    })
  }

  private record(botId: string, run: BotRun): Promise<void> {
    return this.update((bots) =>
      bots.some((bot) => bot.id === botId)
        ? bots.map((bot) =>
            bot.id === botId
              ? { ...bot, runs: [run, ...bot.runs].slice(0, MAX_BOT_RUNS) }
              : bot
          )
        : null
    )
  }

  /** A read, a change and a write, queued; `null` is nothing to write. Tells
   * the windows after every write. */
  private update(edit: (bots: Bot[]) => Bot[] | null): Promise<void> {
    const next = this.writes.then(async () => {
      const edited = edit(await this.deps.read())
      if (!edited) return
      await this.deps.write(edited)
      this.deps.onChange(edited)
    })
    this.writes = next.catch(() => undefined)
    return next
  }
}

/** A run's chat's name: the bot's, and when — in the system's own words for
 * a date, since this is read in the column beside chats named in sentences. */
export function runTitle(name: string, at: Date): string {
  const when = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at)
  return `${name} · ${when}`
}

/** A schedule off the wire, or null. */
export function scheduleOf(raw: unknown): BotSchedule | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const days = Array.isArray(value.days)
    ? [
        ...new Set(
          value.days.filter(
            (day): day is number =>
              Number.isInteger(day) && day >= 0 && day <= 6
          )
        ),
      ].sort()
    : []
  if (days.length === 0) return null
  if (value.kind === "daily" && typeof value.time === "string") {
    const clock = clockOf(value.time)
    if (!clock) return null
    const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`
    return { kind: "daily", time, days }
  }
  if (
    value.kind === "every" &&
    BOT_HOURS.includes(value.hours as (typeof BOT_HOURS)[number])
  ) {
    return { kind: "every", hours: value.hours as number, days }
  }
  return null
}

/**
 * What the form sent, narrowed — or null for a bot that cannot run: no name,
 * no prompt, no place, no schedule. An `ask` permission becomes `read`
 * (`BOT_PERMISSIONS` says why).
 */
export function botInputOf(raw: unknown): BotInput | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string).trim() : ""
  const schedule = scheduleOf(value.schedule)
  const id = text("id")
  const projectId = text("projectId")
  const folderId = text("folderId") || projectId
  const name = text("name")
  const prompt = text("prompt")
  if (!id || !projectId || !name || !prompt || !schedule) return null

  const options = chatOptions(value.options as ChatOptions | undefined)
  return {
    id,
    projectId,
    folderId,
    name: name.slice(0, 80),
    prompt,
    schedule,
    options: {
      ...options,
      permission: BOT_PERMISSIONS.includes(options.permission)
        ? options.permission
        : "read",
    },
    quiet: value.quiet !== false,
    enabled: value.enabled !== false,
  }
}
