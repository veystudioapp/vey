/**
 * What the inbox reads out of ClickUp, two ways — the REST API with a personal
 * key, here (`restSource`), or ClickUp's own MCP server signed in with OAuth
 * (`main/clickup-mcp.ts`) — and how a reading is narrowed. It only ever
 * **reads**: the inbox follows a list somebody else's team works in, and a
 * second writer on those tasks is not this app's business (`docs/design.md`
 * § The ClickUp inbox).
 *
 * Free of `electron`: the key and `fetch` are arguments — `Host.fetch` in the
 * app, so a proxy or VPN reaches ClickUp the way the browser does — and
 * `test/clickup-inbox.ts` runs the narrowing under plain `bun`. Every failure
 * comes back as `{ error }` with a sentence, never a throw: one inbox's expired
 * key or sign-in must not stop another's poll.
 */

const API = "https://api.clickup.com/api/v2"

/** Long enough for a slow connection, short enough that a dead one does not
 * hold the poll past the next tick. */
const TIMEOUT_MS = 15_000

/** ClickUp's page size for a list's tasks — a shorter page is the last. */
const PAGE_SIZE = 100

/** 10,000 tasks: past that a list is an archive, and reading it whole on every
 * connect would spend a personal key's minute of requests on one click. */
const MAX_PAGES = 100

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type Answer<T> = T | { error: string }

/** A task as the poll diffs it. */
export type TaskRow = {
  id: string
  name: string
  status: string
  statusColor: string | null
  url: string
  createdAt: number
  updatedAt: number
  /** The description as text, cut at `BODY_MAX`. Kept whole rather than as a
   * hash so an edit can be shown as what changed, not only that it did. Null
   * when this reading did not carry it — ClickUp's MCP lists tasks without
   * one — which is not a description emptied. */
  description: string | null
  /** In ClickUp's order; compared as a set. */
  assignees: Person[]
  /** ClickUp's word for it — `urgent`, `high`… — or null for none. */
  priority: string | null
  /** ms, or null for none. */
  due: number | null
  tags: string[]
  /** Who made it. The one author a task carries: ClickUp's v2 API has no
   * history, so who moved a status or edited a title is not knowable from a
   * poll — only from a webhook. */
  creator: Person | null
}

/** A ClickUp user: the id to compare, the name to show. */
export type Person = { id: string; name: string }

export type CommentRow = {
  id: string
  by: string
  /** The author's id, to tell somebody's own comments apart. */
  byId: string
  text: string
  at: number
  /** The ids of the people the comment @-mentions. */
  mentions: string[]
}

/** The most of one text kept: a description or a comment longer than this is
 * a document, and the inbox is where it is said to have changed, not where it
 * is read. */
export const BODY_MAX = 20_000

/** A text cut at `BODY_MAX`, the cut marked — a diff whose last line simply
 * stops reads as the rest having been deleted. */
export function capped(text: string): string {
  return text.length <= BODY_MAX ? text : `${text.slice(0, BODY_MAX)}\n…`
}

/** Whether two texts say the same thing: whitespace and line breaks are
 * ClickUp's editor reflowing, not somebody editing. */
export function sameText(a: string, b: string): boolean {
  const fold = (text: string) => text.replace(/\s+/g, " ").trim()
  return fold(a) === fold(b)
}

/** A list named directly, or one of its views, whose list has to be asked. */
export type ListRef = { list: string } | { view: string }

/**
 * The list a pasted URL or id names, or null.
 *
 * What ClickUp's address bar shows: `…/v/li/<id>` is the list itself;
 * `…/v/l/6-<id>-1` is an older view link whose middle number is the list (`6`
 * is ClickUp's parent type for a list); and `…/v/l/2kzkzpr0-438` — what a
 * list's own tabs show now — is a **view** id, opaque, its list found by the
 * source's `resolveList`. Any view kind (`/v/b/` board, `/v/c/` calendar…) is the same.
 * A bare run of digits is a list id typed by hand. Anything else — a task
 * link, a doc — is refused rather than guessed at.
 */
