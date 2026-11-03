import { create } from "zustand"

import { isStringArray, recall, remember } from "./tab-memory"

/** Whether the column is showing, and what in it is folded shut. */
const COLUMN_KEY = "projects.column"

/**
 * What the left column can stack.
 *
 * It could stack three: `projects`, and the Database and API panels' own lists.
 * Those two were hidden out of `SIDEBAR_SECTIONS` first and deleted with their
 * panels afterwards, so this is a union of one — kept as a union, and kept
 * beside `SIDEBAR_SECTIONS`, because the two answer different questions: what
 * a section may be, and which are drawn.
 */
export type SidebarSection = "projects"

/**
 * Which of them the column actually draws.
 *
 * Conductor's left column, which is the shape this was held against: the
 * projects and their chats, and nothing else competing for the height. It is
 * the one line saying which sections are drawn, so the next one to arrive is an
 * id added here.
 */
export const SIDEBAR_SECTIONS: SidebarSection[] = ["projects"]

/**
 * What the left column is showing: its sections, or the workspace's Search.
 *
 * One or the other rather than Search stacked as a section, which is the
 * editors' activity bar: a search's results are a list as long as the projects'
 * and as worth the whole height, and two of them sharing it evenly would halve
 * both. The `NavRail` button for each is the switch.
 */
export type SidebarView = "projects" | "search"

type RememberedColumn = {
  sidebar: boolean
  /** Which projects a tree drawn by an older build had folded. Read by
   * nothing: there is no tree any more (`docs/design.md` § Projects and
   * chats), and it is optional only so a record that still has it is valid. */
  collapsed?: string[]
  /** Optional: written by a build whose Explorer drew every project at once,
   * and so had none. */
  activeFolderId?: string | null
  /** Optional for the same reason: the column held only the projects then. */
  shutSections?: string[]
  /** Optional: there were no checkout groups before. */
  shutCheckouts?: string[]
  /** Optional: the column had no Search before. */
  view?: string
}

function isRememberedColumn(value: unknown): value is RememberedColumn {
  const record = value as Partial<RememberedColumn> | null
  return (
    typeof record?.sidebar === "boolean" &&
    (record.collapsed === undefined || isStringArray(record.collapsed)) &&
    (record.activeFolderId === undefined ||
      record.activeFolderId === null ||
      typeof record.activeFolderId === "string") &&
    (record.shutSections === undefined || isStringArray(record.shutSections)) &&
    (record.shutCheckouts === undefined ||
      isStringArray(record.shutCheckouts)) &&
    (record.view === undefined || typeof record.view === "string")
  )
}

type ProjectsState = {
  /**
   * Whether the left column is showing.
   *
   * Its own toggle rather than sharing the panels' `⌘B`: the two columns are
   * about different things — one is the workspace's projects, one is whichever
   * panel the section tabs are on — and a single key that took both would leave
   * the workbench with no left edge at all. Remembered, because a column that
   * comes back every launch is a column somebody closes every launch.
   */
  sidebar: boolean
  toggleSidebar: () => void

  view: SidebarView
  /**
   * A `NavRail` button: shows the column on `view`, or — already showing it —
   * hides the column, which is how the editors' activity bar behaves.
   */
  toggleView: (view: SidebarView) => void
  /** Shows the column on `view` whatever it was doing — `⇧⌘F`. */
  showView: (view: SidebarView) => void

  /**
   * Which of the column's sections are folded shut.
   *
   * Shut rather than open, the same way the projects are: a section shown again
   * (see `SIDEBAR_SECTIONS`) turns up open rather than hiding until somebody
   * finds the setting. Several can be open at once — that is the point of
   * stacking them instead of switching between them, and it is why the folds are
   * kept while only one section is drawn: they cost nothing and are what the
   * others come back to.
   */
  shutSections: string[]
  toggleSection: (section: SidebarSection) => void

  /**
   * Which checkouts' chat groups are folded in the column — by folder id, so
   * a worktree removed leaves an id that names nothing and folds nothing.
   * Remembered with the rest of the column: a long-finished branch folded
   * away is folded because somebody wants it out of the way every launch.
   */
  shutCheckouts: string[]
  toggleCheckout: (folderId: string) => void

  /**
   * Whether the column is showing the chats that belong to no project, rather
   * than `activeFolderId`'s.
   *
   * Beside `activeFolderId` rather than a sentinel inside it: that id is what
   * Explorer and the dock's shell follow, and `Ungrouped` names no directory
   * for either of them to point at. Not remembered — it is a place somebody
   * visits to read an old chat, not one they work in.
   */
  ungrouped: boolean
  showUngrouped: () => void

  /**
   * The project being worked in, or null before anything has been clicked.
   *
   * Explorer draws **this one**, and only this one: what somebody has open is
   * the files of the thing they are working on, and every other project's tree
   * above and below it is a list to scroll past. The workspace still holds them
   * all — that is what the column is, and clicking a row there is what moves
   * this.
   */
  activeFolderId: string | null

  /** Works in a project. The one call the rail's project icons make. */
  setActive: (folderId: string) => void

  /** Reads the remembered column. Idempotent: Strict Mode mounts twice. */
  restore: () => Promise<void>
}

export const useProjects = create<ProjectsState>((set, get) => {
  let restorePromise: Promise<void> | null = null

  function rememberColumn() {
    const { sidebar, activeFolderId, shutSections, shutCheckouts, view } = get()
    remember(COLUMN_KEY, {
      sidebar,
      activeFolderId,
      shutSections,
      shutCheckouts,
      view,
    })
  }

  return {
    // Open by default: it is the way to every project and every chat, and
    // closed only because somebody closed it.
    sidebar: true,
    activeFolderId: null,
    ungrouped: false,

    setActive(folderId) {
      if (get().ungrouped) set({ ungrouped: false })
      if (get().activeFolderId === folderId) return
      set({ activeFolderId: folderId })
      rememberColumn()
    },

    showUngrouped() {
      set({ ungrouped: true })
    },

    toggleSidebar() {
      set({ sidebar: !get().sidebar })
      rememberColumn()
    },

    view: "projects",

    toggleView(view) {
      const { sidebar, view: shown } = get()
      set(
        sidebar && shown === view ? { sidebar: false } : { sidebar: true, view }
      )
      rememberColumn()
    },

    showView(view) {
      set({ sidebar: true, view })
      rememberColumn()
    },

    shutSections: [],

    toggleSection(section) {
      const { shutSections } = get()
      set({
        shutSections: shutSections.includes(section)
          ? shutSections.filter((entry) => entry !== section)
          : [...shutSections, section],
      })
      rememberColumn()
    },

    shutCheckouts: [],

    toggleCheckout(folderId) {
      const { shutCheckouts } = get()
      set({
        shutCheckouts: shutCheckouts.includes(folderId)
          ? shutCheckouts.filter((entry) => entry !== folderId)
          : [...shutCheckouts, folderId],
      })
      rememberColumn()
    },

    restore() {
      restorePromise ??= (async () => {
        const stored = await recall(COLUMN_KEY, isRememberedColumn)
        if (stored) {
          set({
            sidebar: stored.sidebar,
            // Not checked against a list here: the folders are read after
            // this, and `shownRoot` falls back to the first project for an id
            // that names nothing. A project removed while the app was shut is
            // a tree that opens on another one rather than on an error.
            activeFolderId: stored.activeFolderId ?? null,
            shutSections: stored.shutSections ?? [],
            shutCheckouts: stored.shutCheckouts ?? [],
            view: stored.view === "search" ? "search" : "projects",
          })
        }
      })()
      return restorePromise
    },
  }
})
