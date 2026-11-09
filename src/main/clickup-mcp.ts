import { createHash, randomBytes } from "node:crypto"
import { createServer, type Server } from "node:http"

import {
  commentsOf,
  personOf,
  str,
  taskRowOf,
  type Answer,
  type ClickupSource,
  type Fetch,
  type ListRef,
  type TaskRow,
} from "./clickup"

/**
 * The inbox's one way into ClickUp: **ClickUp's own MCP server**, signed in
 * with OAuth in the browser (`docs/design.md` § The ClickUp inbox).
 *
 * Not the connector a user's `claude` already has: that grant is claude.ai's,
 * held on Anthropic's side, and reaching it would mean borrowing the Claude
 * login for something it was not given for. So this app registers itself
 * (dynamic client registration, a public client with PKCE), takes the code on
 * a loopback port, and calls the server's tools over Streamable HTTP — by hand,
 * since what it needs is three requests, not the SDK's transport and its
 * global `fetch`.
 *
 * Read only: the grant asks for `read` and the tools
 * called are listings. The tools answer as text a model is meant to read;
 * `dataOf` takes it as JSON and says so plainly when it is not — nothing here
 * has been run against the live server, so the shapes are read loosely
 * (`taskRowOf` accepts both ClickUp's v2 objects and flatter forms).
 *
 * Free of `electron`: `fetch` and opening the browser are handed in.
 */

const SERVER = "https://mcp.clickup.com"
const ENDPOINT = `${SERVER}/mcp`
const PROTOCOL = "2025-06-18"

/** Long enough for a list of a hundred tasks to be rendered as text. */
const TIMEOUT_MS = 30_000

/** How long the browser step may take before the sign-in gives up and frees
 * its port. */
const SIGN_IN_MS = 5 * 60 * 1000

/** 10,000 tasks: past that a list is an archive, and reading it whole on
 * every connect would spend the sign-in's minute of requests on one click. */
const MAX_PAGES = 100

/** Descriptions read per poll. ClickUp's MCP lists tasks without one, so each
 * changed task is asked for again; a bulk move of 200 tasks would otherwise be
 * 200 calls. The rest keep the description last seen until they next change. */
const MAX_DETAIL_READS = 40

/** What a cancelled sign-in throws — the renderer says nothing for it. */
export const CANCELLED = "The ClickUp sign-in was cancelled."

/** What a sign-in leaves: this app's registration and the tokens it got. */
export type McpGrant = {
  clientId: string
  redirectUri: string
  accessToken: string
  refreshToken: string | null
  /** ms; null when ClickUp did not say. */
  expiresAt: number | null
}

/** A stored grant narrowed, or null — it is read back out of the manifest. */
export function grantOf(value: unknown): McpGrant | null {
  const raw = (value ?? {}) as Record<string, unknown>
  const clientId = str(raw.clientId)
  const accessToken = str(raw.accessToken)
  if (!clientId || !accessToken) return null
  return {
    clientId,
    redirectUri: str(raw.redirectUri),
    accessToken,
    refreshToken: str(raw.refreshToken) || null,
    expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : null,
  }
}

type Endpoints = { authorize: string; token: string; register: string }

/** The server's OAuth endpoints, from its metadata — the paths it publishes
 * today when that cannot be read. */
async function endpointsOf(fetch: Fetch): Promise<Endpoints> {
  const fallback = {
    authorize: `${SERVER}/oauth/authorize`,
    token: `${SERVER}/oauth/token`,
    register: `${SERVER}/oauth/register`,
  }
  try {
    const response = await fetch(
      `${SERVER}/.well-known/oauth-authorization-server`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    )
    if (!response.ok) return fallback
    const meta = (await response.json()) as Record<string, unknown>
    // Only ClickUp's own host: a metadata document pointing elsewhere is not
    // one this app hands a code to.
    const ours = (value: unknown, otherwise: string) => {
      const url = str(value)
      return url.startsWith(`${SERVER}/`) ? url : otherwise
    }
    return {
      authorize: ours(meta.authorization_endpoint, fallback.authorize),
      token: ours(meta.token_endpoint, fallback.token),
      register: ours(meta.registration_endpoint, fallback.register),
    }
  } catch {
    return fallback
  }
}

