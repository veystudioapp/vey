import {
  commentsOf,
  hexColor,
  listOfView,
  listRefIn,
  mentionsIn,
  taskRowOf,
  type CommentRow,
  type TaskRow,
} from "../src/main/clickup"
import {
  baselineOf,
  commentTargets,
  threadTargets,
  ClickupInbox,
  foldPoll,
  MAX_ITEMS,
  viewOf,
  type InboxRecord,
} from "../src/main/clickup-inbox"
import {
  INBOX_KINDS,
  inboxSettingsOf,
  readsComments,
} from "../src/shared/inbox"
import { check, finish, section } from "./harness"

const NOW = "2026-11-09T10:00:00.000Z"
const NOW_MS = Date.parse(NOW)

section("listRefIn")
const ref = (typed: string) => JSON.stringify(listRefIn(typed))
check("a bare id", ref(" 901812345678 ") === '{"list":"901812345678"}')
check(
  "a list link",
  ref("https://app.clickup.com/9018123/v/li/901812345678") ===
    '{"list":"901812345678"}'
)
check(
  "an older view link carries its list",
  ref("https://app.clickup.com/9018123/v/l/6-901812345678-1?pr=1") ===
    '{"list":"901812345678"}'
)
check(
  "a view link is a view, its list asked of ClickUp",
  ref("https://app.clickup.com/90181720832/v/l/2kzkzpr0-438") ===
    '{"view":"2kzkzpr0-438"}'
)
check(
  "a board view too",
  ref("https://app.clickup.com/90181720832/v/b/2kzkzpr0-418/") ===
    '{"view":"2kzkzpr0-418"}'
)
check(
  "a task link is not a list",
  listRefIn("https://app.clickup.com/t/86eypqmta") === null
)
check(
  "another host is refused",
  listRefIn("https://example.com/v/li/901812345678") === null
)
check("words are refused", listRefIn("my list") === null)

section("listOfView")
check(
  "a list's view gives the list",
  listOfView({ view: { parent: { id: "901812345678", type: 6 } } }) ===
    "901812345678"
)
check(
  "a numeric id and a string type are read too",
  listOfView({ view: { parent: { id: 901812345678, type: "6" } } }) ===
    "901812345678"
)
check(
  "a folder's view is refused",
  typeof listOfView({ view: { parent: { id: "9", type: 5 } } }) === "object"
)
check("no view is refused", typeof listOfView({}) === "object")

section("narrowing")
const row = taskRowOf({
  id: "abc",
  name: "Fix login",
  status: { status: "in progress", color: "#ff0000" },
  url: "javascript:alert(1)",
  date_created: "1000",
  date_updated: "",
})
check("an id-less task is dropped", taskRowOf({ name: "x" }) === null)
check("a status is read", row?.status === "in progress")
check(
  "a foreign url is replaced by ClickUp's",
  row?.url === "https://app.clickup.com/t/abc"
)
check("an empty timestamp is 0, not NaN", row?.updatedAt === 0)
check("a hex colour passes", hexColor("#1a2B3c") === "#1a2B3c")
check("anything else does not", hexColor("red;background:url(x)") === null)
const comments = commentsOf({
  comments: [
    { id: "2", comment_text: "second", date: "200", user: { username: "B" } },
    { id: "1", comment_text: "first", date: "100", user: { username: "A" } },
    { comment_text: "no id" },
  ],
})
check(
  "comments come oldest first, id-less ones dropped",
  comments.map((comment) => comment.id).join() === "1,2"
)

