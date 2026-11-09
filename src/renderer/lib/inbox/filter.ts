import type { InboxItem } from "@shared/api"
import { INBOX_KIND_GROUPS } from "@shared/inbox"

/**
 * The inbox tab's own filter bar: narrowing what is already listed, for
 * reading. Not the inbox's settings — those decide what an inbox keeps
 * showing and are saved; this is a look, held per project for the run.
 */
export type InboxFilter = {
  query: string
  /** A span back from now, or `range` for `from`–`to`. */
  since: "all" | "today" | "week" | "month" | "range"
  /** `YYYY-MM-DD`, a day on this machine's calendar, as a date input gives
   * it; both inclusive. Either may be empty — open at that end. Read only
   * while `since` is `range`. */
  from: string
  to: string
  /** `me`, `none` (nobody assigned), a person's name, or null for anyone. */
  assignee: string | null
  /** A group of `INBOX_KIND_GROUPS`, or null for every kind. */
  group: string | null
  unread: boolean
}

export const NO_FILTER: InboxFilter = {
  query: "",
  since: "all",
  from: "",
  to: "",
  assignee: null,
  group: null,
  unread: false,
}

export function isFiltered(filter: InboxFilter): boolean {
  return (
    filter.query.trim() !== "" ||
    (filter.since === "range"
      ? filter.from !== "" || filter.to !== ""
      : filter.since !== "all") ||
    filter.assignee !== null ||
    filter.group !== null ||
    filter.unread
  )
}

const DAY = 24 * 60 * 60 * 1000

/** A `YYYY-MM-DD` as that day's first moment on this machine, or null. Not
 * `Date.parse`, which reads a bare date as UTC midnight rather than this
 * machine's, and so starts the day hours off anywhere but Greenwich. */
export function dayStart(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const at = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(at.getTime()) ? null : at.getTime()
}

/** The span a filter keeps, `[from, to)` in ms. */
function spanOf(filter: InboxFilter, now: number): [number, number] {
  if (filter.since === "range") {
    const from = dayStart(filter.from) ?? 0
    const last = dayStart(filter.to)
    // Through the end of the last day, which a midnight would cut off.
    const to = last === null ? Infinity : last + DAY
    return [from, to]
  }
  return [sinceOf(filter.since, now), Infinity]
}

/** The earliest moment `since` keeps, by this machine's day for `today`. */
function sinceOf(since: InboxFilter["since"], now: number): number {
  if (since === "all" || since === "range") return 0
  if (since === "today") {
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    return midnight.getTime()
  }
  return now - (since === "week" ? 7 : 30) * DAY
}

/** Everything a search can find an item by: the task, who, what was said,
 * and what a field was and became. */
function searchable(item: InboxItem): string {
  return [
    item.taskName,
    item.by,
    item.text,
    item.after,
    item.from,
    item.to,
    ...(item.assignees ?? []),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .toLowerCase()
}

/** The items a filter keeps, in their order. */
export function filterItems(
  items: InboxItem[],
  filter: InboxFilter,
  now: number = Date.now()
): InboxItem[] {
  const [from, to] = spanOf(filter, now)
  const words = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const kinds =
    filter.group === null
      ? null
      : (INBOX_KIND_GROUPS.find((group) => group.id === filter.group)?.kinds ??
        [])
  return items.filter((item) => {
    if (filter.unread && item.read) return false
    if (item.at < from || item.at >= to) return false
    if (kinds && !kinds.includes(item.kind)) return false
    if (filter.assignee !== null && !assignedTo(item, filter.assignee)) {
      return false
    }
    if (words.length > 0) {
      const text = searchable(item)
      if (!words.every((word) => text.includes(word))) return false
    }
    return true
  })
}

/** An item from before assignees were carried matches only `me`, which it
 * did carry — saying it was nobody's would be a guess. */
function assignedTo(item: InboxItem, assignee: string): boolean {
  if (assignee === "me") return item.mine === true
  if (item.assignees === undefined) return false
  if (assignee === "none") return item.assignees.length === 0
  return item.assignees.includes(assignee)
}

/** The people the items name as assignees, for the filter's list. */
export function assigneesIn(items: InboxItem[]): string[] {
  const names = new Set<string>()
  for (const item of items) {
    for (const name of item.assignees ?? []) if (name) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/** One task's items, for the inbox's `Tasks` view. */
export type TaskGroup = {
  taskId: string
  /** As the newest item names it — a rename is the task's name from then. */
  taskName: string
  url: string
  /** Newest first. */
  items: InboxItem[]
  unread: number
  /** The newest item's `at`. */
  at: number
}

/** Items grouped by task, the task with the newest change first. */
export function tasksOf(items: InboxItem[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>()
  for (const item of [...items].sort((a, b) => b.at - a.at)) {
    let group = groups.get(item.taskId)
    if (!group) {
      group = {
        taskId: item.taskId,
        taskName: item.taskName,
        url: item.url,
        items: [],
        unread: 0,
        at: item.at,
      }
      groups.set(item.taskId, group)
    }
    group.items.push(item)
    if (!item.read) group.unread += 1
  }
  return [...groups.values()]
}
