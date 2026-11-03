import type { AssistantMessage } from "../src/shared/api"
import { stoppedOnLimit } from "../src/main/chat"
import { limitOf } from "../src/main/claude-agent"
import { limitSentence } from "../src/renderer/lib/chat/plan-usage"
import { check, finish, section } from "./harness"

/**
 * A turn stopped by the account's plan limit: what the CLI's two messages are
 * read into (`limitOf`), whether a chat is sitting on such a stop and so is
 * carried on by a move to another account (`stoppedOnLimit`), and the line's
 * words (`limitSentence`).
 */

section("limitOf")
{
  const rejected = {
    status: "rejected" as const,
    rateLimitType: "five_hour" as const,
    resetsAt: 1_791_460_800,
  }

  const flagged = limitOf(rejected, "You've hit your limit · resets 3pm", true)
  check("the flagged message is a limit", flagged !== null)
  check("which window", flagged?.window === "five_hour", flagged)
  check(
    "the reset, seconds read as seconds",
    flagged?.resetsAt === new Date(1_791_460_800_000).toISOString(),
    flagged
  )
  check(
    "the CLI's sentence kept",
    flagged?.text === "You've hit your limit · resets 3pm"
  )

  check(
    "milliseconds are not multiplied again",
    limitOf({ ...rejected, resetsAt: 1_791_460_800_000 }, "x", true)
      ?.resetsAt === new Date(1_791_460_800_000).toISOString()
  )

  const eventOnly = limitOf(rejected, null, true)
  check("a failed turn under a rejected limit is the limit", eventOnly !== null)
  check(
    "with a sentence of its own",
    eventOnly?.text === "Usage limit reached."
  )

  check(
    "a turn that succeeded under a rejected limit is not",
    limitOf(rejected, null, false) === null
  )
  check(
    "a failed turn under an allowed limit is an ordinary failure",
    limitOf({ status: "allowed", rateLimitType: "five_hour" }, null, true) ===
      null
  )

  const unsaid = limitOf(null, "Usage limit reached", true)
  check(
    "a flag with no event draws without a window or a reset",
    unsaid?.window === null && unsaid.resetsAt === null,
    unsaid
  )
  const stale = limitOf(
    { status: "allowed_warning", rateLimitType: "seven_day", resetsAt: 1 },
    "Usage limit reached",
    true
  )
  check(
    "a warning is not read as the window that stopped it",
    stale?.window === null && stale.resetsAt === null,
    stale
  )
}

section("stoppedOnLimit")
{
  const user: AssistantMessage = { id: "u", role: "user", text: "go" }
  const reply: AssistantMessage = { id: "a", role: "assistant", text: "done" }
  const limit: AssistantMessage = {
    id: "l",
    role: "limit",
    profileId: null,
    name: "Default account",
    window: "five_hour",
    resetsAt: null,
    text: "Usage limit reached.",
  }
  const usage: AssistantMessage = {
    id: "c",
    role: "usage",
    usage: {} as Extract<AssistantMessage, { role: "usage" }>["usage"],
  }
  const moved: AssistantMessage = {
    id: "m",
    role: "account",
    profileId: "work",
    name: "Work",
  }

  check("a chat that ended on a limit", stoppedOnLimit([user, limit]))
  check("with its cost line after it", stoppedOnLimit([user, limit, usage]))
  check(
    "and a move that did not carry it on",
    stoppedOnLimit([user, limit, usage, moved])
  )
  check(
    "not once the turn went on",
    !stoppedOnLimit([user, limit, moved, reply, usage])
  )
  check("not a chat that just answered", !stoppedOnLimit([user, reply, usage]))
  check("not an empty chat", !stoppedOnLimit([]))
}

section("limitSentence")
{
  const now = new Date("2026-10-08T10:00:00Z")
  check(
    "who, which window and when",
    limitSentence(
      "you@example.com",
      {
        window: "five_hour",
        resetsAt: "2026-10-08T13:08:00Z",
        text: "Usage limit reached.",
      },
      now
    ) === "Stopped. you@example.com reached its 5-hour limit · resets in 3h 8m"
  )
  check(
    "a reset that has passed is left off",
    limitSentence(
      "Work",
      {
        window: "seven_day",
        resetsAt: "2026-10-08T09:00:00Z",
        text: "Usage limit reached.",
      },
      now
    ) === "Stopped. Work reached its 7-day limit"
  )
  check(
    "no window, the CLI's own words",
    limitSentence(
      "Default account",
      {
        window: null,
        resetsAt: null,
        text: "You've hit your limit · resets 3pm",
      },
      now
    ) === "Stopped. Default account: You've hit your limit · resets 3pm"
  )
}

finish()
