import { session, webContents, type WebContents } from "electron"

import type { CookieSite, PickedElement } from "../shared/browser"
import { schemeOf, type ImportedCookie } from "./browser-cookies"
import { siteOf } from "./browser-import"
import type { BrowserPage } from "./browser-hub"

/** Where the chat's browser keeps its cookies and storage: one profile for
 * every chat and every launch, so a site signed into once stays signed in —
 * and apart from the studio's own session, which a page has no business
 * reading. `guardWebviews` in `main.ts` puts every guest in it. */
export const BROWSER_PARTITION = "persist:vey-browser"

/** The sites that profile has cookies for, and how many each — what
 * `Clear cookies…` lists. Grouped as the import groups them (`siteOf`). */
export async function browserCookieSites(): Promise<CookieSite[]> {
  const cookies = await session.fromPartition(BROWSER_PARTITION).cookies.get({})
  const counts = new Map<string, number>()
  for (const cookie of cookies) {
    const site = siteOf(cookie.domain ?? "")
    if (site) counts.set(site, (counts.get(site) ?? 0) + 1)
  }
  return [...counts]
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => a.site.localeCompare(b.site))
}

/**
 * Removes the cookies of these sites from that profile — of every site when
 * `sites` is null, which is also its storage (local storage, IndexedDB, the
 * cache), since signing out of everything and keeping a site's tokens in
 * `localStorage` is not signing out.
 */
export async function clearBrowserCookies(
  sites: string[] | null
): Promise<number> {
  const browser = session.fromPartition(BROWSER_PARTITION)
  const cookies = await browser.cookies.get({})
  const wanted = sites ? new Set(sites) : null
  let removed = 0
  for (const cookie of cookies) {
    const domain = cookie.domain ?? ""
    if (wanted && !wanted.has(siteOf(domain))) continue
    const host = domain.replace(/^\./, "")
    // The scheme it was set through, which is the one it is bound to.
    const url = `${schemeOf(host, cookie.secure ?? false)}://${host}${cookie.path ?? "/"}`
    try {
      await browser.cookies.remove(url, cookie.name)
      removed += 1
    } catch {
      // Gone already, or a cookie Chromium will not name by URL — skipped.
    }
  }
  if (!wanted) await browser.clearStorageData()
  await browser.cookies.flushStore()
  return removed
}

/** Imported cookies into that profile, one at a time so a cookie Chromium
 * refuses — `SameSite=None` without `Secure`, a domain the URL does not match —
 * costs only itself. */
export async function setBrowserCookies(
  cookies: ImportedCookie[]
): Promise<{ set: number; failed: number }> {
  const jar = session.fromPartition(BROWSER_PARTITION).cookies
  let set = 0
  let failed = 0
  for (const cookie of cookies) {
    try {
      await jar.set(cookie)
      set += 1
    } catch {
      failed += 1
    }
  }
  await jar.flushStore()
  return { set, failed }
}

/**
 * A chat's `<webview>`, driven from main — the Electron half of
 * `browser-hub.ts`.
 *
 * The pointer and the keyboard go in through `sendInputEvent`, which Chromium
 * treats as the user's own input: a click is a real `mousedown`/`mouseup` at a
 * point, so a page that listens for pointer events or checks `isTrusted` sees
 * what it would from a person. Reading the page is `executeJavaScript` in the
 * guest's main world, which is the same thing DevTools' console does.
 */

/** A `<webview>` this window owns, as a page — or null for a contents that is
 * not one: a renderer naming some other id gets nothing to drive. */
export function guestPage(
  sender: WebContents,
  webContentsId: number
): BrowserPage | null {
  const contents = webContents.fromId(webContentsId)
  if (!contents || contents.isDestroyed()) return null
  if (contents.getType() !== "webview") return null
  if (contents.hostWebContents !== sender) return null
  return pageOf(contents)
}

/** How long an action waits for the page it started to finish loading. */
const SETTLE_MS = 10_000

/** A screenshot is shrunk to this width: a model reads a 1280px page as well as
 * a 2560px Retina one, at a quarter of the tokens. */
const SHOT_WIDTH = 1280

