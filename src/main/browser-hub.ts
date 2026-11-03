import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import { randomUUID } from "node:crypto"

import {
  BROWSER_SERVER,
  browserUrlOf,
  type BrowserAction,
  type BrowserActivity,
  type BrowserCapture,
  type BrowserCommand,
  type PickedElement,
} from "../shared/browser"

/**
 * One tab of a chat's browser, as the tools need it: one `<webview>`'s page,
 * driven from main. `electron-browser.ts` builds one over the guest's
 * `webContents`; this file never sees Electron, so `test/browser.ts` can hand
 * it a fake.
 */
export type BrowserPage = {
  /** The guest's `webContents` id — what tells a re-attach of the same page
   * from a new one replacing it. */
  id: number
  alive: () => boolean
  /** Where it is, as one line: the title and the address. */
  where: () => string
  /** Who opens what the page asks to open in a new window — a
   * `target=_blank` link, a `window.open`. */
  onPopup?: (open: (url: string) => void) => void
  navigate: (url: string) => Promise<void>
  /** False when there was nothing to go back to. */
  back: () => Promise<boolean>
  reload: () => Promise<void>
  /** The page as text, its interactive elements numbered `[e1]`, `[e2]`… for
   * `click` and `type` to name. */
  snapshot: () => Promise<string>
  click: (ref: string) => Promise<void>
  hover: (ref: string) => Promise<void>
  type: (ref: string, text: string, submit: boolean) => Promise<void>
  press: (key: string) => Promise<void>
  /** Chooses a `<select>`'s options by value or text; answers what was
   * chosen, by text. */
  select: (ref: string, values: string[]) => Promise<string[]>
  /** Whether the page's visible text has this in it, for `wait_for`. */
  hasText: (text: string) => Promise<boolean>
  /** What the page logged since the last call, which forgets it. */
  console: () => ConsoleEntry[]
  scroll: (direction: "up" | "down", ref?: string) => Promise<void>
  /** `evaluationOf(script)` run in the page: its result as text, or what it
   * threw. */
  evaluate: (script: string) => Promise<Evaluation>
  screenshot: () => Promise<{ data: string; mimeType: string }>
  /** What it shows at full resolution, for the annotation toolbar. */
  capture: () => Promise<BrowserCapture>
  /** The element at a point of the viewport, for `Select element`. */
  inspect: (x: number, y: number) => Promise<PickedElement | null>
}

/** What `evaluate` answers: the value as JSON when `ok`, the error otherwise. */
export type Evaluation = { ok: boolean; value: string }

/** One line of a page's console, as `console-message` reports it. An uncaught
 * exception arrives here too, as an error. */
export type ConsoleEntry = {
  level: "debug" | "info" | "warning" | "error"
  text: string
  /** `file:line`, where Chromium said. */
  source?: string
}

/** The longest text `evaluate` or `console` hands back — `document.body
 * .outerHTML` on a real app is megabytes, and a page logging in a loop is
 * the same, and the turn pays for every one of them. */
const MAX_RESULT = 20_000

function cut(value: string): string {
  return value.length > MAX_RESULT
    ? `${value.slice(0, MAX_RESULT)}\n… (cut at ${MAX_RESULT} of ${value.length} characters)`
    : value
}

/** The longest `wait_for` may hold a turn. A page that never shows the text
 * should come back as an answer, and thirty seconds is longer than any build
 * a dev server runs before it serves. */
const MAX_WAIT_S = 30

/** Polls `check` until it is true or `ms` have passed. A check that throws —
 * the page navigating under it — is a no rather than the end of the wait. */
export async function waitUntil(
  check: () => Promise<boolean>,
  ms: number,
  step = 250
): Promise<boolean> {
  const end = Date.now() + ms
  for (;;) {
    try {
      if (await check()) return true
    } catch {
      // Between pages.
    }
    if (Date.now() >= end) return false
    await new Promise((resolve) => setTimeout(resolve, step))
  }
}

/** The console as `console` answers it. */
export function consoleText(
  entries: ConsoleEntry[],
  errorsOnly: boolean
): string {
  const shown = errorsOnly
    ? entries.filter((entry) => entry.level === "error")
    : entries
  if (shown.length === 0) {
    return errorsOnly
      ? "No errors in the console since the last look."
      : "Nothing in the console since the last look."
  }
  return cut(
    shown
      .map(
        (entry) =>
          `[${entry.level}] ${entry.text}${entry.source ? ` (${entry.source})` : ""}`
      )
      .join("\n")
  )
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  body: string
) => unknown