section("baseline")
function task(
  id: string,
  status: string,
  updatedAt: number,
  more: Partial<TaskRow> = {}
): TaskRow {
  return {
    id,
    name: `Task ${id}`,
    status,
    statusColor: null,
    url: `https://app.clickup.com/t/${id}`,
    createdAt: 1,
    updatedAt,
    description: "Users sign in with email.",
    assignees: [{ id: "7", name: "Lan" }],
    priority: "normal",
    due: null,
    tags: ["web"],
    creator: null,
    ...more,
  }
}
function said(
  id: string,
  by: string,
  text: string,
  at: number,
  more: Partial<CommentRow> = {}
): CommentRow {
  return { id, by, byId: `id-${by}`, text, at, mentions: [], ...more }
}
const list = { id: "L", name: "Sprint" }
const base = baselineOf(
  "F",
  list,
  [task("a", "open", 50), task("b", "open", 80)],
  999
)
check("nothing already there is announced", base.items.length === 0)
check("the cursor is the newest update", base.cursor === 80)
check(
  "an empty list starts at this machine's time",
  baselineOf("F", list, [], 999).cursor === 999
)

section("foldPoll")
const none = new Map<string, CommentRow[]>()
const moved = foldPoll(
  base,
  [task("a", "review", 120), task("c", "open", 110)],
  none,
  NOW
)
const kinds = moved.record.items.map((item) => `${item.kind}:${item.taskId}`)
check(
  "a status move and a new task, newest first",
  kinds.join() === "status:a,created:c",
  kinds
)
check(
  "the status move says from and to",
  moved.record.items[0]?.from === "open" &&
    moved.record.items[0]?.to === "review"
)
check(
  "new items are unread",
  moved.record.items.every((item) => !item.read)
)
check("the cursor moves on", moved.record.cursor === 120)
check(
  "seen follows",
  JSON.stringify(moved.record.seen.a) ===
    JSON.stringify({
      status: "review",
      statusColor: null,
      name: "Task a",
      url: "https://app.clickup.com/t/a",
      body: "Users sign in with email.",
      assignees: { "7": "Lan" },
      priority: "normal",
      due: null,
      tags: ["web"],
    })
)

const untouched = foldPoll(base, [task("a", "open", 90)], none, NOW)
check(
  "an update that changes nothing followed announces nothing",
  untouched.added === 0
)

const edited = foldPoll(
  base,
  [
    task("a", "open", 140, {
      name: "Fix login",
      description: "Users sign in with email or Google.",
    }),
  ],
  none,
  NOW
)
check(
  "a rename and a description edit, each an item",
  edited.record.items.map((item) => item.kind).join() === "renamed,description",
  edited.record.items
)
check(
  "the rename says from and to",
  edited.record.items[0]?.from === "Task a" &&
    edited.record.items[0]?.to === "Fix login"
)
check(
  "the rename's row carries the new name",
  edited.record.items[0]?.taskName === "Fix login"
)
check(
  "the description edit carries both texts, for the diff",
  edited.record.items[1]?.before === "Users sign in with email." &&
    edited.record.items[1]?.after === "Users sign in with email or Google."
)
const reflowed = foldPoll(
  base,
  [task("a", "open", 145, { description: "Users  sign in\nwith email." })],
  none,
  NOW
)
check("a description only reflowed is not edited", reflowed.added === 0)
const colored = foldPoll(
  baselineOf(
    "F",
    list,
    [task("a", "open", 50, { statusColor: "#aaaaaa" })],
    999
  ),
  [task("a", "done", 170, { statusColor: "#00ff00" })],
  none,
  NOW
)
check(
  "a status move carries both colours",
  colored.record.items[0]?.fromColor === "#aaaaaa" &&
    colored.record.items[0]?.color === "#00ff00"
)

const fresh = foldPoll(
  base,
  [task("n", "open", 150, { name: "Named later", description: "Spec" })],
  none,
  NOW
)
check(
  "a new task is only new, not renamed too",
  fresh.record.items.map((item) => item.kind).join() === "created"
)
check("and carries its description", fresh.record.items[0]?.after === "Spec")

const legacy = foldPoll(
  { ...base, seen: { a: "open" } },
  [task("a", "open", 160, { name: "Other", description: "Else" })],
  none,
  NOW
)
check(
  "a status-only record from before announces no rename or edit",
  legacy.added === 0
)
check(
  "and is filled in for next time",
  typeof legacy.record.seen.a === "object"
)

