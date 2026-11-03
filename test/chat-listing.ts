import type { AssistantMessage, Chat } from "../src/shared/api"
import { Chats } from "../src/main/chat"
import { check, finish, section } from "./harness"

/**
 * The chat listing under concurrent edits.
 *
 * Every change to `chats.json` is a read, a change and a write, and
 * the store only serialises the file operations, not the pairs. A chat
 * created while another chat's append was between its read and its write was
 * gone again once the append wrote back the list it had read, and `send`
 * could not find it. `editChats` is the queue that stops it; this is the race, run
 * against a source that yields between the read and the write the way a file
 * does.
 */

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

function source() {
  let listing: Chat[] = []
  const lines = new Map<string, AssistantMessage[]>()
  const chats = new Chats(
    {
      folderDir: async () => "/tmp",
      claudeProfiles: async () => [],
      chats: async () => {
        await tick()
        return listing
      },
      saveChats: async (next) => {
        await tick()
        listing = next
      },
      readChat: async (id) => lines.get(id) ?? [],
      writeChat: async (id, messages) => {
        lines.set(id, messages)
      },
      deleteChat: async () => undefined,
      writeImage: async () => undefined,
      readImage: async () => null,
    },
    () => undefined
  )
  return { chats, listing: () => listing }
}

section("two chats created at once")
{
  const { chats, listing } = source()
  const [a, b] = await Promise.all([
    chats.create({ folderId: "p" }),
    chats.create({ folderId: "p" }),
  ])
  check("both are in the listing", listing().length === 2)
  check(
    "and are the two that were made",
    listing()
      .map((chat) => chat.id)
      .sort()
      .join() === [a.id, b.id].sort().join()
  )
}

section("a create beside a rename")
{
  const { chats, listing } = source()
  const first = await chats.create({ folderId: "p" })
  const [, second] = await Promise.all([
    chats.rename(first.id, "Named"),
    chats.create({ folderId: "p" }),
  ])
  check("the rename landed", listing()[0]?.title === "Named")
  check(
    "and the chat created meanwhile survived it",
    listing().some((chat) => chat.id === second.id)
  )
}

section("a create beside a delete")
{
  const { chats, listing } = source()
  const first = await chats.create({ folderId: "p" })
  const [, second] = await Promise.all([
    chats.delete(first.id),
    chats.create({ folderId: "p" }),
  ])
  check("the deleted one is gone", !listing().some((c) => c.id === first.id))
  check(
    "the new one is there",
    listing().some((c) => c.id === second.id)
  )
}

section("a seed already listed")
{
  const { chats, listing } = source()
  const seed = { id: "11111111-1111-4111-8111-111111111111", title: "Seeded" }
  const [a, b] = await Promise.all([
    chats.create({ folderId: "p" }, seed),
    chats.create({ folderId: "p" }, seed),
  ])
  check("is one chat, not two", listing().length === 1)
  check("returned to both callers", a.id === b.id && a.title === "Seeded")
}

section("a plan limit marks the listing until the next message")
{
  const { chats, listing } = source()
  const chat = await chats.create({ folderId: "p" })
  // `append` is the one writer and is private; the projects column reads what
  // it leaves on the listing, so that is what is checked here.
  const append = (
    chats as unknown as {
      append: (id: string, line: AssistantMessage) => Promise<void>
    }
  ).append.bind(chats)
  const limited = () => listing().find((entry) => entry.id === chat.id)?.limit

  await append(chat.id, {
    id: "l1",
    role: "limit",
    profileId: "work",
    name: "Work",
    window: "five_hour",
    resetsAt: "2026-10-23T14:30:00Z",
    text: "limit reached",
  })
  check(
    "the limit line marks the chat",
    limited()?.window === "five_hour" && limited()?.profileId === "work"
  )

  await append(chat.id, { id: "a1", role: "assistant", text: "…" })
  check("a later reply leaves the mark", limited() !== undefined)

  await append(chat.id, {
    id: "u0",
    role: "user",
    text: "subagent",
    parent: "t1",
  })
  check(
    "a subagent's prompt is not somebody moving on",
    limited() !== undefined
  )

  await append(chat.id, { id: "u1", role: "user", text: "Continue." })
  check("the next message clears it", limited() === undefined)
}

finish()