/**
 * What `evaluate` runs in the guest for a model's script.
 *
 * Three shapes are accepted, because a model writes all three: an expression
 * (`document.title`), a function (`() => { … }`, Playwright's shape, called),
 * and statements with a `return`. Which one it is, is decided by parsing here
 * in main — never by running it twice in the page, where a first attempt that
 * failed half-way would already have changed it. A script that parses as
 * neither is refused with the parser's message before the page sees it.
 *
 * The script is pasted into the source rather than handed to `eval` in the
 * page, so a page whose CSP forbids `unsafe-eval` still runs it. What it
 * threw comes back as text rather than as `executeJavaScript`'s rejection,
 * which says only that the script failed.
 */
export function evaluationOf(script: string): string {
  const source = script.trim()
  if (!source) throw new Error("There is no script to run.")
  const expression = `return (\n${source.replace(/;+\s*$/, "")}\n)`
  let body: string
  try {
    new AsyncFunction(expression)
    body = expression
  } catch {
    try {
      new AsyncFunction(source)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`The script does not parse: ${reason}`)
    }
    body = source
  }
  return `(async () => {
  const run = async () => {
${body}
  }
  try {
    let value = await run()
    if (typeof value === "function") value = await value()
    return { ok: true, value: (${SERIALISE_SCRIPT})(value) }
  } catch (error) {
    return { ok: false, value: String((error && error.stack) || error) }
  }
})()`
}

/**
 * A page value as JSON the model can read. Elements are their markup, cut —
 * `querySelector` is the commonest thing to return and `JSON.stringify` makes
 * it `{}` — node lists are arrays, and an object met twice is named rather
 * than walked again, which is also what keeps a cycle from throwing.
 */
const SERIALISE_SCRIPT = `(value) => {
  if (value === undefined) return "undefined"
  const seen = new WeakSet()
  const json = JSON.stringify(value, (key, item) => {
    if (typeof item === "bigint") return item.toString() + "n"
    if (typeof item === "function") return "[function]"
    if (item instanceof NodeList || item instanceof HTMLCollection) return [...item]
    if (item instanceof Node) {
      if (item.nodeType !== 1) return item.textContent
      const html = item.outerHTML
      return html.length > 500 ? html.slice(0, 499) + "…" : html
    }
    if (item && typeof item === "object") {
      if (seen.has(item)) return "[repeated]"
      seen.add(item)
    }
    return item
  }, 2)
  return json === undefined ? String(value) : json
}`

/** A tab as `tabs` lists it. */
export type BrowserTab = { tabId: string; where: string; active: boolean }

/** How long a tool waits for the panel to open and its page to attach, after
 * asking the renderer for it. A window that is closed or a renderer that is
 * reloading never answers, and the turn should hear so rather than hang. */
const ATTACH_MS = 15_000

/** Waiting for whichever tab of a chat attaches first, rather than one. */
const ANY_TAB = "*"

type ChatTabs = {
  /** In the order they were opened, which is the order the strip draws. */
  pages: Map<string, BrowserPage>
  /** The tab the tools act on — the one the strip shows. */
  active: string | null
}

/**
 * Which chat's browser is which pages.
 *
 * The renderer draws the `<webview>`s, so a tab exists only while a window has
 * the panel mounted: a tool that needs one asks for it (`command`) and waits
 * for the `attach` that answers. Which tab the tools act on is the one the
 * strip shows — `focus` when somebody clicks a tab, `select` when `claude`
 * does — so the person watching always sees the page being driven.
 */
export class BrowserHub {
  private readonly chats = new Map<string, ChatTabs>()
  private readonly waiting = new Map<string, ((page: BrowserPage) => void)[]>()

  constructor(
    private readonly command: (command: BrowserCommand) => void,
    private readonly report: (activity: BrowserActivity) => void,
    private readonly attachMs = ATTACH_MS,
    private readonly newId: () => string = randomUUID
  ) {}

  private tabsOf(chatId: string): ChatTabs {
    let tabs = this.chats.get(chatId)
    if (!tabs) {
      tabs = { pages: new Map(), active: null }
      this.chats.set(chatId, tabs)
    }
    return tabs
  }

  attach(chatId: string, tabId: string, page: BrowserPage): void {
    const tabs = this.tabsOf(chatId)
    tabs.pages.set(tabId, page)
    if (!tabs.active || !tabs.pages.has(tabs.active)) tabs.active = tabId
    // A popup is a tab of the same chat, made by the strip like any other.
    page.onPopup?.((url) => {
      this.newTab(chatId, url).catch(() => {})
    })
    for (const key of [`${chatId}\0${tabId}`, `${chatId}\0${ANY_TAB}`]) {
      const waiters = this.waiting.get(key) ?? []
      this.waiting.delete(key)
      for (const resolve of waiters) resolve(page)
    }
  }