const talk = foldPoll(
  base,
  [task("b", "open", 130)],
  new Map([
    [
      "b",
      [
        said("old", "A", "before", 70),
        said("new", "B", "after\n\nthe  cursor", 125),
      ],
    ],
  ]),
  NOW
)
check(
  "only comments after the cursor are new",
  talk.record.items.map((item) => item.id).join() === "comment:new"
)
check(
  "a comment is one line",
  talk.record.items[0]?.text === "after the cursor"
)

const again = foldPoll(
  { ...talk.record, cursor: base.cursor },
  [task("b", "open", 130)],
  new Map([["b", [said("new", "B", "after\n\nthe  cursor", 125)]]]),
  NOW
)
check("an item found twice is listed once", again.added === 0)

const reworded = foldPoll(
  talk.record,
  [task("b", "open", 140)],
  new Map([
    [
      "b",
      [
        said("old", "A", "before", 70),
        said("new", "B", "after, reworded", 125),
      ],
    ],
  ]),
  NOW
)
check(
  "a comment read before whose text changed was edited",
  reworded.record.items[0]?.kind === "comment-edited" &&
    reworded.record.items[0]?.text === "after, reworded" &&
    reworded.added === 1,
  reworded.record.items
)
check(
  "the edit is dated by the task's update",
  reworded.record.items[0]?.at === 140
)
check(
  "and carries the comment before and after",
  reworded.record.items[0]?.before === "after\n\nthe  cursor" &&
    reworded.record.items[0]?.after === "after, reworded"
)
check(
  "a new comment carries its whole text",
  talk.record.items[0]?.after === "after\n\nthe  cursor"
)
const spaced = foldPoll(
  talk.record,
  [task("b", "open", 150)],
  new Map([
    [
      "b",
      [
        said("old", "A", "before", 70),
        said("new", "B", "after the cursor", 125),
      ],
    ],
  ]),
  NOW
)
check("whitespace alone is not an edit", spaced.added === 0)

// The second edit of a comment, on a task ClickUp does not list as changed:
// its comments are re-read because the task was active, and the edit found.
const twice = foldPoll(
  reworded.record,
  [],
  new Map([
    [
      "b",
      [
        said("old", "A", "before", 70),
        said("new", "B", "after, reworded again", 125),
      ],
    ],
  ]),
  NOW
)
check(
  "a second edit is found on a re-read with no task update",
  twice.added === 1 &&
    twice.record.items[0]?.kind === "comment-edited" &&
    twice.record.items[0]?.before === "after, reworded" &&
    twice.record.items[0]?.after === "after, reworded again",
  twice.record.items
)
check(
  "it carries the task's last-seen name and link",
  twice.record.items[0]?.taskName === "Task b" &&
    twice.record.items[0]?.url === "https://app.clickup.com/t/b"
)
check("and is dated now", twice.record.items[0]?.at === NOW_MS)
const reread = foldPoll(
  twice.record,
  [],
  new Map([
    [
      "b",
      [
        said("old", "A", "before", 70),
        said("new", "B", "after, reworded again", 125),
      ],
    ],
  ]),
  NOW
)
check("the same edit read again is not a second item", reread.added === 0)

