import { randomUUID } from "node:crypto"

/**
 * Anonymous usage counts: how many machines run the app, how often, and for
 * how long. Posted to the studio's own server (`vsclaude-cloud`,
 * `POST /api/telemetry`), which keeps them as rows of its D1 database — no
 * third party. `docs/design.md` § Usage counts has the argument.
 *
 * Two events and nothing else — `app_opened` and `heartbeat`, each carrying the
 * version, the OS and the CPU — under a random id minted on first launch. No
 * path, no project or chat, no account: what somebody works on never leaves
 * the machine, and a count is all this is for.
 *
 * Free of `electron`, like `updater.ts`, so `test/telemetry.ts` can drive the
 * clock without a window.
 */

/** The id this machine is counted under, kept in the manifest's settings. */
const INSTALL_ID_KEY = "telemetry.installId"

/** One tick a minute: a minute is the unit "time in the app" is counted in. */
const TICK_MS = 60_000
/**
 * Minutes between heartbeats. Sparse enough to stay a handful of rows a day
 * per machine, dense enough that a crash loses a quarter of an hour at most —
 * the quit path flushes what is left, but a crash has no quit path.
 */
const TICKS_PER_HEARTBEAT = 15

/** Long enough for a slow network, short enough not to pile up behind one. */
const SEND_TIMEOUT_MS = 10_000

export type AppEvent = "app_opened" | "heartbeat"

export type UsageDeps = {
  send: (event: AppEvent, activeSeconds?: number) => void
  /** The Settings switch, asked on every send so turning it off holds at once. */
  enabled: () => Promise<boolean>
  /** Whether one of the app's windows is focused — `host.focused`. */
  focused: () => boolean
}

/**
 * The counting, without the timer or the network. Only focused minutes count:
 * an app left open behind everything else all day is not a day of use. Time
 * counted while the switch is off is dropped, not saved for later.
 */
export function usageClock({ send, enabled, focused }: UsageDeps) {
  let seconds = 0
  let ticks = 0

  const heartbeat = async () => {
    const counted = seconds
    seconds = 0
    if (counted > 0 && (await enabled())) send("heartbeat", counted)
  }

  return {
    async opened() {
      if (await enabled()) send("app_opened")
    },
    async tick() {
      if (focused()) seconds += TICK_MS / 1000
      ticks += 1
      if (ticks % TICKS_PER_HEARTBEAT === 0) await heartbeat()
    },
    /** What is left, on quit. */
    flush: heartbeat,
  }
}

export type TelemetryDeps = {
  version: string
  packaged: boolean
  /** `serverUrl()` — the server the events go to; null sends nothing. */
  serverUrl: string | null
  focused: () => boolean
  /** `host.fetch`, so the events go through the system proxy like the rest. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
  /** `TELEMETRY_KEY`'s reading: only `"off"` is off. */
  enabled: () => Promise<boolean>
}

export type Telemetry = { shutdown: () => Promise<void> }

/**
 * Whether this run reports at all. A packaged build does. A dev build does
 * only to a server on this machine — `normalizeAiUrl` lets plain `http:`
 * through for localhost alone — so `bun run dev` against `nitro dev` can be
 * watched end to end, while a dev build pointed at the real server never puts
 * a developer's restarts into the counts.
 */
export function reportsTo(
  serverUrl: string | null,
  packaged: boolean
): string | null {
  if (!serverUrl) return null
  if (!packaged && !serverUrl.startsWith("http:")) return null
  return `${serverUrl}/api/telemetry`
}

export function startTelemetry(deps: TelemetryDeps): Telemetry {
  const endpoint = reportsTo(deps.serverUrl, deps.packaged)
  if (!endpoint) return { shutdown: async () => {} }

  const installId = (async () => {
    const stored = await deps.getSetting(INSTALL_ID_KEY)
    if (stored) return stored
    const minted = randomUUID()
    await deps.setSetting(INSTALL_ID_KEY, minted)
    return minted
  })()
  /** Sends not yet answered, so quitting can wait for the last heartbeat. */
  const pending = new Set<Promise<void>>()

  const clock = usageClock({
    send(event, activeSeconds) {
      const sent = installId
        .then((id) =>
          deps.fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              installId: id,
              event,
              ...(activeSeconds ? { activeSeconds } : {}),
              version: deps.version,
              os: process.platform,
              arch: process.arch,
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          })
        )
        // Not retried: a count missed offline is a count, not somebody's work,
        // and a queue on disk is more machinery than a lost quarter hour is
        // worth.
        .then(
          () => {},
          () => {}
        )
        .finally(() => pending.delete(sent))
      pending.add(sent)
    },
    enabled: deps.enabled,
    focused: deps.focused,
  })

  void clock.opened()
  const timer = setInterval(() => void clock.tick(), TICK_MS)
  timer.unref()

  return {
    async shutdown() {
      clearInterval(timer)
      await clock.flush()
      await Promise.allSettled(pending)
    },
  }
}
