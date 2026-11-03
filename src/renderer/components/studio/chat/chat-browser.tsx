import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Cookie,
  Ellipsis,
  Globe,
  MousePointer2,
  Plus,
  RotateCw,
  SquareDashedMousePointer,
  Trash2,
  X,
} from "lucide-react"

import { browserUrlOf } from "@shared/browser"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useBrowser, type BrowserTab } from "@/lib/browser/store"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { IconButton } from "../icon-button"
import { BrowserAnnotate } from "./browser-annotate"
import { CookieClearDialog } from "./cookie-clear-dialog"
import { CookieImportDialog } from "./cookie-import-dialog"

/** The half of Electron's `<webview>` element this panel calls. Declared here
 * because the renderer's types are the DOM's, not Electron's. */
type WebviewElement = HTMLElement & {
  getWebContentsId: () => number
  getURL: () => string
  getTitle: () => string
  loadURL: (url: string) => Promise<void>
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
}

/**
 * `allowpopups`, without which a `target=_blank` link does nothing at all —
 * main opens it as a new tab instead (`onPopup`). Electron reads the
 * attribute's presence, and React drops a bare `true` on an element it does
 * not know, so it goes over as a string.
 */
const POPUPS = { allowpopups: "true" } as unknown as { allowpopups: boolean }

const DEFAULT_WIDTH = 560
const MIN_WIDTH = 320
/** What the transcript keeps however wide the browser is dragged. */
const MIN_TRANSCRIPT = 320

/** The width last dragged to, for every chat — in memory and per run, like
 * `SideColumn`'s. */
let remembered = DEFAULT_WIDTH

/**
 * Every chat's browser in this pane, beside the transcript.
 *
 * Here in `ChatPane` rather than inside the conversation, because that remounts
 * per chat and a `<webview>` remounted is a page loaded again from nothing. So
 * each chat that has opened one keeps its tabs for the run, stacked, and only
 * the shown chat's shown tab is visible — the rest stay laid out at the
 * panel's size, because a page with no size is one `screenshot` cannot draw
 * and a tool can still be driving it while somebody reads another chat.
 *
 * `docs/design.md` § The chat's browser.
 */
export function ChatBrowsers({ chatId }: { chatId: string }) {
  const t = useT()
  const mounted = useBrowser((state) => state.mounted)
  const visible = useBrowser((state) => state.shown.includes(chatId))
  const [width, setWidth] = useState(remembered)
  const [dragging, setDragging] = useState(false)
  const column = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; width: number } | null>(null)

  if (mounted.length === 0) return null

  const clamp = (value: number): number => {
    const pane = column.current?.parentElement?.clientWidth ?? Infinity
    return Math.round(
      Math.max(MIN_WIDTH, Math.min(value, pane - MIN_TRANSCRIPT))
    )
  }

  return (
    <div
      ref={column}
      style={{ width }}
      aria-label={t("transcript.browser.label")}
      className={cn(
        "flex shrink-0 flex-col border-l",
        // Laid out at full size but out of sight and out of the way — see
        // above for why it is not `hidden`.
        !visible &&
          "pointer-events-none invisible absolute inset-y-0 right-0 -z-10"
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {visible && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("transcript.side.resize", {
              label: t("transcript.browser.label").toLowerCase(),
            })}
            title={t("transcript.side.resizeHint")}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { x: event.clientX, width }
              setDragging(true)
            }}
            onPointerMove={(event) => {
              const start = drag.current
              if (!start) return
              setWidth(clamp(start.width + start.x - event.clientX))
            }}
            onPointerUp={() => {
              if (!drag.current) return
              drag.current = null
              setDragging(false)
              remembered = width
            }}
            onPointerCancel={() => {
              drag.current = null
              setDragging(false)
            }}
            onDoubleClick={() => {
              setWidth(DEFAULT_WIDTH)
              remembered = DEFAULT_WIDTH
            }}
            className={cn(
              "absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize",
              "after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:transition-colors hover:after:bg-ring/60",
              dragging && "after:bg-ring/60"
            )}
          />
        )}
        {mounted.map((id) => (
          <ChatBrowser
            key={id}
            chatId={id}
            shown={id === chatId}
            // A `<webview>` swallows pointer events, so a drag crossing it
            // would stop at its edge.
            dragging={dragging}
          />
        ))}
      </div>
    </div>
  )
}