section("threads")
// ClickUp lists a task's comments without their replies; a thread is read on
// its own and its replies folded in beside them, carrying `parentId`.
const own = (replies: number) => [
  said("old", "A", "before", 70, { replies }),
  said("new", "B", "after, reworded again", 125),
]
const after = reread.record.cursor + 10
check(
  "a thread never read is one to read",
  JSON.stringify(
    threadTargets(reread.record, new Map([["b", own(1)]]), new Set())
  ) === JSON.stringify([{ taskId: "b", commentId: "old" }])
)
const threaded = foldPoll(
  reread.record,
  [],
  new Map([
    ["b", [...own(1), said("r1", "C", "a reply", after, { parentId: "old" })]],
  ]),
  NOW
)
check(
  "a reply after the cursor is a comment",
  threaded.added === 1 && threaded.record.items[0]?.id === "comment:r1",
  threaded.record.items
)
check(
  "a thread read at its count is not read again",
  threadTargets(threaded.record, new Map([["b", own(1)]]), new Set()).length ===
    0
)
check(
  "unless its task changed, for an edit",
  threadTargets(threaded.record, new Map([["b", own(1)]]), new Set(["b"]))
    .length === 1
)
check(
  "or its count moved",
  threadTargets(threaded.record, new Map([["b", own(2)]]), new Set()).length ===
    1
)
const late = foldPoll(
  threaded.record,
  [],
  new Map([
    [
      "b",
      [
        ...own(2),
        said("r1", "C", "a reply", after, { parentId: "old" }),
        said("r0", "D", "a late reply", 5, { parentId: "old" }),
      ],
    ],
  ]),
  NOW
)
check(
  "a reply new to a thread read before is new whatever its date",
  late.added === 1 && late.record.items[0]?.id === "comment:r0",
  late.record.items
)
const notReread = foldPoll(late.record, [], new Map([["b", own(2)]]), NOW)
const keptThread = notReread.record.seen.b
check(
  "a thread not read this poll keeps what it was read as",
  typeof keptThread === "object" &&
    keptThread.threads?.old?.said.r1 === "a reply" &&
    keptThread.threads.old.count === 2
)
const replyEdited = foldPoll(
  notReread.record,
  [],
  new Map([
    [
      "b",
      [
        ...own(2),
        said("r1", "C", "a reply, reworded", after, { parentId: "old" }),
        said("r0", "D", "a late reply", 5, { parentId: "old" }),
      ],
    ],
  ]),
  NOW
)
check(
  "an edited reply is an edit",
  replyEdited.added === 1 &&
    replyEdited.record.items[0]?.kind === "comment-edited" &&
    replyEdited.record.items[0]?.before === "a reply",
  replyEdited.record.items
)
const counted = commentsOf({
  comments: [{ id: "1", comment_text: "x", date: "1", reply_count: "2" }],
})
check("a comment's reply count is read", counted[0]?.replies === 2)
check(
  "a reply carries its thread",
  commentsOf({ comments: [{ id: "9", date: "1" }] }, "1")[0]?.parentId === "1"
)

section("commentTargets")
const recently = {
  ...base,
  active: { b: NOW_MS - 60_000, a: NOW_MS - 2 * 24 * 60 * 60 * 1000 },
}
const targets = commentTargets(recently, [task("c", "open", 300)], NOW_MS)
check(
  "the changed tasks first, then the recently active",
  targets.join() === "c,b",
  targets
)
check(
  "a task quiet for longer than a day is not re-read",
  !targets.includes("a")
)
const lately = foldPoll(
  base,
  [task("b", "open", NOW_MS - 5_000)],
  new Map([["b", []]]),
  NOW
)
check(
  "a poll marks a task it saw change as active",
  lately.record.active?.b === NOW_MS - 5_000
)
check(
  "and drops one quiet for longer than a day",
  foldPoll(recently, [], none, NOW).record.active?.a === undefined
)
const unread = foldPoll(
  base,
  [task("a", "open", 160)],
  new Map([["a", [said("x", "A", "never read before", 10)]]]),
  NOW
)
check(
  "a comment never read before is not an edit, only remembered",
  unread.added === 0 &&
    typeof unread.record.seen.a === "object" &&
    unread.record.seen.a.said?.x === "never read before"
)

const full = foldPoll(
  {
    ...base,
    items: Array.from({ length: MAX_ITEMS }, (_, i) => ({
      ...moved.record.items[0]!,
      id: `old:${i}`,
    })),
  },
  [task("z", "open", 200)],
  none,
  NOW
)
check(
  "the inbox is capped, the oldest dropped",
  full.record.items.length === MAX_ITEMS &&
    full.record.items[0]?.id === "created:z"
)

