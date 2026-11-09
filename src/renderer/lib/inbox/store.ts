import { create } from "zustand"

import type { InboxAuth, ProjectInbox } from "@shared/api"
import { NO_FILTER, type InboxFilter } from "./filter"
import { projectOf } from "../project-checkouts"
import { useProjects } from "../projects"
import { useStudio } from "../store"

/**
 * Each project's ClickUp inbox as main last pushed it (`main/clickup-inbox.ts`),
 * and the `Inbox` tabs: one per project, whose id **is** the project's folder
 * id — the shape `Git Graph` has (`lib/files/git-graph.ts`).
 *
 * What is open in each tab — the item being read, whether the connect form is
 * up — is kept here per project rather than in the pane, which is drawn for
 * whichever tab is selected and would forget it on every switch.
 */
export type InboxView = "updates" | "tasks"

type InboxState = {
  byFolder: Record<string, ProjectInbox>
  /** How ClickUp is read — a key, a sign-in, or neither; null until asked. */
  auth: InboxAuth | null

  openIds: string[]
  selectedId: string | null
  /** The item each project's tab is reading. */
  picked: Record<string, string | null>
  /** Projects whose tab shows the connect form over a connected inbox. */
  editing: string[]
  /** Each project's filter bar — `lib/inbox/filter.ts`. */
  filters: Record<string, InboxFilter>
  /** Each project's list: every update, or grouped by task. */
  views: Record<string, InboxView>
  /** The task each project's `Tasks` view is reading. */
  pickedTask: Record<string, string | null>

  load: () => Promise<void>
  listen: () => () => void
  open: (folderId: string) => void
  select: (folderId: string) => void
  close: (folderId: string) => void
  closeOthers: (folderId: string) => void
  closeAll: () => void
  reorder: (ids: string[]) => void
  pick: (folderId: string, itemId: string) => void
  setEditing: (folderId: string, on: boolean) => void
  setAuth: (auth: InboxAuth) => void
  signOut: () => Promise<void>
  markAllRead: (folderId: string) => void
  setFilter: (folderId: string, patch: Partial<InboxFilter>) => void
  setView: (folderId: string, view: InboxView) => void
  pickTask: (folderId: string, taskId: string) => void
  clearFilter: (folderId: string) => void
}

function byFolderOf(inboxes: ProjectInbox[]): Record<string, ProjectInbox> {
  return Object.fromEntries(inboxes.map((inbox) => [inbox.folderId, inbox]))
}

export const useInbox = create<InboxState>((set, get) => ({
  byFolder: {},
  auth: null,
  openIds: [],
  selectedId: null,
  picked: {},
  editing: [],
  filters: {},
  views: {},
  pickedTask: {},

  async load() {
    const [inboxes, auth] = await Promise.all([
      window.desktop.inboxes(),
      window.desktop.inboxAuth(),
    ])
    set({ byFolder: byFolderOf(inboxes), auth })
  },

  listen() {
    return window.desktop.onInboxChanged((inboxes) =>
      set({ byFolder: byFolderOf(inboxes) })
    )
  },

  open(folderId) {
    get().select(folderId)
  },

  select(folderId) {
    const { openIds } = get()
    set({
      openIds: openIds.includes(folderId) ? openIds : [...openIds, folderId],
      selectedId: folderId,
    })
    useStudio.getState().showPane("inbox")
    // Onto the project, unless a worktree of it is already picked — its inbox
    // is the project's, and moving Explorer off the worktree would be a
    // side effect nobody asked for.
    const { folders } = useStudio.getState()
    const active = folders.find(
      (folder) => folder.id === useProjects.getState().activeFolderId
    )
    const project = folders.find((folder) => folder.id === folderId)
    if (project && (!active || projectOf(folders, active).id !== folderId)) {
      useProjects.getState().setActive(folderId)
    }
  },

  close(folderId) {
    const openIds = get().openIds.filter((entry) => entry !== folderId)
    set({
      openIds,
      selectedId:
        get().selectedId === folderId
          ? (openIds.at(-1) ?? null)
          : get().selectedId,
    })
  },

  closeOthers(folderId) {
    set({ openIds: [folderId], selectedId: folderId })
  },

  closeAll() {
    set({ openIds: [], selectedId: null })
  },

  reorder(ids) {
    const open = new Set(get().openIds)
    set({ openIds: ids.filter((id) => open.has(id)) })
  },

  pick(folderId, itemId) {
    set((state) => ({ picked: { ...state.picked, [folderId]: itemId } }))
    const item = get().byFolder[folderId]?.items.find(
      (entry) => entry.id === itemId
    )
    if (item && !item.read) {
      void window.desktop.inboxMarkRead(folderId, [itemId])
    }
  },

  setEditing(folderId, on) {
    set((state) => ({
      editing: on
        ? [...state.editing.filter((id) => id !== folderId), folderId]
        : state.editing.filter((id) => id !== folderId),
    }))
  },

  setAuth(auth) {
    set({ auth })
  },

  async signOut() {
    await window.desktop.inboxSignOut()
    set({ auth: "none" })
  },

  markAllRead(folderId) {
    void window.desktop.inboxMarkRead(folderId, null)
  },

  setFilter(folderId, patch) {
    set((state) => ({
      filters: {
        ...state.filters,
        [folderId]: { ...(state.filters[folderId] ?? NO_FILTER), ...patch },
      },
    }))
  },

  setView(folderId, view) {
    set((state) => ({ views: { ...state.views, [folderId]: view } }))
  },

  /** Opening a task is reading its whole history, so all of it is read. */
  pickTask(folderId, taskId) {
    set((state) => ({
      pickedTask: { ...state.pickedTask, [folderId]: taskId },
    }))
    const unread = (get().byFolder[folderId]?.items ?? [])
      .filter((item) => item.taskId === taskId && !item.read)
      .map((item) => item.id)
    if (unread.length > 0) void window.desktop.inboxMarkRead(folderId, unread)
  },

  clearFilter(folderId) {
    set((state) => ({ filters: { ...state.filters, [folderId]: NO_FILTER } }))
  },
}))

/** How many of an inbox's items nobody has opened. */
export function unreadOf(inbox: ProjectInbox | undefined): number {
  return inbox ? inbox.items.filter((item) => !item.read).length : 0
}