  /** Only the page that is attached — a tab remounting attaches its new page
   * before the old one's teardown says goodbye. */
  detach(chatId: string, tabId: string, pageId: number): void {
    const tabs = this.chats.get(chatId)
    if (tabs?.pages.get(tabId)?.id !== pageId) return
    this.forget(tabs, tabId)
  }

  /** One tab's page, for what the strip itself does to it — the annotation
   * toolbar's capture and pick — rather than a tool. */
  page(chatId: string, tabId: string): BrowserPage | null {
    const page = this.chats.get(chatId)?.pages.get(tabId)
    return page?.alive() ? page : null
  }

  /** Somebody picked a tab in the strip. */
  focus(chatId: string, tabId: string): void {
    const tabs = this.chats.get(chatId)
    if (tabs?.pages.has(tabId)) tabs.active = tabId
  }

  private forget(tabs: ChatTabs, tabId: string): void {
    tabs.pages.delete(tabId)
    if (tabs.active === tabId)
      tabs.active = [...tabs.pages.keys()].at(-1) ?? null
  }

  private wait(chatId: string, tabId: string): Promise<BrowserPage> {
    const key = `${chatId}\0${tabId}`
    return new Promise<BrowserPage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.waiting.get(key) ?? []
        this.waiting.set(
          key,
          waiters.filter((waiter) => waiter !== done)
        )
        reject(
          new Error(
            "The browser panel did not open. The chat may not be on screen in a Vey window."
          )
        )
      }, this.attachMs)
      const done = (page: BrowserPage) => {
        clearTimeout(timer)
        resolve(page)
      }
      this.waiting.set(key, [...(this.waiting.get(key) ?? []), done])
    })
  }

  /** The tabs that are still there, in the strip's order. */
  tabs(chatId: string): BrowserTab[] {
    const tabs = this.chats.get(chatId)
    if (!tabs) return []
    for (const [tabId, page] of tabs.pages) {
      if (!page.alive()) this.forget(tabs, tabId)
    }
    return [...tabs.pages].map(([tabId, page]) => ({
      tabId,
      where: page.where(),
      active: tabId === tabs.active,
    }))
  }

  /** The tab the tools act on, opening the panel when there is none. */
  async pageFor(chatId: string): Promise<BrowserPage> {
    const tabs = this.tabsOf(chatId)
    const shown = tabs.active
    // Drops the tabs whose page has gone, which can move `active` to another.
    this.tabs(chatId)
    if (tabs.active) {
      // The strip is told when that happened: the tab the tools act on and
      // the one on screen are never two different tabs.
      if (tabs.active !== shown) {
        this.command({ chatId, kind: "select", tabId: tabs.active })
      }
      return tabs.pages.get(tabs.active)!
    }

    const arriving = this.wait(chatId, ANY_TAB)
    this.command({ chatId, kind: "open" })
    return arriving
  }

  /** A new tab, shown, loading `url` — and the page once it has attached. */
  async newTab(chatId: string, url: string): Promise<BrowserPage> {
    const tabId = this.newId()
    const arriving = this.wait(chatId, tabId)
    this.command({ chatId, kind: "new", tabId, url })
    const page = await arriving
    this.tabsOf(chatId).active = tabId
    return page
  }

  select(chatId: string, tabId: string): void {
    this.tabsOf(chatId).active = tabId
    this.command({ chatId, kind: "select", tabId })
  }

  close(chatId: string, tabId: string): void {
    this.forget(this.tabsOf(chatId), tabId)
    this.command({ chatId, kind: "close", tabId })
  }

  /** One tool call against a chat's browser, said on the panel while it runs. */
  async run<T>(
    chatId: string,
    action: BrowserAction,
    work: () => Promise<T>
  ): Promise<T> {
    this.report({ chatId, action })
    try {
      return await work()
    } finally {
      this.report({ chatId, action: null })
    }
  }

  /** Every page forgotten — the app quitting. */
  clear(): void {
    this.chats.clear()
  }
}

type ToolResult = CallToolResult

const text = (value: string): ToolResult => ({
  content: [{ type: "text", text: value }],
})

const failed = (error: unknown): ToolResult => ({
  content: [
    {
      type: "text",
      text: error instanceof Error ? error.message : String(error),
    },
  ],
  isError: true,
})

/** What an action that moved the page answers: where it is now, and the way to
 * read it. Not a snapshot — that is a few thousand tokens a turn may not want
 * after every keystroke. */
const after = (page: BrowserPage, done: string): ToolResult =>
  text(`${done}\nNow at: ${page.where()}\nCall snapshot to read the page.`)