section("people and fields")
const ME = "9"
const team = baselineOf("F", list, [task("p", "open", 50)], 999)
const handed = foldPoll(
  team,
  [
    task("p", "open", 210, {
      assignees: [
        { id: "7", name: "Lan" },
        { id: ME, name: "Harry" },
      ],
      priority: "urgent",
      due: 1_800_000_000_000,
      tags: ["web", "bug"],
    }),
  ],
  none,
  NOW,
  ME
)
const kindsOf = (items: { kind: string }[]) =>
  items
    .map((item) => item.kind)
    .sort()
    .join()
check(
  "an assignment to me, priority, due date and tags, each an item",
  kindsOf(handed.record.items) === "assigned-me,due,priority,tags",
  handed.record.items
)
const handedTo = handed.record.items.find((i) => i.kind === "assigned-me")
check(
  "the assignment says who before and after",
  handedTo?.from === "Lan" && handedTo?.to === "Lan, Harry"
)
check(
  "and the task is mine from then",
  handed.record.items.every((item) => item.mine === true)
)
const reordered = foldPoll(
  handed.record,
  [
    task("p", "open", 220, {
      assignees: [
        { id: ME, name: "Harry" },
        { id: "7", name: "Lan" },
      ],
      priority: "urgent",
      due: 1_800_000_000_000,
      tags: ["bug", "web"],
    }),
  ],
  none,
  NOW,
  ME
)
check("assignees or tags reordered are not a change", reordered.added === 0)
const others = foldPoll(
  team,
  [task("p", "open", 230, { assignees: [{ id: "8", name: "Minh" }] })],
  none,
  NOW,
  ME
)
check(
  "somebody else assigned is an assignee change, not mine",
  others.record.items[0]?.kind === "assigned" &&
    others.record.items[0]?.mine === false
)
const fromOld = foldPoll(
  { ...team, seen: { p: { status: "open", name: "Task p" } } },
  [task("p", "open", 240, { priority: "high", tags: [] })],
  none,
  NOW,
  ME
)
check(
  "a record from before these fields announces none of them",
  fromOld.added === 0
)
const madeMine = foldPoll(
  team,
  [task("q", "open", 250, { assignees: [{ id: ME, name: "Harry" }] })],
  none,
  NOW,
  ME
)
const byMe = foldPoll(
  team,
  [
    task("r", "open", 270, { creator: { id: ME, name: "Harry" } }),
    task("s", "open", 271, { creator: { id: "7", name: "Lan" } }),
  ],
  none,
  NOW,
  ME
)
const createdR = byMe.record.items.find((item) => item.taskId === "r")
const createdS = byMe.record.items.find((item) => item.taskId === "s")
check(
  "a new task names who made it",
  createdS?.by === "Lan" && createdS?.byMe === false
)
check("one I made is mine to hide", createdR?.byMe === true)
check(
  "hiding my own hides the task I made and keeps the other",
  viewOf({
    ...byMe.record,
    settings: inboxSettingsOf({ hideOwn: true }),
  })
    .items.map((item) => item.taskId)
    .join() === "s"
)
check(
  "the creator is read off the task",
  taskRowOf({ id: "x", creator: { id: 9, username: "Harry" } })?.creator?.id ===
    "9"
)
check(
  "a new task made assigned to me is new and assigned to me",
  kindsOf(madeMine.record.items) === "assigned-me,created"
)
const pinged = foldPoll(
  team,
  [task("p", "open", 260)],
  new Map([
    [
      "p",
      [
        said("m1", "Lan", "@Harry can you look", 255, { mentions: [ME] }),
        said("m2", "Harry", "on it", 258, { byId: ME }),
      ],
    ],
  ]),
  NOW,
  ME
)
check(
  "a comment that mentions me is a mention",
  pinged.record.items.find((i) => i.id === "comment:m1")?.kind === "mention"
)
check(
  "my own comment is marked mine",
  pinged.record.items.find((i) => i.id === "comment:m2")?.byMe === true
)
check(
  "without knowing who I am, nothing is mine",
  foldPoll(
    team,
    [task("p", "open", 260)],
    new Map([["p", [said("m1", "Lan", "hi", 255, { mentions: [ME] })]]]),
    NOW
  ).record.items[0]?.kind === "comment"
)
check(
  "mentions are read off the rich text's tag blocks",
  mentionsIn([
    { text: "hey " },
    { type: "tag", user: { id: 9, username: "Harry" } },
    { type: "tag", user: { id: 9, username: "Harry" } },
  ]).join() === "9"
)