/**
 * Signs in to ClickUp in the browser: registers this app for a loopback
 * redirect, opens ClickUp's consent page, and waits for the code on that
 * port. Throws a sentence on any failure, the browser being closed included
 * (after `SIGN_IN_MS`).
 */
export async function signIn(
  fetch: Fetch,
  open: (url: string) => void,
  /** Cancels the wait for the browser — the user gave up on that tab. */
  signal?: AbortSignal
): Promise<McpGrant> {
  const endpoints = await endpointsOf(fetch)
  const state = randomBytes(16).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")

  const loopback = await listen()
  try {
    const redirectUri = `http://127.0.0.1:${loopback.port}/callback`
    const clientId = await register(fetch, endpoints.register, redirectUri)
    const url = new URL(endpoints.authorize)
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      scope: "read",
      resource: ENDPOINT,
    }).toString()
    open(url.toString())

    if (signal?.aborted) throw new Error(CANCELLED)
    const code = await loopback.code(state, signal)
    const tokens = await tokenRequest(fetch, endpoints.token, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: ENDPOINT,
    })
    return { clientId, redirectUri, ...tokens }
  } finally {
    loopback.close()
  }
}

/** A grant's access token renewed, or null when it has no refresh token or
 * ClickUp refused it — a sign-in again, then. */
export async function refreshGrant(
  fetch: Fetch,
  grant: McpGrant
): Promise<McpGrant | null> {
  if (!grant.refreshToken) return null
  try {
    const endpoints = await endpointsOf(fetch)
    const tokens = await tokenRequest(fetch, endpoints.token, {
      grant_type: "refresh_token",
      refresh_token: grant.refreshToken,
      client_id: grant.clientId,
      resource: ENDPOINT,
    })
    return {
      ...grant,
      ...tokens,
      refreshToken: tokens.refreshToken ?? grant.refreshToken,
    }
  } catch {
    return null
  }
}

async function register(
  fetch: Fetch,
  endpoint: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Vey",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "read",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new Error(`Could not reach ClickUp: ${reasonOf(error)}`)
  })
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const clientId = str(body?.client_id)
  if (!response.ok || !clientId) {
    const said = str(body?.error_description) || str(body?.error)
    throw new Error(
      `ClickUp would not register this app${said ? `: ${said}` : ` (${response.status}).`}`
    )
  }
  return clientId
}

async function tokenRequest(
  fetch: Fetch,
  endpoint: string,
  form: Record<string, string>
): Promise<Omit<McpGrant, "clientId" | "redirectUri">> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new Error(`Could not reach ClickUp: ${reasonOf(error)}`)
  })
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const accessToken = str(body?.access_token)
  if (!response.ok || !accessToken) {
    const said = str(body?.error_description) || str(body?.error)
    throw new Error(
      `ClickUp did not sign this app in${said ? `: ${said}` : ` (${response.status}).`}`
    )
  }
  const seconds = Number(body?.expires_in)
  return {
    accessToken,
    refreshToken: str(body?.refresh_token) || null,
    expiresAt:
      Number.isFinite(seconds) && seconds > 0
        ? Date.now() + seconds * 1000
        : null,
  }
}

/**
 * A one-shot HTTP server on 127.0.0.1 for the redirect — the loopback form a
 * native app's OAuth uses (RFC 8252), on whatever port is free.
 */