export function listRefIn(typed: string): ListRef | null {
  const text = typed.trim()
  if (/^\d+$/.test(text)) return { list: text }
  if (!/^https:\/\/app\.clickup\.com\//i.test(text)) return null
  const path = text.split(/[?#]/)[0]!
  const list = /\/v\/li\/(\d+)(?:\/|$)/.exec(path)
  if (list) return { list: list[1]! }
  const legacy = /\/v\/[a-z]+\/6-(\d+)-\d+(?:\/|$)/i.exec(path)
  if (legacy) return { list: legacy[1]! }
  const view = /\/v\/[a-z]+\/([0-9a-z]+-\d+)(?:\/|$)/i.exec(path)
  return view ? { view: view[1]! } : null
}

/**
 * What the inbox reads ClickUp through: `restSource` with a personal key, or
 * `mcpSource` signed in — one shape, so the poll and its diff are one. A fake
 * in `test/clickup-inbox.ts`.
 */
export type ClickupSource = {
  /** Which key or sign-in this is, so its own user is asked once per one. */
  key: string
  me: () => Promise<Answer<Person>>
  resolveList: (ref: ListRef) => Promise<Answer<string>>
  list: (listId: string) => Promise<Answer<{ id: string; name: string }>>
  tasks: (listId: string, after: number | null) => Promise<Answer<TaskRow[]>>
  comments: (taskId: string) => Promise<Answer<CommentRow[]>>
}

/** ClickUp's `parent.type` for a view that belongs to one list. */
const LIST_PARENT = 6

/**
 * The list id a reference comes to: itself, or a view's parent — which has to
 * be a list, since a space's or folder's view spans many and an inbox
 * follows one.
 */
export async function resolveList(
  fetch: Fetch,
  token: string,
  ref: ListRef
): Promise<Answer<string>> {
  if ("list" in ref) return ref.list
  const got = await get(
    fetch,
    token,
    `${API}/view/${encodeURIComponent(ref.view)}`,
    "ClickUp has no such view, or the key cannot see it."
  )
  if ("error" in got) return got
  return listOfView(got.body)
}

/** A view's list, out of `GET /view/{id}`'s answer. */
export function listOfView(body: unknown): Answer<string> {
  const parent = (body as { view?: { parent?: unknown } } | null)?.view
    ?.parent as { id?: unknown; type?: unknown } | undefined
  const id = typeof parent?.id === "number" ? String(parent.id) : parent?.id
  if (Number(parent?.type) !== LIST_PARENT || typeof id !== "string" || !id) {
    return {
      error:
        "That view is of a folder or a space, not of one list. Open the list itself in ClickUp and copy its link.",
    }
  }
  return id
}

export function restSource(fetch: Fetch, token: string): ClickupSource {
  return {
    key: `key:${token}`,
    me: () => checkKey(fetch, token),
    resolveList: (ref) => resolveList(fetch, token, ref),
    list: (listId) => fetchList(fetch, token, listId),
    tasks: (listId, after) => fetchTasks(fetch, token, listId, after),
    comments: (taskId) => fetchComments(fetch, token, taskId),
  }
}

/** Whether the key opens anything at all — `GET /user`. */
export async function checkKey(
  fetch: Fetch,
  token: string
): Promise<Answer<Person>> {
  const got = await get(fetch, token, `${API}/user`)
  if ("error" in got) return got
  const user = (got.body as { user?: unknown } | null)?.user
  return personOf(user) ?? { error: "ClickUp answered with no user." }
}

/** A list's name, which is also the check that the key can see it. */
export async function fetchList(
  fetch: Fetch,
  token: string,
  listId: string
): Promise<Answer<{ id: string; name: string }>> {
  const got = await get(
    fetch,
    token,
    `${API}/list/${encodeURIComponent(listId)}`,
    "ClickUp has no such list, or the key cannot see it."
  )
  if ("error" in got) return got
  return { id: listId, name: str((got.body as { name?: unknown })?.name) }
}

/**
 * Every task in a list updated after `after` (ms), closed ones and subtasks
 * included — or every task at all, for `after` null, which is the reading a
 * connect makes so nothing already there is announced.
 */
export async function fetchTasks(
  fetch: Fetch,
  token: string,
  listId: string,
  after: number | null
): Promise<Answer<TaskRow[]>> {
  const rows: TaskRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({
      page: String(page),
      include_closed: "true",
      subtasks: "true",
      order_by: "updated",
    })
    if (after !== null) query.set("date_updated_gt", String(after))
    const got = await get(
      fetch,
      token,
      `${API}/list/${encodeURIComponent(listId)}/task?${query}`,
      "ClickUp has no such list, or the key cannot see it."
    )
    if ("error" in got) return got
    const body = got.body as { tasks?: unknown; last_page?: unknown } | null
    const tasks = Array.isArray(body?.tasks) ? body.tasks : []
    for (const task of tasks) {
      const row = taskRowOf(task)
      if (row) rows.push(row)
    }
    if (body?.last_page === true || tasks.length < PAGE_SIZE) break
  }
  return rows
}

/** The newest comments on a task (ClickUp answers with 25), oldest first. */
export async function fetchComments(
  fetch: Fetch,
  token: string,
  taskId: string
): Promise<Answer<CommentRow[]>> {
  const got = await get(
    fetch,
    token,
    `${API}/task/${encodeURIComponent(taskId)}/comment`
  )
  if ("error" in got) return got
  return commentsOf(got.body)
}

/** ClickUp's task JSON narrowed to a row, or null for one with no id. Checked
 * rather than cast: a field misread here is an item announced every poll. */
export function taskRowOf(value: unknown): TaskRow | null {
  const task = (value ?? {}) as Record<string, unknown>
  const id = str(task.id)
  if (!id) return null
  // ClickUp's v2 object from the REST API; through the MCP, whose answers are
  // not documented, possibly a bare string — both are read.
  const status = (
    typeof task.status === "string" ? { status: task.status } : task.status
  ) as { status?: unknown; color?: unknown } | null
  const body = task.text_content ?? task.description
  const priority =
    typeof task.priority === "string"
      ? task.priority
      : str((task.priority as { priority?: unknown } | null)?.priority)
  return {
    id,
    name: str(task.name),
    status: str(status?.status),
    statusColor: hexColor(status?.color),
    url: taskUrl(task.url, id),
    createdAt: epoch(task.date_created) ?? 0,
    updatedAt: epoch(task.date_updated) ?? 0,
    // `text_content` rather than the markup: reformatting a description is not
    // editing what it says. Neither key at all is a reading without it.
    description:
      "text_content" in task || "description" in task
        ? capped(str(body))
        : null,
    assignees: peopleOf(task.assignees),
    priority: priority || null,
    due: epoch(task.due_date),
    tags: Array.isArray(task.tags)
      ? task.tags
          .map((tag) =>
            typeof tag === "string"
              ? tag
              : str((tag as { name?: unknown } | null)?.name)
          )
          .filter((name) => name !== "")
      : [],
    creator: personOf(task.creator),
  }
}

/** ClickUp's `comments` array, oldest first — sorted by date rather than
 * trusted, since ClickUp orders a task's newest first. */
export function commentsOf(value: unknown): CommentRow[] {
  const list = (value as { comments?: unknown } | null)?.comments
  if (!Array.isArray(list)) return []
  const rows: CommentRow[] = []
  for (const entry of list) {
    const raw = (entry ?? {}) as Record<string, unknown>
    const id = str(raw.id)
    if (!id) continue
    const author = personOf(raw.user)
    rows.push({
      id,
      by: author?.name ?? "",
      byId: author?.id ?? "",
      text: capped(str(raw.comment_text)),
      at: epoch(raw.date) ?? 0,
      mentions: mentionsIn(raw.comment),
    })
  }
  return rows.sort((a, b) => a.at - b.at)
}

/**
 * A `#rgb` / `#rrggbb` / `#rrggbbaa`, or null — checked on the way in because
 * this is the one value from ClickUp that ends up in a `style`.
 */
export function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null
  const hex = value.trim()
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex) ? hex : null
}

