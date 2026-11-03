import { reportsTo, usageClock } from "../src/main/telemetry"
import { check, finish, section } from "./harness"

/**
 * The usage clock: which minutes count, when a heartbeat goes out, and that
 * the Settings switch holds.
 *
 * Worth a test because every way of getting it wrong is silent and only
 * shows up weeks later as a chart that cannot be trusted — minutes counted
 * behind another app, a heartbeat per minute, time sent after it was switched
 * off. The network half is one `fetch`; which runs make one is `reportsTo`.
 */

type Sent = { event: string; seconds: number | undefined }

function clock(options: { enabled?: () => boolean; focused?: () => boolean }) {
  const sent: Sent[] = []
  const usage = usageClock({
    send: (event, seconds) => sent.push({ event, seconds }),
    enabled: async () => options.enabled?.() ?? true,
    focused: options.focused ?? (() => true),
  })
  return { usage, sent }
}

const ticks = async (usage: { tick: () => Promise<void> }, count: number) => {
  for (let index = 0; index < count; index += 1) await usage.tick()
}

section("opening")
{
  const { usage, sent } = clock({})
  await usage.opened()
  check(
    "an open is one app_opened",
    sent.length === 1 && sent[0]!.event === "app_opened",
    sent
  )
}

section("heartbeats")
{
  const { usage, sent } = clock({})
  await ticks(usage, 14)
  check("nothing before the fifteenth minute", sent.length === 0, sent)
  await usage.tick()
  check(
    "the fifteenth minute sends the quarter hour",
    sent.length === 1 &&
      sent[0]!.event === "heartbeat" &&
      sent[0]!.seconds === 900,
    sent
  )
  await ticks(usage, 15)
  check(
    "the next quarter starts from nothing",
    sent.length === 2 && sent[1]!.seconds === 900,
    sent
  )
}

section("only focused minutes count")
{
  let focused = true
  const { usage, sent } = clock({ focused: () => focused })
  await ticks(usage, 5)
  focused = false
  await ticks(usage, 10)
  check(
    "five of fifteen minutes in front of somebody",
    sent[0]?.seconds === 300,
    sent
  )
  await ticks(usage, 15)
  check("a quarter hour behind everything sends nothing", sent.length === 1)
}

section("flushing on quit")
{
  const { usage, sent } = clock({})
  await ticks(usage, 3)
  await usage.flush()
  check(
    "what is left goes out",
    sent.length === 1 && sent[0]!.seconds === 180,
    sent
  )
  await usage.flush()
  check("and is not sent twice", sent.length === 1, sent)
}

section("the Settings switch")
{
  let enabled = false
  const { usage, sent } = clock({ enabled: () => enabled })
  await usage.opened()
  await ticks(usage, 15)
  check("off sends nothing", sent.length === 0, sent)
  enabled = true
  await ticks(usage, 1)
  await usage.flush()
  check(
    "time counted while off is dropped, not sent later",
    sent.length === 1 && sent[0]!.seconds === 60,
    sent
  )
}

section("which runs report")
{
  check(
    "a packaged build reports to the real server",
    reportsTo("https://ai.example.com", true) ===
      "https://ai.example.com/api/telemetry"
  )
  check(
    "a dev build does not",
    reportsTo("https://ai.example.com", false) === null
  )
  check(
    "a dev build does to a server on this machine",
    reportsTo("http://localhost:3000", false) ===
      "http://localhost:3000/api/telemetry"
  )
  check("no server is no report", reportsTo(null, true) === null)
}

finish()