async function listen(): Promise<{
  port: number
  code: (state: string, signal?: AbortSignal) => Promise<string>
  close: () => void
}> {
  let settle: ((code: string) => void) | null = null
  let fail: ((error: Error) => void) | null = null
  let wanted = ""
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname !== "/callback") {
      response.writeHead(404).end()
      return
    }
    const page = (title: string) => {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(
          `<!doctype html><meta charset="utf-8"><title>Vey</title><body style="font:14px system-ui;padding:3rem;text-align:center">${title}</body>`
        )
    }
    // Another state is not this sign-in's redirect — a stale tab, or a page
    // trying its luck on the port.
    if (url.searchParams.get("state") !== wanted) {
      page("This sign-in link is out of date. Start again from Vey.")
      return
    }
    const denied = url.searchParams.get("error")
    const code = url.searchParams.get("code")
    if (denied || !code) {
      page("ClickUp did not sign Vey in. You can close this tab.")
      fail?.(
        new Error(
          denied === "access_denied"
            ? "The sign-in was cancelled in ClickUp."
            : `ClickUp did not sign this app in: ${denied ?? "no code"}`
        )
      )
      return
    }
    page("Signed in to ClickUp. You can close this tab and go back to Vey.")
    settle?.(code)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  return {
    port,
    code: (state, signal) =>
      new Promise<string>((resolve, reject) => {
        wanted = state
        settle = resolve
        fail = reject
        const timer = setTimeout(
          () => reject(new Error("The ClickUp sign-in timed out.")),
          SIGN_IN_MS
        )
        timer.unref?.()
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer)
            reject(new Error(CANCELLED))
          },
          { once: true }
        )
      }),
    close: () => {
      server.close()
      server.closeAllConnections?.()
    },
  }
}

/**
 * One MCP session with ClickUp's server: `initialize` once, then `tools/call`
 * — the session re-opened when the server forgets it (404), the token renewed
 * once when it is refused (401).
 */
export class ClickupMcp {
  private session: Promise<string | null> | null = null
  private nextId = 1

  constructor(
    private readonly deps: {
      fetch: Fetch
      grant: () => Promise<McpGrant | null>
      saveGrant: (grant: McpGrant) => Promise<void>
    }
  ) {}

  /** Forgets the session — after a sign-in or a sign-out. */
  reset(): void {
    this.session = null
  }

  async call(
    tool: string,
    args: Record<string, unknown>
  ): Promise<Answer<unknown>> {
    const stored = await this.deps.grant()
    if (!stored) return { error: "Not signed in to ClickUp." }
    let grant: McpGrant = stored
    if (grant.expiresAt !== null && Date.now() > grant.expiresAt - 60_000) {
      grant = (await this.renew(grant)) ?? grant
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await this.callOnce(grant, tool, args)
      if (answer === "expired") {
        const renewed: McpGrant | null =
          attempt === 0 ? await this.renew(grant) : null
        if (!renewed) {
          return { error: "The ClickUp sign-in has expired. Sign in again." }
        }
        grant = renewed
        continue
      }
      if (answer === "lost") {
        this.session = null
        continue
      }
      return answer
    }
    return { error: "ClickUp's MCP server kept dropping the session." }
  }

  private async renew(grant: McpGrant): Promise<McpGrant | null> {
    const renewed = await refreshGrant(this.deps.fetch, grant)
    if (renewed) await this.deps.saveGrant(renewed)
    this.session = null
    return renewed
  }

  private async callOnce(
    grant: McpGrant,
    tool: string,
    args: Record<string, unknown>
  ): Promise<Answer<unknown> | "expired" | "lost"> {
    if (!this.session) this.session = this.open(grant)
    let session: string | null
    try {
      session = await this.session
    } catch (error) {
      this.session = null
      return { error: reasonOf(error) }
    }
    if (session === null) {
      this.session = null
      return "expired"
    }
    const reply = await this.rpc(grant, session, {
      method: "tools/call",
      params: { name: tool, arguments: args },
    })
    if (reply === "expired" || reply === "lost") return reply
    if ("error" in reply) return reply
    return dataOf(reply.result)
  }