function pageOf(contents: WebContents): BrowserPage {
  const run = <T>(script: string): Promise<T> =>
    contents.executeJavaScript(script, true) as Promise<T>

  /**
   * Waits for whatever the last action set off: a beat for a click's handler to
   * start a navigation, and then the load, if there is one.
   */
  const settle = async (): Promise<void> => {
    await delay(300)
    if (!contents.isLoading()) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, SETTLE_MS)
      function done() {
        clearTimeout(timer)
        contents.off("did-stop-loading", done)
        resolve()
      }
      contents.on("did-stop-loading", done)
    })
  }

  /** The middle of a ref's element, scrolled into view — or a throw the model
   * can read. */
  const pointOf = async (ref: string): Promise<{ x: number; y: number }> => {
    const point = await run<{ x: number; y: number } | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(selectorOf(ref))})
      if (!el) return null
      el.scrollIntoView({ block: "center", inline: "center" })
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`)
    if (!point) throw new Error(missing(ref))
    return { x: Math.round(point.x), y: Math.round(point.y) }
  }

  const click = async (ref: string): Promise<void> => {
    const { x, y } = await pointOf(ref)
    contents.sendInputEvent({ type: "mouseMove", x, y })
    contents.sendInputEvent({
      type: "mouseDown",
      x,
      y,
      button: "left",
      clickCount: 1,
    })
    contents.sendInputEvent({
      type: "mouseUp",
      x,
      y,
      button: "left",
      clickCount: 1,
    })
  }

  const press = (key: string): void => {
    const { keyCode, modifiers, char } = keyOf(key)
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers })
    if (char !== null) {
      contents.sendInputEvent({ type: "char", keyCode: char, modifiers })
    }
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers })
  }

  return {
    id: contents.id,
    alive: () => !contents.isDestroyed(),
    // Replaces the same-page fallback `guardWebviews` set at attach: from here
    // on the hub knows the chat, and a popup is a tab of it.
    onPopup(open) {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) open(url)
        return { action: "deny" }
      })
    },
    where: () => {
      const title = contents.getTitle()
      const url = contents.getURL()
      return title && title !== url ? `${title} — ${url}` : url
    },

    async navigate(url) {
      try {
        await contents.loadURL(url)
      } catch (error) {
        // A redirect or a page that navigated again before it finished is
        // `ERR_ABORTED`, which is a page arriving rather than a failure.
        if (!String(error).includes("ERR_ABORTED")) throw error
      }
      await settle()
    },

    async back() {
      const history = contents.navigationHistory
      if (!history.canGoBack()) return false
      history.goBack()
      await settle()
      return true
    },

    async snapshot() {
      const body = await run<string>(SNAPSHOT_SCRIPT)
      return `${contents.getTitle()}\n${contents.getURL()}\n\n${body}`
    },

    async click(ref) {
      await click(ref)
      await settle()
    },

    async type(ref, text, submit) {
      await click(ref)
      // What was in the field is replaced rather than appended to, which is what
      // "type into the search box" means every time.
      const focused = await run<boolean>(`(() => {
        const el = document.querySelector(${JSON.stringify(selectorOf(ref))})
        if (!el) return false
        el.focus()
        if (typeof el.select === "function") el.select()
        else if (el.isContentEditable) {
          const range = document.createRange()
          range.selectNodeContents(el)
          const selection = getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
        }
        return true
      })()`)
      if (!focused) throw new Error(missing(ref))
      contents.insertText(text)
      if (submit) press("Enter")
      await settle()
    },

    async press(key) {
      press(key)
      await settle()
    },

    async scroll(direction, ref) {
      const sign = direction === "down" ? 1 : -1
      const found = await run<boolean>(`(() => {
        const ref = ${JSON.stringify(ref ? selectorOf(ref) : null)}
        const el = ref ? document.querySelector(ref) : document.scrollingElement
        if (!el) return false
        const height = ref ? el.clientHeight : innerHeight
        el.scrollBy({ top: ${sign} * height * 0.8, behavior: "instant" })
        return true
      })()`)
      if (!found && ref) throw new Error(missing(ref))
    },

    async capture() {
      const image = await contents.capturePage()
      if (image.isEmpty()) throw new Error("The page has nothing to show yet.")
      const { width, height } = image.getSize()
      return { data: image.toPNG().toString("base64"), width, height }
    },

    async inspect(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return run<PickedElement | null>(
        `(${INSPECT_SCRIPT})(${Number(x)}, ${Number(y)})`
      )
    },

    async screenshot() {
      const image = await contents.capturePage()
      if (image.isEmpty()) {
        throw new Error(
          "The browser panel has nothing to show yet — it may be hidden or still loading."
        )
      }
      const { width } = image.getSize()
      const sized =
        width > SHOT_WIDTH ? image.resize({ width: SHOT_WIDTH }) : image
      return {
        data: sized.toJPEG(80).toString("base64"),
        mimeType: "image/jpeg",
      }
    },
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A ref as the attribute selector the snapshot wrote. The tool's schema has
 * already held it to `e<digits>`; checked again because this is the line that
 * puts it inside a script. */
function selectorOf(ref: string): string {
  if (!/^e\d+$/.test(ref)) throw new Error(`Not a ref: ${ref}`)
  return `[data-vey-ref="${ref}"]`
}

const missing = (ref: string) =>
  `There is no ${ref} on the page any more. Take a new snapshot.`

/** The names `sendInputEvent` takes, for the ones the DOM spells otherwise. */
const KEY_NAMES: Record<string, string> = {
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
  space: "Space",
}

type Modifier = "shift" | "control" | "alt" | "meta"

const MODIFIERS: Record<string, Modifier> = {
  shift: "shift",
  control: "control",
  ctrl: "control",
  alt: "alt",
  option: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
}

/**
 * `Meta+A` as an input event: the key, its modifiers, and the `char` event a
 * key that types something also needs — without one, Enter does not submit a
 * form and a letter does not appear.
 */
function keyOf(spec: string): {
  keyCode: string
  modifiers: Modifier[]
  char: string | null
} {
  const parts = spec.split("+").filter(Boolean)
  const last = parts.pop() ?? spec
  const modifiers = parts.map((part) => {
    const modifier = MODIFIERS[part.toLowerCase()]
    if (!modifier) throw new Error(`Not a modifier: ${part}`)
    return modifier
  })
  const named = KEY_NAMES[last.toLowerCase()]
  const keyCode = named ?? last
  if (!named && [...last].length !== 1) throw new Error(`Not a key: ${last}`)

  // A shortcut types nothing; Shift alone still does.
  const typing = modifiers.every((modifier) => modifier === "shift")
  const char = !typing
    ? null
    : keyCode === "Enter"
      ? "\r"
      : keyCode === "Space"
        ? " "
        : named
          ? null
          : last
  return { keyCode, modifiers, char }
}

/**
 * The page as the model reads it, run in the guest.
 *
 * Two parts: every interactive element still on the page, numbered — the ref is
 * written onto the element (`data-vey-ref`), so a later `click` finds exactly
 * that one rather than re-resolving a description — and the page's own visible
 * text, which is what `innerText` already is. An accessibility tree would be
 * finer and is a CDP session this app would have to keep attached; this is a
 * read that leaves nothing behind but the attributes.
 *
 * Shadow roots and frames are not walked.
 */
const SNAPSHOT_SCRIPT = `(() => {
  const MAX_ELEMENTS = 400
  const MAX_TEXT = 12000
  for (const el of document.querySelectorAll("[data-vey-ref]")) {
    el.removeAttribute("data-vey-ref")
  }
  const selector = [
    "a[href]", "button", "input:not([type=hidden])", "textarea", "select",
    "summary", "[contenteditable='']", "[contenteditable='true']",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]",
    "[role=tab]", "[role=menuitem]", "[role=option]", "[role=switch]",
    "[role=combobox]", "[role=textbox]", "[role=searchbox]", "[onclick]",
  ].join(",")
  const clean = (value, max = 100) => {
    const text = String(value ?? "").replace(/\\s+/g, " ").trim()
    return text.length > max ? text.slice(0, max - 1) + "…" : text
  }
  const shown = (el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false
    const style = getComputedStyle(el)
    return style.visibility !== "hidden" && style.display !== "none"
  }
  const kindOf = (el) => {
    const role = el.getAttribute("role")
    if (role) return role
    const tag = el.tagName.toLowerCase()
    if (tag === "a") return "link"
    if (tag === "input") return (el.getAttribute("type") || "text") + " input"
    if (el.isContentEditable) return "editable"
    return tag
  }
  const nameOf = (el) => clean(
    el.getAttribute("aria-label") ||
    (el.labels && el.labels[0] && el.labels[0].innerText) ||
    el.getAttribute("alt") ||
    el.getAttribute("title") ||
    (el.tagName === "INPUT" ? "" : el.innerText) ||
    el.getAttribute("placeholder") ||
    el.getAttribute("name") ||
    ""
  )
  const lines = []
  let count = 0
  for (const el of document.querySelectorAll(selector)) {
    if (count >= MAX_ELEMENTS) {
      lines.push("… more elements not listed")
      break
    }
    if (!shown(el) || el.closest("[aria-hidden=true]")) continue
    const ref = "e" + ++count
    el.setAttribute("data-vey-ref", ref)
    let line = "[" + ref + "] " + kindOf(el)
    const name = nameOf(el)
    if (name) line += ' "' + name + '"'
    const tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA") {
      const type = el.type
      if (type === "checkbox" || type === "radio") {
        line += el.checked ? " (checked)" : " (unchecked)"
      } else if (type !== "password" && el.value) {
        line += " value=" + JSON.stringify(clean(el.value, 200))
      } else if (el.placeholder && name !== clean(el.placeholder)) {
        line += " placeholder=" + JSON.stringify(clean(el.placeholder))
      }
    } else if (tag === "SELECT") {
      const options = [...el.options].slice(0, 30).map((option) =>
        (option.selected ? "*" : "") + clean(option.text, 40))
      line += " options: " + options.join(" | ")
    } else if (tag === "A") {
      const href = el.getAttribute("href")
      if (href && !href.startsWith("javascript:")) line += " -> " + clean(href, 120)
    }
    if (el.disabled || el.getAttribute("aria-disabled") === "true") {
      line += " (disabled)"
    }
    lines.push(line)
  }
  let text = (document.body && document.body.innerText) || ""
  text = text.replace(/\\n{3,}/g, "\\n\\n").trim()
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "\\n… (text cut)"
  return "Elements:\\n" + (lines.join("\\n") || "(none)") + "\\n\\nText:\\n" + text
})()`

/**
 * The element under a point, run in the guest: its box, a selector that finds
 * it again, and its text. The selector is an id where the element has a
 * usable one, and otherwise a short path of tags, a class or two and
 * `:nth-of-type` — readable in a message, which is what it is for.
 */
const INSPECT_SCRIPT = `(x, y) => {
  const el = document.elementFromPoint(x, y)
  if (!el || el === document.documentElement || el === document.body) return null
  const clean = (value, max) => {
    const text = String(value || "").replace(/\\s+/g, " ").trim()
    return text.length > max ? text.slice(0, max - 1) + "…" : text
  }
  const step = (node) => {
    if (node.id && /^[A-Za-z][\\w-]*$/.test(node.id)) return "#" + node.id
    let part = node.tagName.toLowerCase()
    const classes = [...node.classList].filter((name) => /^[A-Za-z_-][\\w-]*$/.test(name)).slice(0, 2)
    if (classes.length) part += "." + classes.join(".")
    const parent = node.parentElement
    if (parent) {
      const same = [...parent.children].filter((child) => child.tagName === node.tagName)
      if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")"
    }
    return part
  }
  const parts = []
  for (let node = el; node && node !== document.body && parts.length < 4; node = node.parentElement) {
    const part = step(node)
    parts.unshift(part)
    if (part.startsWith("#")) break
  }
  const rect = el.getBoundingClientRect()
  return {
    rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    selector: parts.join(" > "),
    text: clean(el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("alt") || el.getAttribute("placeholder"), 120),
  }
}`
