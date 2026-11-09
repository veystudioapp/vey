import type { InboxItem, InboxKind, InboxSettings } from "./api"

/** The kinds, grouped and ordered as the settings show them. */
export const INBOX_KIND_GROUPS: { id: string; kinds: InboxKind[] }[] = [
  {
    id: "task",
    kinds: [
      "created",
      "status",
      "renamed",
      "description",
      "priority",
      "due",
      "tags",
    ],
  },
  { id: "people", kinds: ["assigned-me", "assigned", "mention"] },
  { id: "comments", kinds: ["comment", "comment-edited"] },
]

/** Every kind an inbox can list. */
export const INBOX_KINDS: InboxKind[] = INBOX_KIND_GROUPS.flatMap(
  (group) => group.kinds
)

/** The intervals offered, in minutes. One a minute is the floor: a list is a
 * request a page plus a comment read per active task, and ClickUp allows a
 * personal key 100 a minute across every inbox. */
export const INBOX_INTERVALS = [1, 2, 5, 10, 15, 30, 60]

export const DEFAULT_INBOX_SETTINGS: InboxSettings = {
  kinds: INBOX_KINDS,
  intervalMinutes: 2,
  onlyMine: false,
  hideOwn: false,
}

/**
 * Settings out of whatever arrived — a record written before there were any,
 * or the renderer — with every value checked: an unknown kind is dropped and
 * an interval not offered is the default, so a poll is never scheduled off a
 * number nobody chose.
 */
export function inboxSettingsOf(value: unknown): InboxSettings {
  const raw = (value ?? {}) as Partial<Record<keyof InboxSettings, unknown>>
  const kinds = Array.isArray(raw.kinds)
    ? INBOX_KINDS.filter((kind) => (raw.kinds as unknown[]).includes(kind))
    : DEFAULT_INBOX_SETTINGS.kinds
  const interval = INBOX_INTERVALS.includes(raw.intervalMinutes as number)
    ? (raw.intervalMinutes as number)
    : DEFAULT_INBOX_SETTINGS.intervalMinutes
  return {
    kinds,
    intervalMinutes: interval,
    onlyMine: raw.onlyMine === true,
    hideOwn: raw.hideOwn === true,
  }
}

/**
 * The kinds that are a sharper case of another: a comment that mentions you
 * is still a comment, and being assigned is still an assignment. One switched
 * off falls back to the broader one, so turning `mention` off does not lose
 * the comment it was.
 */
const BROADER: Partial<Record<InboxKind, InboxKind>> = {
  mention: "comment",
  "assigned-me": "assigned",
}

/** Whether an inbox with these settings lists this item. */
export function shows(settings: InboxSettings, item: InboxItem): boolean {
  const broader = BROADER[item.kind]
  const listed =
    settings.kinds.includes(item.kind) ||
    (broader !== undefined && settings.kinds.includes(broader))
  if (!listed) return false
  if (settings.hideOwn && item.byMe) return false
  // Whatever the task, what names you is yours.
  if (settings.onlyMine && !item.mine && broader === undefined) return false
  return true
}

/** Whether an inbox's comments need reading at all. */
export function readsComments(settings: InboxSettings): boolean {
  return (
    settings.kinds.includes("comment") ||
    settings.kinds.includes("mention") ||
    settings.kinds.includes("comment-edited")
  )
}