  /** `initialize` and its acknowledgement; the session id, `""` for a server
   * that keeps none, null for a refused token. */
  private async open(grant: McpGrant): Promise<string | null> {
    const reply = await this.rpc(grant, "", {
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "Vey", version: "1" },
      },
    })
    if (reply === "expired") return null
    if (reply === "lost" || "error" in reply) {
      throw new Error(
        reply === "lost" ? "ClickUp's MCP server is unavailable." : reply.error
      )
    }
    await this.post(grant, reply.session, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }).catch(() => undefined)
    return reply.session
  }

  private async rpc(
    grant: McpGrant,
    session: string,
    message: { method: string; params: unknown }
  ): Promise<
    | { result: unknown; session: string }
    | { error: string }
    | "expired"
    | "lost"
  > {
    const id = this.nextId++
    let response: Response
    try {
      response = await this.post(grant, session, {
        jsonrpc: "2.0",
        id,
        ...message,
      })
    } catch (error) {
      return { error: `Could not reach ClickUp: ${reasonOf(error)}` }
    }
    if (response.status === 401 || response.status === 403) return "expired"
    if (response.status === 404 && session) return "lost"
    if (response.status === 429) {
      return {
        error: "ClickUp is rate-limiting this sign-in; trying again later.",
      }
    }
    if (!response.ok) return { error: `ClickUp answered ${response.status}.` }
    const reply = await replyOf(response, id)
    if (!reply) return { error: "ClickUp's MCP server answered with nothing." }
    if (reply.error) {
      const said = str((reply.error as { message?: unknown }).message)
      return { error: `ClickUp: ${said || "the call failed."}` }
    }
    return {
      result: reply.result,
      session: response.headers.get("mcp-session-id") ?? session,
    }
  }

  private post(grant: McpGrant, session: string, body: unknown) {
    return this.deps.fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${grant.accessToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
        ...(session ? { "mcp-session-id": session } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }
}

type RpcReply = { id?: unknown; result?: unknown; error?: unknown }

/** The JSON-RPC reply to `id`, whether the server answered with JSON or with
 * an event stream carrying it. */
async function replyOf(
  response: Response,
  id: number
): Promise<RpcReply | null> {
  const text = await response.text().catch(() => "")
  const type = response.headers.get("content-type") ?? ""
  if (!type.includes("text/event-stream")) {
    try {
      return JSON.parse(text) as RpcReply
    } catch {
      return null
    }
  }
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
    if (!data) continue
    try {
      const message = JSON.parse(data) as RpcReply
      if (message.id === id) return message
    } catch {
      // A keep-alive or a notification; the reply is further on.
    }
  }
  return null
}

/**
 * A tool's answer as data: its structured content when it has one, else its
 * text read as JSON — or the JSON object inside text that wraps one.
 */
