import { chatOptions, type ChatOptions } from "../src/shared/api"
import { headOf, type Said } from "../src/main/chat"
import { check, finish, section } from "./harness"

/**
 * What goes at the head of a message: the mode's sentence and the `Concise`
 * toggle's, each said on the message where its setting moved and on no other.
 *
 * Worth a test because the failure is silent in both directions — a sentence
 * repeated on every message is the same paragraph billed forty times, and one
 * never said is a turn running read-only without being told, spending a tool
 * call to find out.
 */

function on(
  permission: ChatOptions["permission"],
  concise = false
): ChatOptions {
  return chatOptions({ model: null, effort: null, permission, concise })
}

section("the mode's sentence")

{
  const fresh = headOf(null, on("plan"))
  check("a fresh session is told its mode", fresh.head.length === 1, fresh)
  check(
    "and the sentence is the mode's",
    fresh.head[0]?.includes("read-only") === true,
    fresh.head
  )
  check(
    "which is then recorded as said",
    fresh.said.mode === "plan" && fresh.said.concise === false,
    fresh.said
  )

  const again = headOf(fresh.said, on("plan"))
  check("the same mode again says nothing", again.head.length === 0, again)

  const moved = headOf(fresh.said, on("read"))
  check(
    "a different mode says its own sentence",
    moved.head.length === 1 &&
      moved.head[0]?.includes("answer the question") === true,
    moved.head
  )
}

{
  const edits = headOf(null, on("edits"))
  check("a mode with no sentence says nothing", edits.head.length === 0, edits)
  check("but records itself", edits.said.mode === "edits", edits.said)

  const back = headOf(headOf(edits.said, on("plan")).said, on("edits"))
  check("and switching back to it says nothing", back.head.length === 0, back)
  const forth = headOf(back.said, on("plan"))
  check(
    "while plan after it is said afresh, not trusted from before",
    forth.head.length === 1,
    forth
  )
}

section("the Concise toggle")

{
  const quiet = headOf(null, on("edits"))
  check("off from the start says nothing", quiet.head.length === 0, quiet)

  const terse = headOf(quiet.said, on("edits", true))
  check(
    "switching on says the request once",
    terse.head.length === 1 &&
      terse.head[0]?.startsWith("Reply tersely") === true,
    terse.head
  )
  check("and records it", terse.said.concise === true, terse.said)

  const still = headOf(terse.said, on("edits", true))
  check("the next message under it says nothing", still.head.length === 0)

  const released = headOf(still.said, on("edits"))
  check(
    "switching off withdraws it",
    released.head.length === 1 &&
      released.head[0]?.includes("usual length") === true,
    released.head
  )
  check("and records that", released.said.concise === false, released.said)

  const twice = headOf(released.said, on("edits"))
  check("off after off says nothing", twice.head.length === 0, twice)
}

{
  // A fresh session (a reopened one, a profile switch) carries nothing, so the
  // toggle is said again — the same bargain the mode makes.
  const reopened = headOf(null, on("read", true))
  check(
    "a fresh session under both is told both, mode first",
    reopened.head.length === 2 &&
      reopened.head[0]?.includes("read-only") === true &&
      reopened.head[1]?.startsWith("Reply tersely") === true,
    reopened.head
  )
}

{
  const said: Said = { mode: "edits", concise: true }
  const released = headOf(said, on("edits"))
  check(
    "a record with concise absent reads as off, and is released",
    released.head.length === 1 && released.said.concise === false,
    released
  )
}

finish()
