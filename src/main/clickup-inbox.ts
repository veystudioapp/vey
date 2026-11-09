import { createHash } from "node:crypto"

import type { InboxItem, InboxSettings, ProjectInbox } from "../shared/api"
import { inboxSettingsOf, readsComments, shows } from "../shared/inbox"
import {
  listRefIn,
  sameText,
  type ClickupSource,
  type CommentRow,
  type Person,
  type TaskRow,
} from "./clickup"

/**
 * Each project's **ClickUp inbox**: one list per project, polled by main, what
 * changed in it kept as items the project's `Inbox` tab lists, each carrying
 * what it was and what it became (`docs/design.md` § The ClickUp inbox).
 *
 * The poll lives here rather than in the renderer because the point of an
 * inbox is that it filled while nobody was looking at it. Free of `electron`:
 * how ClickUp is read (`ClickupSource`) and the file are handed in, and
 * `foldPoll` — the part that
 * can be wrong — is what `test/clickup-inbox.ts` checks.
 */

/** What `workspace/clickup-inbox.json` holds per project: the inbox, plus
 * what the next poll is diffed against. Never sent to the renderer. */
export type InboxRecord = Omit<ProjectInbox, "settings"> & {
  /** Absent until somebody changes one — `inboxSettingsOf` is the default. */
  settings?: InboxSettings
  /** The newest `date_updated` seen, ClickUp's clock, ms — the next poll asks
   * for tasks updated after it, and a comment after it is new. */
  cursor: number
  /** Each task as last seen. A task missing here is new. A bare string is a
   * status alone, from before more was followed. */
  seen: Record<string, SeenTask | string>
  /** When each task last had anything happen — its update or its newest
   * comment, ms — for `commentTargets`. Absent in a record from before. */
  active?: Record<string, number>
}

/**
 * What a task is diffed against. Whatever is absent — from a bare status, or
 * an entry that kept hashes under other names — is filled on the task's next
 * change and only compared from then, so nothing is announced off a guess.
 */
export type SeenTask = {
  status: string
  statusColor?: string | null
  name?: string
  /** For an item about a task whose comments were re-read without the task. */
  url?: string
  /** The description's text, `TaskRow.description`. */
  body?: string
  /** Each comment's text by id, for the comments last read — the newest 25
   * ClickUp answers with. Absent until they are first read, so an edit is only
   * seen to a comment read once before it. */
  said?: Record<string, string>
  /** Name by id. */
  assignees?: Record<string, string>
  priority?: string | null
  due?: number | null
  tags?: string[]
}

function seenOf(
  task: TaskRow,
  said: Record<string, string> | undefined,
  /** The description last seen, kept when this reading has none. */
  body?: string
): SeenTask {
  const text = task.description ?? body
  return {
    status: task.status,
    statusColor: task.statusColor,
    name: task.name,
    url: task.url,
    ...(text !== undefined ? { body: text } : {}),
    assignees: Object.fromEntries(
      task.assignees.map((person) => [person.id, person.name])
    ),
    priority: task.priority,
    due: task.due,
    tags: task.tags,
    ...(said ? { said } : {}),
  }
}

/** Items kept per inbox, newest first. Past it the oldest go: ClickUp itself
 * is where history lives. */
export const MAX_ITEMS = 300

/** How often the timer looks for an inbox that is due. Each inbox is polled
 * on its own `intervalMinutes`, the smallest of which is one. */
const TICK_MS = 60 * 1000

/** Not at launch: the window is still being built. */
const FIRST_MS = 15 * 1000

/** Comment reads per poll. A bulk edit moving 200 tasks would otherwise spend
 * the sign-in's minute on one tick; the newest are read and the rest's
 * comments are still found by date on the task's next change. */
const MAX_COMMENT_READS = 40

/**
 * How long after a task's last activity its comments go on being re-read.
 *
 * Reading them only when the task's `date_updated` moves missed an edit: a
 * comment edited a second time was not announced, either because an edit does
 * not move the task's date or because the read came back with the text from
 * before it — and once the cursor was past that update the task was never read
 * again. So a task that moved recently has its comments read on every poll
 * for a day, whatever its date says.
 */
const ACTIVE_MS = 24 * 60 * 60 * 1000

/**
 * The tasks whose comments one poll reads, newest first and at most
 * `MAX_COMMENT_READS`: the ones ClickUp says changed, then the ones active
 * within `ACTIVE_MS` of `now`.
 */