export function dataOf(result: unknown): Answer<unknown> {
  const raw = (result ?? {}) as {
    isError?: unknown
    content?: unknown
    structuredContent?: unknown
  }
  const text = (Array.isArray(raw.content) ? raw.content : [])
    .map((part) =>
      (part as { type?: unknown })?.type === "text"
        ? str((part as { text?: unknown }).text)
        : ""
    )
    .join("\n")
    .trim()
  if (raw.isError === true) {
    const said = text.replace(/\s+/g, " ").slice(0, 300)
    return { error: `ClickUp: ${said || "the call failed."}` }
  }
  if (raw.structuredContent !== undefined && raw.structuredContent !== null) {
    return raw.structuredContent
  }
  const parsed = parseJson(text)
  if (parsed !== undefined) return parsed
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
  const inner =
    start >= 0 && end > start
      ? parseJson(text.slice(start, end + 1))
      : undefined
  return inner !== undefined
    ? inner
    : {
        error: "ClickUp's MCP server answered in a shape this app cannot read.",
      }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** `value[key]` when the answer wraps what it is about, else the answer. */
function inner(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : value
}

function arrayIn(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value
  const found = inner(value, key)
  return Array.isArray(found) ? found : []
}

/** The inbox's reads, through ClickUp's MCP tools. */
export function mcpSource(client: ClickupMcp, key: string): ClickupSource {
  const call = (tool: string, args: Record<string, unknown>) =>
    client.call(tool, args)

  async function me() {
    const got = await call("clickup_get_user", {})
    if (got && typeof got === "object" && "error" in got) {
      return got as { error: string }
    }
    return (
      personOf(inner(got, "user")) ?? {
        error: "ClickUp answered with no user.",
      }
    )
  }

  async function list(listId: string) {
    const got = await call("clickup_get_list", { list_id: listId })
    if (got && typeof got === "object" && "error" in got) {
      return got as { error: string }
    }
    const name = str((inner(got, "list") as { name?: unknown } | null)?.name)
    return name
      ? { id: listId, name }
      : { error: "ClickUp has no such list, or this sign-in cannot see it." }
  }

  /** A view's list: the MCP has no view lookup a listing can use, so the
   * view's own tasks say which list they are in — one, or it is a folder's or
   * a space's view. */
  async function resolveList(ref: ListRef): Promise<Answer<string>> {
    if ("list" in ref) return ref.list
    const got = await call("clickup_filter_tasks", {
      view_id: ref.view,
      fields: ["list"],
    })
    if (got && typeof got === "object" && "error" in got) {
      return got as { error: string }
    }
    const ids = new Set<string>()
    for (const task of arrayIn(got, "tasks")) {
      const id = (inner(task, "list") as { id?: unknown } | null)?.id
      const text = typeof id === "number" ? String(id) : str(id)
      if (text) ids.add(text)
    }
    if (ids.size === 1) return [...ids][0]!
    return {
      error:
        ids.size === 0
          ? "That view shows no tasks, so its list cannot be told. Open the list itself in ClickUp and copy its link."
          : "That view is of a folder or a space, not of one list. Open the list itself in ClickUp and copy its link.",
    }
  }

  async function tasks(
    listId: string,
    after: number | null
  ): Promise<Answer<TaskRow[]>> {
    const rows: TaskRow[] = []
    let page = 0
    for (let read = 0; read < MAX_PAGES; read++) {
      const got = await call("clickup_filter_tasks", {
        list_ids: [listId],
        include_closed: true,
        subtasks: true,
        order_by: "updated",
        page,
      })
      if (got && typeof got === "object" && "error" in got) {
        return got as { error: string }
      }
      const found = arrayIn(got, "tasks").flatMap(
        (task) => taskRowOf(task) ?? []
      )
      rows.push(...found)
      const more = (got as { has_more?: unknown } | null)?.has_more === true
      // Newest first, so a page reaching back past the cursor is the last
      // one a poll needs.
      const reachedBack =
        after !== null && found.some((row) => row.updatedAt <= after)
      if (!more || reachedBack || found.length === 0) break
      const next = Number((got as { next_page?: unknown } | null)?.next_page)
      page = Number.isFinite(next) && next > page ? next : page + 1
    }
    const changed =
      after === null ? rows : rows.filter((row) => row.updatedAt > after)
    // A connect's reading keeps no descriptions — asking for each task's would
    // be one call per task in the list. The first change to a task reads it,
    // and the change after that is the first a description can be diffed by.
    if (after !== null) {
      const missing = changed
        .filter((row) => row.description === null)
        .slice(0, MAX_DETAIL_READS)
      for (const row of missing) {
        const got = await call("clickup_get_task", {
          task_id: row.id,
          include: ["description"],
        })
        if (got && typeof got === "object" && "error" in got) continue
        const detail = taskRowOf(inner(got, "task"))
        if (!detail) continue
        row.description = detail.description
        row.creator ??= detail.creator
        if (!row.createdAt) row.createdAt = detail.createdAt
      }
    }
    return changed
  }

  async function comments(taskId: string) {
    const got = await call("clickup_get_task_comments", { task_id: taskId })
    if (got && typeof got === "object" && "error" in got) {
      return got as { error: string }
    }
    return commentsOf({ comments: arrayIn(got, "comments") })
  }

  async function replies(commentId: string) {
    const got = await call("clickup_get_threaded_comments", {
      comment_id: commentId,
    })
    if (got && typeof got === "object" && "error" in got) {
      return got as { error: string }
    }
    // Undocumented, so either key: the REST answer's `comments`, or `replies`.
    const found = arrayIn(got, "comments")
    return commentsOf(
      { comments: found.length > 0 ? found : arrayIn(got, "replies") },
      commentId
    )
  }

  return { key, me, resolveList, list, tasks, comments, replies }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