section("settings")
check(
  "a record with none reads as every kind every two minutes",
  JSON.stringify(inboxSettingsOf(undefined)) ===
    JSON.stringify({
      kinds: INBOX_KINDS,
      intervalMinutes: 2,
      onlyMine: false,
      hideOwn: false,
    })
)
check(
  "an unknown kind is dropped, the known ones kept in order",
  inboxSettingsOf({
    kinds: ["comment", "bogus", "status"],
    intervalMinutes: 5,
  }).kinds.join() === "status,comment"
)
check(
  "an interval not offered is the default",
  inboxSettingsOf({ kinds: [], intervalMinutes: 0.01 }).intervalMinutes === 2
)
check(
  "no kinds at all is a choice, not a default",
  inboxSettingsOf({ kinds: [] }).kinds.length === 0
)
check(
  "comments are read only while a comment kind is listed",
  !readsComments(inboxSettingsOf({ kinds: ["status"] })) &&
    readsComments(inboxSettingsOf({ kinds: ["mention"] }))
)

const mixed: InboxRecord = {
  ...talk.record,
  items: [...talk.record.items, ...moved.record.items],
  settings: inboxSettingsOf({ kinds: ["status"], intervalMinutes: 5 }),
}
const shown = viewOf(mixed)
check(
  "the view lists only the kinds switched on",
  shown.items.every((item) => item.kind === "status") &&
    shown.items.length === 1
)
check("the view carries its settings", shown.settings.intervalMinutes === 5)

const people = pinged.record.items
const viewWith = (settings: object) =>
  viewOf({ ...pinged.record, settings: inboxSettingsOf(settings) })
    .items.map((item) => item.id)
    .sort()
    .join()
check(
  "a mention switched off still shows as a comment",
  viewWith({ kinds: ["comment"] }) === "comment:m1,comment:m2"
)
check(
  "a mention alone shows only the mention",
  viewWith({ kinds: ["mention"] }) === "comment:m1"
)
check(
  "my own comments can be hidden",
  viewWith({ kinds: ["comment", "mention"], hideOwn: true }) === "comment:m1"
)
check(
  "only mine keeps a mention on a task that is not mine",
  people.every((item) => item.mine === false) &&
    viewWith({ kinds: ["comment", "mention"], onlyMine: true }) === "comment:m1"
)

let stored: InboxRecord[] = [mixed]
const inbox = new ClickupInbox({
  source: async () => null,
  read: async () => stored,
  write: async (records) => {
    stored = records
  },
  folderIds: async () => ["F"],
  onChange: () => {},
})
await inbox.markRead("F", null)
check(
  "Mark all read reads what is shown and leaves a hidden kind unread",
  stored[0]!.items.every((item) => item.read === (item.kind === "status"))
)
await inbox.setSettings("F", {
  kinds: ["comment", "nope"],
  intervalMinutes: 15,
})
check(
  "saved settings are narrowed in main",
  JSON.stringify(stored[0]!.settings) ===
    JSON.stringify({
      kinds: ["comment"],
      intervalMinutes: 15,
      onlyMine: false,
      hideOwn: false,
    })
)

finish()
