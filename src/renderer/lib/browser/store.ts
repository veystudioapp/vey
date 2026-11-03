import { create } from "zustand"

import type { BrowserAction, BrowserCommand } from "@shared/browser"

/** One tab of a chat's browser, as the strip draws it. */
export type BrowserTab = {
  id: string
  /** What the tab was opened on — its `<webview>`'s `src`, written once.
   * Where it is now is the page's own business, and the bar reads it there. */
  url: string
  title: string
  favicon: string | null
  loading: boolean
}

/**
 * Which chats have a browser beside them in this window, and their tabs.
 *
 * `mounted` and `shown` are two lists because closing the panel only hides it:
 * the pages are the ones the chat's `claude` is driving, and a page taken out
 * of the tree is a page reloaded from nothing — its sign-in, its scroll, its
 * half-filled form. So a chat's tabs stay mounted for the run once opened, and
 * `shown` says whether the panel takes room beside the transcript. In memory,
 * like the pane's other per-run state: nothing is written down but the
 * cookies, which are the partition's.
 *
 * The tabs are this store's rather than main's because a tab is a
 * `<webview>`, which only the renderer can make; main learns of one when it
 * attaches (`browserAttach`) and asks for one through `BrowserCommand`.
 */
type BrowserState = {
  mounted: string[]
  shown: string[]
  tabs: Record<string, BrowserTab[]>
  /** Each chat's shown tab — the one the tools act on. */
  active: Record<string, string>
  /** What each chat's `claude` is doing to its page right now. */
  acting: Record<string, BrowserAction>

  /** The panel, with a blank first tab when it has none. */
  open: (chatId: string) => void
  toggle: (chatId: string) => void
  newTab: (chatId: string, url?: string, tabId?: string) => void
  select: (chatId: string, tabId: string) => void
  close: (chatId: string, tabId: string) => void
  /** What a tab's page said about itself. */
  update: (
    chatId: string,
    tabId: string,
    patch: Partial<Pick<BrowserTab, "title" | "favicon" | "loading">>
  ) => void
  /** Subscribes to main's two pushes; returns the unsubscribe. */
  listen: () => () => void
}

const adding = (list: string[], id: string) =>
  list.includes(id) ? list : [...list, id]

const blankTab = (id: string, url: string): BrowserTab => ({
  id,
  url,
  title: "",
  favicon: null,
  loading: url !== "about:blank",
})

export const useBrowser = create<BrowserState>()((set, get) => ({
  mounted: [],
  shown: [],
  tabs: {},
  active: {},
  acting: {},

  open(chatId) {
    set({
      mounted: adding(get().mounted, chatId),
      shown: adding(get().shown, chatId),
    })
    if ((get().tabs[chatId] ?? []).length === 0) get().newTab(chatId)
  },

  toggle(chatId) {
    if (get().shown.includes(chatId)) {
      set({ shown: get().shown.filter((id) => id !== chatId) })
    } else {
      get().open(chatId)
    }
  },

  newTab(chatId, url = "about:blank", tabId = crypto.randomUUID()) {
    const tabs = get().tabs[chatId] ?? []
    if (tabs.some((tab) => tab.id === tabId)) return
    set({
      mounted: adding(get().mounted, chatId),
      shown: adding(get().shown, chatId),
      tabs: { ...get().tabs, [chatId]: [...tabs, blankTab(tabId, url)] },
      active: { ...get().active, [chatId]: tabId },
    })
    void window.desktop.browserFocus(chatId, tabId)
  },

  select(chatId, tabId) {
    if (!(get().tabs[chatId] ?? []).some((tab) => tab.id === tabId)) return
    set({ active: { ...get().active, [chatId]: tabId } })
    void window.desktop.browserFocus(chatId, tabId)
  },

  close(chatId, tabId) {
    const tabs = get().tabs[chatId] ?? []
    const at = tabs.findIndex((tab) => tab.id === tabId)
    if (at < 0) return
    const left = tabs.filter((tab) => tab.id !== tabId)
    const active = { ...get().active }
    // The neighbour that slides into its place, as every browser does it.
    if (active[chatId] === tabId) {
      const next = left[Math.min(at, left.length - 1)]
      if (next) {
        active[chatId] = next.id
        void window.desktop.browserFocus(chatId, next.id)
      } else delete active[chatId]
    }
    set({
      tabs: { ...get().tabs, [chatId]: left },
      active,
      // The last tab closed is the panel closed, as a browser's window is.
      shown:
        left.length === 0
          ? get().shown.filter((id) => id !== chatId)
          : get().shown,
    })
  },

  update(chatId, tabId, patch) {
    const tabs = get().tabs[chatId]
    if (!tabs) return
    set({
      tabs: {
        ...get().tabs,
        [chatId]: tabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...patch } : tab
        ),
      },
    })
  },

  listen() {
    // A tool needing a page, a tab, or a different one — see `BrowserCommand`.
    // Answered by the `<webview>` that mounts or unmounts as a result.
    const stopCommands = window.desktop.onBrowserCommand(
      (command: BrowserCommand) => {
        const { chatId } = command
        if (command.kind === "open") get().open(chatId)
        else if (command.kind === "new") {
          get().newTab(chatId, command.url, command.tabId)
        } else if (command.kind === "select") {
          get().select(chatId, command.tabId)
          set({ shown: adding(get().shown, chatId) })
        } else get().close(chatId, command.tabId)
      }
    )
    const stopActivity = window.desktop.onBrowserActivity(
      ({ chatId, action }) => {
        const acting = { ...get().acting }
        if (action) acting[chatId] = action
        else delete acting[chatId]
        set({ acting })
      }
    )
    return () => {
      stopCommands()
      stopActivity()
    }
  },
}))