const REF = z
  .string()
  .regex(/^e\d+$/, "A ref from the last snapshot, like e12.")
  .describe("The element's ref from the last snapshot, like e12.")

/**
 * The tools one chat's session is given — on its own server instance, because
 * the chat is the closure: a call can only ever reach the page beside the
 * conversation that made it.
 *
 * Their definitions are identical for every chat and every turn, which is
 * what keeps them inside the cached prefix (CLAUDE.md, "What the CLI is
 * handed"). Which mode may call which is `permits` in `chat.ts`, not here.
 */
export function browserServer(
  hub: BrowserHub,
  chatId: string
): McpSdkServerConfigWithInstance {
  /** An action on the tab the strip shows. */
  const call = (
    action: BrowserAction,
    work: (page: BrowserPage) => Promise<ToolResult>
  ): Promise<ToolResult> =>
    hub
      .run(chatId, action, async () => work(await hub.pageFor(chatId)))
      .catch((error: unknown) => failed(error))

  const listing = (): string => {
    const tabs = hub.tabs(chatId)
    if (tabs.length === 0) return "No tabs open."
    return tabs
      .map(
        (tab, index) => `[${index}]${tab.active ? " (shown)" : ""} ${tab.where}`
      )
      .join("\n")
  }

  return createSdkMcpServer({
    name: BROWSER_SERVER,
    version: "1.0.0",
    tools: [
      tool(
        "tabs",
        "List, open, show or close the browser panel's tabs. Every other browser tool acts on the shown tab. A link that opens a new window opens a new tab.",
        {
          action: z.enum(["list", "new", "select", "close"]),
          index: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("The tab, by its number in the list — select and close."),
          url: z
            .string()
            .optional()
            .describe("What a new tab opens; a blank page when left out."),
        },
        ({ action, index, url }) =>
          hub
            .run(chatId, "tabs", async () => {
              if (action === "new") {
                const target = url ? browserUrlOf(url) : "about:blank"
                if (!target) return failed(`Not a web address: ${url}`)
                await hub.newTab(chatId, target)
              } else if (action === "select" || action === "close") {
                const tab =
                  index === undefined ? undefined : hub.tabs(chatId)[index]
                if (!tab) {
                  return failed(`There is no tab ${index}.\n${listing()}`)
                }
                if (action === "select") hub.select(chatId, tab.tabId)
                else hub.close(chatId, tab.tabId)
              }
              return text(listing())
            })
            .catch((error: unknown) => failed(error))
      ),
      tool(
        "navigate",
        "Open a URL in the shown tab of the browser panel beside this chat in Vey. The user sees the page as you drive it, and it keeps their logins between chats. Use it for pages that need a real browser — a local dev server, a signed-in app, anything rendered by JavaScript. Opens the panel if it is closed.",
        { url: z.string().describe("The address, e.g. http://localhost:3000") },
        ({ url }) =>
          call("navigate", async (page) => {
            const target = browserUrlOf(url)
            if (!target) return failed(`Not a web address: ${url}`)
            await page.navigate(target)
            return after(page, `Opened ${target}`)
          })
      ),
      tool("back", "Go back one page in the browser panel's history.", {}, () =>
        call("back", async (page) =>
          (await page.back())
            ? after(page, "Went back.")
            : failed("There is no earlier page.")
        )
      ),
      tool(
        "reload",
        "Reload the shown tab — after changing the source, when the dev server does not update the page by itself.",
        {},
        () =>
          call("reload", async (page) => {
            await page.reload()
            return after(page, "Reloaded.")
          })
      ),
      tool(
        "snapshot",
        "Read the page in the browser panel: its title, address, the interactive elements numbered as refs ([e1], [e2]…) for click and type, and its visible text. Refs are renumbered by every snapshot, so take a new one after the page changes.",
        {},
        () => call("snapshot", async (page) => text(await page.snapshot()))
      ),
      tool(
        "screenshot",
        "A picture of what the browser panel shows right now — for layout, colours, images and anything the text snapshot cannot say.",
        {},
        () =>
          call("screenshot", async (page) => {
            const { data, mimeType } = await page.screenshot()
            return {
              content: [
                { type: "image", data, mimeType },
                { type: "text", text: page.where() },
              ],
            }
          })
      ),
      tool(
        "scroll",
        "Scroll the page, or one scrollable element of it, by most of a screen.",
        {
          direction: z.enum(["up", "down"]),
          ref: REF.optional().describe(
            "A scrollable element's ref; the page itself when left out."
          ),
        },
        ({ direction, ref }) =>
          call("scroll", async (page) => {
            await page.scroll(direction, ref)
            return text(`Scrolled ${direction}.`)
          })
      ),
      tool(
        "hover",
        "Move the pointer over an element by its ref from the last snapshot, to open a menu or a tooltip that shows on hover.",
        { ref: REF },
        ({ ref }) =>
          call("hover", async (page) => {
            await page.hover(ref)
            return after(page, `Hovering over ${ref}.`)
          })
      ),
      tool(
        "wait_for",
        `Wait until a text appears on the page, or is gone from it — for a page still loading or a change still arriving — or, with neither, simply wait some seconds. At most ${MAX_WAIT_S} seconds.`,
        {
          text: z.string().optional().describe("Wait until this is shown."),
          textGone: z
            .string()
            .optional()
            .describe("Wait until this is no longer shown."),
          seconds: z
            .number()
            .min(0)
            .max(MAX_WAIT_S)
            .optional()
            .describe(
              "How long to wait for the text before giving up (default 10), or how long to wait when no text is given (default 1)."
            ),
        },
        ({ text: shown, textGone, seconds }) =>
          call("wait_for", async (page) => {
            if (shown === undefined && textGone === undefined) {
              const ms = (seconds ?? 1) * 1000
              await new Promise((resolve) => setTimeout(resolve, ms))
              return after(page, `Waited ${seconds ?? 1}s.`)
            }
            const met = await waitUntil(
              async () =>
                (shown === undefined || (await page.hasText(shown))) &&
                (textGone === undefined || !(await page.hasText(textGone))),
              (seconds ?? 10) * 1000
            )
            const what = [
              shown !== undefined ? `"${shown}" shown` : "",
              textGone !== undefined ? `"${textGone}" gone` : "",
            ]
              .filter(Boolean)
              .join(" and ")
            return met
              ? after(page, `Done waiting: ${what}.`)
              : failed(
                  `Gave up after ${seconds ?? 10}s waiting for ${what}.\nNow at: ${page.where()}`
                )
          })
      ),
      tool(
        "console",
        "What the page has written to its console since the last call — its logs, warnings and errors, uncaught exceptions included; the last 200 lines at most.",
        {
          errorsOnly: z.boolean().optional().describe("Only the errors."),
        },
        ({ errorsOnly }) =>
          call("console", async (page) =>
            text(consoleText(page.console(), errorsOnly === true))
          )
      ),
      tool(
        "click",
        "Click an element of the page by its ref from the last snapshot, the way the user's mouse would.",
        { ref: REF },
        ({ ref }) =>
          call("click", async (page) => {
            await page.click(ref)
            return after(page, `Clicked ${ref}.`)
          })
      ),
      tool(
        "type",
        "Type into a field by its ref from the last snapshot, replacing what is in it.",
        {
          ref: REF,
          text: z.string(),
          submit: z
            .boolean()
            .optional()
            .describe("Press Enter afterwards, to submit a form or a search."),
        },
        ({ ref, text: typed, submit }) =>
          call("type", async (page) => {
            await page.type(ref, typed, submit === true)
            return after(page, `Typed into ${ref}.`)
          })
      ),
      tool(
        "press_key",
        "Press a key in the page: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Home, End, Space, or one character — with modifiers as Meta+A, Control+Shift+K.",
        { key: z.string() },
        ({ key }) =>
          call("press_key", async (page) => {
            await page.press(key)
            return after(page, `Pressed ${key}.`)
          })
      ),
      tool(
        "evaluate",
        "Run JavaScript in the shown tab's page, as its own scripts would, and get the result back as JSON. Pass an expression (document.title), a function (() => { … }) or statements with a return; await works. Use it for what snapshot cannot say — computed styles, a value in the app's state — or to try a change on the live page, like a colour. A change made this way lasts until the page reloads: the project's source still has to be edited for it to stay.",
        {
          script: z.string().describe("The JavaScript to run in the page."),
        },
        ({ script }) =>
          call("evaluate", async (page) => {
            const { ok, value } = await page.evaluate(script)
            return ok
              ? text(cut(value))
              : failed(`The script threw:\n${cut(value)}`)
          })
      ),
      tool(
        "select_option",
        "Choose options in a <select> by its ref from the last snapshot — by their value or their visible text, more than one for a multiple select. A custom dropdown that is not a <select> is clicked open instead.",
        {
          ref: REF,
          values: z.array(z.string()).min(1),
        },
        ({ ref, values }) =>
          call("select_option", async (page) => {
            const chosen = await page.select(ref, values)
            return after(page, `Chose ${chosen.join(", ")} in ${ref}.`)
          })
      ),
    ],
  })
}