/** The task's own link when it is ClickUp's, and one built from the id
 * otherwise — the renderer opens it, so nothing else may stand in for it. */
function taskUrl(value: unknown, id: string): string {
  const url = str(value)
  return /^https:\/\/app\.clickup\.com\//i.test(url)
    ? url
    : `https://app.clickup.com/t/${encodeURIComponent(id)}`
}

/** One GET, every way it can fail turned into a sentence. */
async function get(
  fetch: Fetch,
  token: string,
  url: string,
  notFound = "ClickUp has no such task, or the key cannot see it."
): Promise<{ body: unknown } | { error: string }> {
  if (!token) return { error: "No ClickUp key saved." }
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { error: `Could not reach ClickUp: ${reason}` }
  }
  if (!response.ok) {
    const said = await readError(response)
    if (response.status === 401) return { error: "ClickUp refused the key." }
    if (response.status === 404) return { error: notFound }
    if (response.status === 429) {
      return { error: "ClickUp is rate-limiting this key; trying again later." }
    }
    return {
      error: `ClickUp answered ${response.status}${said ? `: ${said}` : ""}`,
    }
  }
  try {
    return { body: await response.json() }
  } catch {
    return { error: "ClickUp answered with something that was not JSON." }
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const said = ((await response.json()) as { err?: unknown })?.err
    return typeof said === "string" ? said : ""
  } catch {
    return ""
  }
}

/**
 * Who a comment @-mentions: its rich text is an array of blocks, and a
 * mention is a block of `type: "tag"` carrying the `user`. `comment_text` has
 * the name as typed, which is no use for telling who.
 */
export function mentionsIn(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return []
  const ids: string[] = []
  for (const block of blocks) {
    const raw = (block ?? {}) as { type?: unknown; user?: unknown }
    if (raw.type !== "tag") continue
    const person = personOf(raw.user)
    if (person && !ids.includes(person.id)) ids.push(person.id)
  }
  return ids
}

/** A ClickUp user object as a `Person`, or null. Ids arrive as numbers. */
export function personOf(value: unknown): Person | null {
  const raw = (value ?? {}) as {
    id?: unknown
    username?: unknown
    name?: unknown
    email?: unknown
  }
  const id = typeof raw.id === "number" ? String(raw.id) : str(raw.id)
  if (!id) return null
  return { id, name: str(raw.username) || str(raw.name) || str(raw.email) }
}

function peopleOf(value: unknown): Person[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => personOf(entry) ?? [])
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** ClickUp sends timestamps as strings of ms — or, through its MCP, possibly
 * as ISO dates; `Number("")` is 0, which would be 1970 rather than none. */
export function epoch(value: unknown): number | null {
  const raw =
    typeof value === "string" ? value : typeof value === "number" ? value : null
  if (raw === null || raw === "") return null
  const ms =
    typeof raw === "string" && !/^\d+$/.test(raw)
      ? Date.parse(raw)
      : Number(raw)
  return Number.isFinite(ms) && ms > 0 ? ms : null
}