/** One chat's browser: its tab strip, and its tabs stacked under it. */
function ChatBrowser({
  chatId,
  shown,
  dragging,
}: {
  chatId: string
  shown: boolean
  dragging: boolean
}) {
  const t = useT()
  const tabs = useBrowser((state) => state.tabs[chatId]) ?? []
  const active = useBrowser((state) => state.active[chatId])
  const acting = useBrowser((state) => state.acting[chatId])
  const { newTab, select, close, toggle } = useBrowser.getState()

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col bg-background",
        !shown && "invisible"
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b pr-1.5 pl-2">
        <div
          role="tablist"
          className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto"
        >
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              selected={tab.id === active}
              onSelect={() => select(chatId, tab.id)}
              onClose={() => close(chatId, tab.id)}
            />
          ))}
          <IconButton
            label={t("transcript.browser.newTab")}
            side="bottom"
            onClick={() => newTab(chatId)}
            className="size-6 shrink-0"
          >
            <Plus className="size-3.5" />
          </IconButton>
        </div>
        <BrowserMenu />
        <IconButton
          label={t("transcript.browser.close")}
          side="bottom"
          onClick={() => toggle(chatId)}
          className="size-6 shrink-0"
        >
          <X className="size-3.5" />
        </IconButton>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <TabPage
            key={tab.id}
            chatId={chatId}
            tab={tab}
            selected={tab.id === active}
            dragging={dragging}
          />
        ))}
        {/* Over the page while `claude` is moving it, so the person watching
          knows the pointer is not theirs. Not a block: they can still scroll
          and read. */}
        {acting && (
          <>
            <div className="pointer-events-none absolute inset-0 top-10 ring-2 ring-primary/40 ring-inset" />
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <div className="flex animate-pop items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1 text-[0.7rem] text-muted-foreground shadow-md">
                <MousePointer2 className="size-3 animate-pulse text-primary" />
                {t(`transcript.browser.acting.${acting}`)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({
  tab,
  selected,
  onSelect,
  onClose,
}: {
  tab: BrowserTab
  selected: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const t = useT()
  const title = tab.title || t("transcript.browser.newTab")
  return (
    <div
      role="tab"
      aria-selected={selected}
      title={title}
      onClick={onSelect}
      // A middle click closes, as in every browser.
      onAuxClick={(event) => {
        if (event.button === 1) onClose()
      }}
      className={cn(
        "group flex h-7 max-w-44 min-w-0 shrink-0 cursor-default items-center gap-1.5 rounded-md pr-1 pl-2 text-xs",
        selected
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50"
      )}
    >
      {tab.loading ? (
        <Spinner className="size-3 shrink-0" aria-label="" />
      ) : tab.favicon ? (
        <img src={tab.favicon} alt="" className="size-3.5 shrink-0" />
      ) : (
        <Globe className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <button
        type="button"
        aria-label={t("transcript.browser.closeTab")}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-sm hover:bg-foreground/10",
          !selected && "opacity-0 group-hover:opacity-100"
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

/** `…`: what is about the browser as a whole rather than a tab. */
function BrowserMenu() {
  const t = useT()
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              label={t("transcript.browser.more")}
              side="bottom"
              className="size-6 shrink-0"
            >
              <Ellipsis className="size-3.5" />
            </IconButton>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setImporting(true)}>
            <Cookie />
            {t("transcript.browser.importCookies")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setClearing(true)}
          >
            <Trash2 />
            {t("transcript.browser.clearCookies")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Mounted only while open, so each import starts from the first
        step with the browsers read afresh. */}
      {importing && <CookieImportDialog onClose={() => setImporting(false)} />}
      {clearing && <CookieClearDialog onClose={() => setClearing(false)} />}
    </>
  )
}

/** One tab: its bar and its `<webview>`. */
function TabPage({
  chatId,
  tab,
  selected,
  dragging,
}: {
  chatId: string
  tab: BrowserTab
  selected: boolean
  dragging: boolean
}) {
  const t = useT()
  const view = useRef<WebviewElement>(null)
  const [address, setAddress] = useState(
    tab.url === "about:blank" ? "" : tab.url
  )
  /** Whether the address bar has the caret, so a page arriving does not write
   * over what is being typed there. A ref: the listeners below read it. */
  const editing = useRef(false)
  const [history, setHistory] = useState({ back: false, forward: false })
  /** The annotation toolbar, over this tab's page. */
  const [annotating, setAnnotating] = useState(false)
  const loading = tab.loading

  useEffect(() => {
    const element = view.current
    if (!element) return
    const tabId = tab.id
    const { update } = useBrowser.getState()
    let attached: number | null = null

    const sync = () => {
      setHistory({
        back: element.canGoBack(),
        forward: element.canGoForward(),
      })
      const url = element.getURL()
      if (!editing.current) setAddress(url === "about:blank" ? "" : url)
      update(chatId, tabId, { title: element.getTitle() })
    }
    // Every `dom-ready`, not the first: a crashed guest comes back as a new
    // contents, and the tools have to reach the new one.
    const onReady = () => {
      const id = element.getWebContentsId()
      if (attached !== id) {
        if (attached !== null) {
          void window.desktop.browserDetach(chatId, tabId, attached)
        }
        attached = id
        void window.desktop.browserAttach(chatId, tabId, id).then(() => {
          // Picked before its page existed, which main could not act on then.
          if (useBrowser.getState().active[chatId] === tabId) {
            void window.desktop.browserFocus(chatId, tabId)
          }
        })
      }
      sync()
    }
    const onStart = () => update(chatId, tabId, { loading: true })
    const onStop = () => {
      update(chatId, tabId, { loading: false })
      sync()
    }
    const onTitle = (event: Event) =>
      update(chatId, tabId, {
        title: (event as Event & { title: string }).title,
      })
    const onFavicon = (event: Event) =>
      update(chatId, tabId, {
        favicon: (event as Event & { favicons: string[] }).favicons[0] ?? null,
      })
    const onNavigate = () => {
      update(chatId, tabId, { favicon: null })
      sync()
    }

    element.addEventListener("dom-ready", onReady)
    element.addEventListener("did-navigate", onNavigate)
    element.addEventListener("did-navigate-in-page", sync)
    element.addEventListener("did-start-loading", onStart)
    element.addEventListener("did-stop-loading", onStop)
    element.addEventListener("page-title-updated", onTitle)
    element.addEventListener("page-favicon-updated", onFavicon)
    return () => {
      element.removeEventListener("dom-ready", onReady)
      element.removeEventListener("did-navigate", onNavigate)
      element.removeEventListener("did-navigate-in-page", sync)
      element.removeEventListener("did-start-loading", onStart)
      element.removeEventListener("did-stop-loading", onStop)
      element.removeEventListener("page-title-updated", onTitle)
      element.removeEventListener("page-favicon-updated", onFavicon)
      if (attached !== null) {
        void window.desktop.browserDetach(chatId, tabId, attached)
      }
    }
  }, [chatId, tab.id])

  const go = (text: string) => {
    const url = browserUrlOf(text)
    if (!url) return
    setAddress(url)
    void view.current?.loadURL(url).catch(() => {
      // A failed load draws Chromium's own error page, which says more.
    })
  }

  return (
    <div
      role="tabpanel"
      className={cn("absolute inset-0 flex flex-col", !selected && "invisible")}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <IconButton
          label={t("transcript.browser.back")}
          side="bottom"
          disabled={!history.back}
          onClick={() => view.current?.goBack()}
          className="size-6"
        >
          <ArrowLeft className="size-3.5" />
        </IconButton>
        <IconButton
          label={t("transcript.browser.forward")}
          side="bottom"
          disabled={!history.forward}
          onClick={() => view.current?.goForward()}
          className="size-6"
        >
          <ArrowRight className="size-3.5" />
        </IconButton>
        <IconButton
          label={
            loading
              ? t("transcript.browser.stop")
              : t("transcript.browser.reload")
          }
          side="bottom"
          onClick={() =>
            loading ? view.current?.stop() : view.current?.reload()
          }
          className="size-6"
        >
          {loading ? (
            <X className="size-3.5" />
          ) : (
            <RotateCw className="size-3.5" />
          )}
        </IconButton>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            go(address)
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}
        >
          <div className="flex h-7 items-center gap-1.5 rounded-md border bg-muted/40 px-2">
            <Globe className="size-3 shrink-0 text-muted-foreground" />
            <input
              value={address}
              spellCheck={false}
              placeholder={t("transcript.browser.address")}
              onChange={(event) => setAddress(event.target.value)}
              onFocus={(event) => {
                editing.current = true
                event.currentTarget.select()
              }}
              onBlur={() => {
                editing.current = false
              }}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </form>
        <IconButton
          label={t("transcript.annotate.open")}
          side="bottom"
          disabled={!address}
          onClick={() => setAnnotating((open) => !open)}
          className={cn("size-6", annotating && "bg-accent")}
        >
          <SquareDashedMousePointer className="size-3.5" />
        </IconButton>
      </div>

      <div className="relative min-h-0 flex-1">
        <webview
          ref={view}
          // Written once: where the tab goes next is `loadURL`'s, and a `src`
          // that changed would navigate it a second time.
          src={tab.url}
          {...POPUPS}
          className={cn(
            "absolute inset-0 size-full",
            dragging && "pointer-events-none"
          )}
        />
        {annotating && selected && (
          <BrowserAnnotate
            chatId={chatId}
            tabId={tab.id}
            onClose={() => setAnnotating(false)}
          />
        )}
      </div>
    </div>
  )
}
