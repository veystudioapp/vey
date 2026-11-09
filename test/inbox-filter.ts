import type { InboxItem } from "../src/shared/api"
import {
  assigneesIn,
  dayStart,
  filterItems,
  isFiltered,
  NO_FILTER,
  tasksOf,
} from "../src/renderer/lib/inbox/filter"
import { check, finish, section } from "./harness"

const NOW = Date.parse("2026-11-09T10:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

function item(id: string, more: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    kind: "status",
    taskId: "t1",
    taskName: "Fix login",
    url: "https://app.clickup.com/t/t1",
    from: "open",
    fromColor: null,
    to: "review",
    color: null,
    by: null,
    text: null,
    before: null,
    after: null,
    at: NOW - 60_000,
    read: false,
    assignees: ["Lan"],
    ...more,
  }
}

const items = [
  item("a"),
  item("b", {
    kind: "comment",
    taskId: "t2",
    taskName: "Docs",
    by: "Minh",
    text: "please check the API page",
    at: NOW - 3 * DAY,
    read: true,
    assignees: [],
  }),
  item("c", {
    kind: "assigned-me",
    taskId: "t3",
    taskName: "Billing",
    at: NOW - 20 * DAY,
    mine: true,
    assignees: ["Lan", "Harry"],
  }),
  item("d", { kind: "description", at: NOW - 40 * DAY, assignees: undefined }),
]
const ids = (filter: Partial<typeof NO_FILTER>) =>
  filterItems(items, { ...NO_FILTER, ...filter }, NOW)
    .map((each) => each.id)
    .join()

section("filterItems")
check("no filter keeps everything", ids({}) === "a,b,c,d")
check("nothing set is not filtered", !isFiltered(NO_FILTER))
check("a week back", ids({ since: "week" }) === "a,b")
check("a month back", ids({ since: "month" }) === "a,b,c")
check("unread only", ids({ unread: true }) === "a,c,d")
check("by kind group", ids({ group: "comments" }) === "b")
check("assigned to me", ids({ assignee: "me" }) === "c")
check(
  "assigned to a person; an item that never carried assignees is not guessed",
  ids({ assignee: "Lan" }) === "a,c"
)
check("unassigned", ids({ assignee: "none" }) === "b")
check(
  "search matches the task, who and what was said, every word",
  ids({ query: "api minh" }) === "b" && ids({ query: "billing" }) === "c"
)
check("filters combine", ids({ since: "month", unread: true }) === "a,c")

const day = (ms: number) => {
  const at = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}
check(
  "a date range is inclusive of both days",
  ids({ since: "range", from: day(NOW - 20 * DAY), to: day(NOW - 3 * DAY) }) ===
    "b,c"
)
check(
  "a range open at its end runs to now",
  ids({ since: "range", from: day(NOW - 3 * DAY) }) === "a,b"
)
check(
  "a range open at its start runs from the first",
  ids({ since: "range", to: day(NOW - 20 * DAY) }) === "c,d"
)
check(
  "a range with no days picked filters nothing",
  ids({ since: "range" }) === "a,b,c,d" &&
    !isFiltered({ ...NO_FILTER, since: "range" })
)
check(
  "a day is this machine's midnight, not UTC's",
  dayStart("2026-11-09") === new Date(2026, 10, 9).getTime() &&
    dayStart("not a day") === null
)
check(
  "the people named, sorted, once each",
  assigneesIn(items).join() === "Harry,Lan"
)

section("tasksOf")
const grouped = tasksOf([
  item("x1", { at: NOW - 5000, read: true, taskName: "Old name" }),
  item("y1", { taskId: "t9", taskName: "Other", at: NOW - 2000 }),
  item("x2", { at: NOW - 1000, taskName: "New name" }),
])
check(
  "the task with the newest change first",
  grouped.map((group) => group.taskId).join() === "t1,t9"
)
check(
  "a task's items newest first, named by the newest",
  grouped[0]!.items.map((each) => each.id).join() === "x2,x1" &&
    grouped[0]!.taskName === "New name"
)
check("unread counted per task", grouped[0]!.unread === 1)

finish()