export function commentTargets(
  record: InboxRecord,
  tasks: TaskRow[],
  now: number
): string[] {
  const changed = [...tasks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((task) => task.id)
  const recent = Object.entries(record.active ?? {})
    .filter(([id, at]) => at >= now - ACTIVE_MS && !changed.includes(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
  return [...changed, ...recent].slice(0, MAX_COMMENT_READS)
}

/** An edit's id: the comment and both texts, so the same edit read on two
 * polls is one item and a second edit to the same comment is another. */
function editId(commentId: string, before: string, after: string): string {
  const digest = createHash("sha1")
    .update(`${before}\u0000${after}`)
    .digest("base64url")
    .slice(0, 16)
  return `comment-edited:${commentId}:${digest}`
}

/** A comment as a row's line: one line, cut. */
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat
}

/**
 * A connect's first reading: every task as it stands, and the cursor at the
 * newest of them — so a list followed a second ago announces nothing.
 */
export function baselineOf(
  folderId: string,
  list: { id: string; name: string },
  tasks: TaskRow[],
  now: number,
  items: InboxItem[] = []
): InboxRecord {
  const seen: Record<string, SeenTask> = {}
  let cursor = 0
  for (const task of tasks) {
    seen[task.id] = seenOf(task, undefined)
    cursor = Math.max(cursor, task.updatedAt)
  }
  return {
    folderId,
    list,
    items,
    polledAt: new Date(now).toISOString(),
    error: null,
    // An empty list has no ClickUp time to start from, so this machine's.
    cursor: cursor || now,
    seen,
  }
}

/**
 * One poll's answer folded into an inbox.
 *
 * `tasks` are the ones ClickUp says were updated after `record.cursor`;
 * `comments` the ones read for them. A task not in `seen` is new, and only
 * that — unless it was made already assigned to `me`, which is said too; a
 * status, name, description, priority, due date, set of tags or of assignees
 * unlike `seen`'s changed; a comment dated after the old cursor was written
 * since the last poll, and one already read whose text no longer says the
 * same was edited. `me` — the signed-in user's id, null when unknown — turns an
 * assignment into `assigned-me`, a comment into `mention`, and marks what is
 * theirs (`mine`, `byMe`) for the settings to filter on. Each item carries the
 * before and the after, so the inbox shows what changed rather than the task.
 * Item ids are what they are about, so an item found twice — a re-run poll, a
 * comment read on two ticks — is listed once.
 */
export function foldPoll(
  record: InboxRecord,
  tasks: TaskRow[],
  comments: Map<string, CommentRow[]>,
  now: string,
  me: string | null = null
): { record: InboxRecord; added: number } {
  const known = new Set(record.items.map((item) => item.id))
  const seen = { ...record.seen }
  const nowMs = Date.parse(now)
  const active = { ...record.active }
  const touch = (id: string, at: number) => {
    active[id] = Math.max(active[id] ?? 0, at)
  }
  let cursor = record.cursor
  const fresh: InboxItem[] = []
  /** The current task's item with nothing said yet — `say` fills in what
   * each kind has. */
  let blank: Omit<InboxItem, "id" | "kind" | "at" | "read"> = EMPTY
  const say = (
    item: Partial<InboxItem> & Pick<InboxItem, "id" | "kind" | "at">
  ) => {
    if (known.has(item.id)) return
    known.add(item.id)
    fresh.push({ ...blank, ...item, read: false })
  }

  /** One task's comments against the texts last read: a new one, or one
   * whose text moved. `editAt` dates an edit, which ClickUp does not. */
  const readComments = (
    read: CommentRow[] | undefined,
    stored: SeenTask | string | undefined,
    editAt: number
  ) => {
    const said = (typeof stored === "object" && stored.said) || {}
    for (const comment of read ?? []) {
      const before = said[comment.id]
      if (comment.at > 0) touch(blank.taskId, comment.at)
      const byMe = me !== null && comment.byId === me
      if (before === undefined) {
        if (comment.at <= record.cursor) continue
        say({
          id: `comment:${comment.id}`,
          kind: me && comment.mentions.includes(me) ? "mention" : "comment",
          byMe,
          by: comment.by || null,
          text: oneLine(comment.text),
          after: comment.text,
          at: comment.at,
        })
      } else if (!sameText(before, comment.text)) {
        touch(blank.taskId, editAt)
        say({
          id: editId(comment.id, before, comment.text),
          kind: "comment-edited",
          byMe,
          by: comment.by || null,
          text: oneLine(comment.text),
          before,
          after: comment.text,
          at: editAt,
        })
      }
    }
  }

  for (const task of [...tasks].sort((a, b) => a.updatedAt - b.updatedAt)) {
    const assigned = task.assignees.map((person) => person.id)
    blank = {
      ...EMPTY,
      taskId: task.id,
      taskName: task.name,
      url: task.url,
      mine: me !== null && assigned.includes(me),
      assignees: task.assignees.map((person) => person.name),
    }
    const stored = seen[task.id]
    const was: SeenTask | undefined =
      typeof stored === "string" ? { status: stored } : stored
    if (was === undefined) {
      say({
        id: `created:${task.id}`,
        kind: "created",
        by: task.creator?.name || null,
        byMe: me !== null && task.creator?.id === me,
        to: task.status,
        color: task.statusColor,
        after: task.description,
        at: task.createdAt || task.updatedAt,
      })
      // A task made already yours is an assignment to you as well — an inbox
      // listing only those would otherwise never hear of it.
      if (me !== null && assigned.includes(me)) {
        say({
          id: `assigned:${task.id}:${task.updatedAt}`,
          kind: "assigned-me",
          to: names(task.assignees),
          at: task.createdAt || task.updatedAt,
        })
      }
    } else {
      const stamp = `${task.id}:${task.updatedAt}`
      if (was.status !== task.status) {
        say({
          id: `status:${stamp}`,
          kind: "status",
          from: was.status,
          fromColor: was.statusColor ?? null,
          to: task.status,
          color: task.statusColor,
          at: task.updatedAt,
        })
      }
      if (was.name !== undefined && was.name !== task.name) {
        say({
          id: `renamed:${stamp}`,
          kind: "renamed",
          from: was.name,
          to: task.name,
          at: task.updatedAt,
        })
      }
      if (
        was.body !== undefined &&
        task.description !== null &&
        !sameText(was.body, task.description)
      ) {
        say({
          id: `description:${stamp}`,
          kind: "description",
          before: was.body,
          after: task.description,
          at: task.updatedAt,
        })
      }
      if (was.priority !== undefined && was.priority !== task.priority) {
        say({
          id: `priority:${stamp}`,
          kind: "priority",
          from: was.priority,
          to: task.priority,
          at: task.updatedAt,
        })
      }
      if (was.due !== undefined && was.due !== task.due) {
        say({
          id: `due:${stamp}`,
          kind: "due",
          from: was.due === null ? null : String(was.due),
          to: task.due === null ? null : String(task.due),
          at: task.updatedAt,
        })
      }
      if (was.tags !== undefined && !sameSet(was.tags, task.tags)) {
        say({
          id: `tags:${stamp}`,
          kind: "tags",
          from: was.tags.join(", "),
          to: task.tags.join(", "),
          at: task.updatedAt,
        })
      }
      if (
        was.assignees !== undefined &&
        !sameSet(Object.keys(was.assignees), assigned)
      ) {
        const added = assigned.filter((id) => !(id in was.assignees!))
        say({
          id: `assigned:${stamp}`,
          kind: me !== null && added.includes(me) ? "assigned-me" : "assigned",
          from: Object.values(was.assignees).join(", "),
          to: names(task.assignees),
          at: task.updatedAt,
        })
      }
    }

    const read = comments.get(task.id)
    readComments(read, stored, task.updatedAt)
    seen[task.id] = seenOf(
      task,
      read
        ? saidOf(read)
        : typeof stored === "object"
          ? stored.said
          : undefined,
      was?.body
    )
    touch(task.id, task.updatedAt)
    cursor = Math.max(cursor, task.updatedAt)
  }

  // Comments re-read for a task ClickUp did not say changed — see
  // `ACTIVE_MS`. Its name and link are the ones last seen.
  const changed = new Set(tasks.map((task) => task.id))
  for (const [id, read] of comments) {
    const stored = seen[id]
    if (changed.has(id) || typeof stored !== "object") continue
    blank = {
      ...EMPTY,
      taskId: id,
      taskName: stored.name ?? "",
      url: stored.url ?? `https://app.clickup.com/t/${encodeURIComponent(id)}`,
      mine: me !== null && me in (stored.assignees ?? {}),
      assignees: Object.values(stored.assignees ?? {}),
    }
    // No task date moved, so an edit found here is dated now.
    readComments(read, stored, nowMs)
    seen[id] = { ...stored, said: saidOf(read) }
  }

  for (const [id, at] of Object.entries(active)) {
    if (at < nowMs - ACTIVE_MS) delete active[id]
  }

  fresh.sort((a, b) => b.at - a.at)
  return {
    record: {
      ...record,
      seen,
      active,
      cursor,
      items: [...fresh, ...record.items].slice(0, MAX_ITEMS),
      polledAt: now,
      error: null,
    },
    added: fresh.length,
  }
}

function names(people: Person[]): string {
  return people.map((person) => person.name).join(", ")
}

/** Order is ClickUp's and says nothing: a reordering is not a change. */
function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((each) => b.includes(each))
}

/** Each comment's text by id, for `SeenTask.said`. */
function saidOf(read: CommentRow[]): Record<string, string> {
  return Object.fromEntries(read.map((comment) => [comment.id, comment.text]))
}

const EMPTY: Omit<InboxItem, "id" | "kind" | "at" | "read"> = {
  taskId: "",
  taskName: "",
  url: "",
  from: null,
  fromColor: null,
  to: null,
  color: null,
  by: null,
  text: null,
  before: null,
  after: null,
}

/**
 * The renderer's half of a record: its settings filled in, and only the kinds
 * they list. Hidden rather than dropped, so a kind switched back on brings its
 * items back.
 */
export function viewOf(record: InboxRecord): ProjectInbox {
  const settings = inboxSettingsOf(record.settings)
  return {
    folderId: record.folderId,
    list: record.list,
    settings,
    items: record.items.filter((item) => shows(settings, item)),
    polledAt: record.polledAt,
    error: record.error,
  }
}

export class ClickupInbox {
  private timer: NodeJS.Timeout | null = null
  /** Every read-modify-write of the file, one at a time — a poll takes
   * seconds, and a `markRead` landing inside one would otherwise be undone by
   * the poll's write. The network is outside it. */
  private writes: Promise<unknown> = Promise.resolve()
  /** Polls one at a time, so a Refresh during a tick waits rather than asking
   * ClickUp the same question twice. */
  private polls: Promise<unknown> = Promise.resolve()
  /** When each inbox was last polled by the timer, by folder id — tried, not
   * answered, so a failing sign-in waits its interval like any other. In memory:
   * a launch polls everything once. */
  private tried = new Map<string, number>()
  /** The credential's own user id, asked once per credential. Null when it
   * could not be asked, so a poll goes on without the "you" kinds. */
  private me: { key: string; id: Promise<string | null> } | null = null

  constructor(
    private readonly deps: {
      /** How ClickUp is read now, or null before anybody signed in. Asked per
       * poll, so signing in needs no restart. */
      source: () => Promise<ClickupSource | null>
      read: () => Promise<InboxRecord[]>
      write: (records: InboxRecord[]) => Promise<void>
      /** The workspace's folder ids: an inbox whose project has left is kept
       * and not polled. */
      folderIds: () => Promise<string[]>
      onChange: (inboxes: ProjectInbox[]) => void
    }
  ) {}

  start(): void {
    if (this.timer) return
    const first = setTimeout(() => this.tick(), FIRST_MS)
    first.unref?.()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async list(): Promise<ProjectInbox[]> {
    return (await this.deps.read()).map(viewOf)
  }

  async connect(folderId: string, typed: string): Promise<ProjectInbox> {
    const ref = listRefIn(typed)
    if (!ref) {
      throw new Error(
        "That is not a ClickUp list. Copy the list's link from ClickUp, or its id."
      )
    }
    const source = await this.deps.source()
    if (!source) throw new Error("Sign in to ClickUp first.")
    const listId = await source.resolveList(ref)
    if (typeof listId !== "string") throw new Error(listId.error)
    const list = await source.list(listId)
    if ("error" in list) throw new Error(list.error)
    const tasks = await source.tasks(listId, null)
    if ("error" in tasks) throw new Error(tasks.error)

    const record = await this.update((records) => {
      const before = records.find((entry) => entry.folderId === folderId)
      // The same list again keeps what is already in the inbox.
      const keep = before?.list.id === listId ? before.items : []
      // Settings are the project's, not the list's, so they survive a change.
      const next = {
        ...baselineOf(folderId, list, tasks, Date.now(), keep),
        ...(before?.settings ? { settings: before.settings } : {}),
      }
      return {
        records: [...records.filter((entry) => entry !== before), next],
        result: next,
      }
    })
    return viewOf(record)
  }

  async disconnect(folderId: string): Promise<void> {
    await this.update((records) => ({
      records: records.filter((entry) => entry.folderId !== folderId),
      result: undefined,
    }))
  }

  async setSettings(folderId: string, settings: unknown): Promise<void> {
    const next = inboxSettingsOf(settings)
    await this.update((records) => ({
      records: records.map((entry) =>
        entry.folderId === folderId ? { ...entry, settings: next } : entry
      ),
      result: undefined,
    }))
  }

  /** Marks items read. `null` is every item the inbox shows — a hidden kind
   * keeps its unread, so switching it back on does not hand back a read list
   * nobody read. */
  async markRead(folderId: string, ids: string[] | null): Promise<void> {
    const wanted = ids === null ? null : new Set(ids)
    await this.update((records) => ({
      records: records.map((entry) => {
        if (entry.folderId !== folderId) return entry
        const settings = inboxSettingsOf(entry.settings)
        return {
          ...entry,
          items: entry.items.map((item) =>
            !item.read &&
            (wanted === null ? shows(settings, item) : wanted.has(item.id))
              ? { ...item, read: true }
              : item
          ),
        }
      }),
      result: undefined,
    }))
  }

  /** Polls every inbox, or only `folderId`'s. */
  poll(folderId?: string): Promise<void> {
    const run = this.polls.then(() => this.pollNow(folderId))
    this.polls = run.catch(() => undefined)
    return run
  }

  private tick(): void {
    void this.poll().catch((error: unknown) => {
      console.error("ClickUp inbox poll failed", error)
    })
  }

  private whoAmI(source: ClickupSource): Promise<string | null> {
    if (this.me?.key !== source.key) {
      const id = source
        .me()
        .then((answer) => ("error" in answer ? null : answer.id))
      this.me = { key: source.key, id }
      // A failed ask is asked again next poll rather than held.
      void id.then((answer) => {
        if (answer === null && this.me?.id === id) this.me = null
      })
    }
    return this.me.id
  }

  private async pollNow(only?: string): Promise<void> {
    const source = await this.deps.source()
    if (!source) return
    const me = await this.whoAmI(source)
    const present = new Set(await this.deps.folderIds())
    const now = Date.now()
    const targets = (await this.deps.read()).filter((entry) => {
      if (!present.has(entry.folderId)) return false
      // A Refresh polls its inbox whatever the interval says.
      if (only !== undefined) return entry.folderId === only
      const every = inboxSettingsOf(entry.settings).intervalMinutes * 60_000
      return now - (this.tried.get(entry.folderId) ?? 0) >= every
    })

    // One list after another rather than all at once: the sign-in's rate limit is
    // shared by every inbox, and nobody is waiting on a tick.
    for (const target of targets) {
      this.tried.set(target.folderId, Date.now())
      const tasks = await source.tasks(target.list.id, target.cursor)
      if ("error" in tasks) {
        await this.patch(target, (entry) =>
          entry.error === tasks.error ? entry : { ...entry, error: tasks.error }
        )
        continue
      }

      // Neither comment kind listed: their requests are saved. What the texts
      // were is not kept meanwhile either, so an edit made while they were
      // off is announced when they come back on.
      const comments = new Map<string, CommentRow[]>()
      const reading = readsComments(inboxSettingsOf(target.settings))
      for (const id of reading
        ? commentTargets(target, tasks, Date.now())
        : []) {
        const answer = await source.comments(id)
        if (!("error" in answer)) comments.set(id, answer)
      }

      const at = new Date().toISOString()
      await this.patch(
        target,
        (entry) => foldPoll(entry, tasks, comments, at, me).record
      )
    }
  }

  /** One inbox changed, on the record as it is **now** — a markRead or a
   * reconnect may have landed while the poll was out. A record pointed at
   * another list since is left alone. */
  private async patch(
    target: InboxRecord,
    change: (entry: InboxRecord) => InboxRecord
  ): Promise<void> {
    await this.update((records) => ({
      records: records.map((entry) =>
        entry.folderId === target.folderId && entry.list.id === target.list.id
          ? change(entry)
          : entry
      ),
      result: undefined,
    }))
  }

  private update<T>(
    change: (records: InboxRecord[]) => { records: InboxRecord[]; result: T }
  ): Promise<T> {
    const run = this.writes.then(async () => {
      const { records, result } = change(await this.deps.read())
      await this.deps.write(records)
      this.deps.onChange(records.map(viewOf))
      return result
    })
    this.writes = run.catch(() => undefined)
    return run
  }
}
