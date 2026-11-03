/**
 * The chat's browser: a page beside the conversation that its `claude` can
 * drive. The shapes both sides share — `main/browser-hub.ts` serves the tools,
 * `lib/browser/` draws the page. `docs/design.md` § The chat's browser.
 */

/** The in-process MCP server's name, which the CLI puts into every tool's wire
 * name. Underscored rather than hyphenated so the CLI has nothing to normalise
 * (see `wireServer` in `lib/chat/mcp-servers.ts`). */
export const BROWSER_SERVER = "vey_browser"

/** What the tools are called on that server. */
export const BROWSER_ACTIONS = [
  "tabs",
  "navigate",
  "back",
  "snapshot",
  "screenshot",
  "scroll",
  "click",
  "type",
  "press_key",
] as const

export type BrowserAction = (typeof BROWSER_ACTIONS)[number]

/**
 * The ones that only look: open a page, read it, move around it. What `Plan`
 * and `Read only` may call — `navigate` is a `WebFetch` that somebody can
 * watch, and `WebFetch` is on their list. A click or a keystroke can submit a
 * form, so those are not.
 */
export const BROWSER_READ_ACTIONS: readonly BrowserAction[] = [
  "tabs",
  "navigate",
  "back",
  "snapshot",
  "screenshot",
  "scroll",
]

/** A tool's name as the CLI calls it — `mcp__vey_browser__click`. */
export function browserTool(action: BrowserAction): string {
  return `mcp__${BROWSER_SERVER}__${action}`
}

/** The action a wire name is, or null for a tool that is not the browser's. */
export function browserActionOf(toolName: string): BrowserAction | null {
  const prefix = `mcp__${BROWSER_SERVER}__`
  if (!toolName.startsWith(prefix)) return null
  const action = toolName.slice(prefix.length)
  return (BROWSER_ACTIONS as readonly string[]).includes(action)
    ? (action as BrowserAction)
    : null
}

/** What a chat's browser is doing at `claude`'s request, pushed to the panel
 * so the page says who is moving it. `action` null is done. */
export type BrowserActivity = {
  chatId: string
  action: BrowserAction | null
}

/**
 * What main asks of a chat's panel. The renderer owns the tabs — they are
 * `<webview>`s, and only it can make one — so a tool that needs one made,
 * shown or closed says so here and waits for the attach or detach that
 * answers it.
 *
 * - `open`: the panel, with a first tab if it has none.
 * - `new`: a tab with this id, made the shown one, loading `url`.
 * - `select` / `close`: that tab.
 */
export type BrowserCommand =
  | { chatId: string; kind: "open" }
  | { chatId: string; kind: "new"; tabId: string; url: string }
  | { chatId: string; kind: "select"; tabId: string }
  | { chatId: string; kind: "close"; tabId: string }

/** A browser profile on this machine whose cookies can be imported —
 * `main/browser-import.ts`. */
export type CookieSource = {
  /** `chrome:Profile 3`, `firefox:Profiles/abc.default-release`. */
  id: string
  /** `Google Chrome`. */
  browser: string
  /** The name the user gave the profile, `Dương`. */
  profile: string
  /** The browser's app bundle, for its icon — macOS only. */
  app: string | null
  /** That icon as a data URL, filled in by main where it could get one. */
  icon?: string | null
}

/**
 * The element under a point of a tab's page, for the annotation toolbar's
 * `Select element` — where it is, in the page's own CSS pixels from the
 * viewport's corner, and enough to name it in a message.
 */
export type PickedElement = {
  rect: { x: number; y: number; width: number; height: number }
  /** A CSS selector that finds it again — an id where it has one. */
  selector: string
  /** Its visible text or label, shortened. */
  text: string
}

/** What a tab shows, as a PNG — the base the annotations are drawn over. */
export type BrowserCapture = { data: string; width: number; height: number }

/** One row of the dialog's site list: a site and how many cookies it has. */
export type CookieSite = { site: string; count: number }

/** How an import of cookies went: how many were set, and how many of the
 * file's were refused — expired, malformed, or turned down by Chromium. Null
 * `error` is a file that was read; `cancelled` is no file picked. */
export type CookieImport = {
  imported: number
  /** Already past their expiry in the browser they came from — not a
   * failure, and said apart from one. */
  expired?: number
  skipped: number
  error: string | null
  cancelled?: boolean
}

/**
 * What the address bar's text means as a URL, or null for nothing worth
 * loading.
 *
 * A scheme the browser should not be handed — `file:`, `javascript:`, an app's
 * own — is refused here rather than at the page: this is one gate for what is
 * typed and what the model asks for. A bare host gets `https://`, and anything
 * with a space or no dot is searched for instead, the way a browser's own bar
 * reads it.
 */
export function browserUrlOf(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (text === "about:blank") return text

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)?.[1]?.toLowerCase()
  if (scheme === "http" || scheme === "https") {
    try {
      return new URL(text).toString()
    } catch {
      return null
    }
  }
  // `localhost:3000` reads as a scheme to the test above, and is a host.
  if (scheme && !/^localhost:\d/i.test(text) && !/^[\w.-]+:\d+/.test(text)) {
    return null
  }

  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i
  if (local.test(text)) return `http://${text}`
  if (!/\s/.test(text) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text)) {
    return `https://${text}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}
