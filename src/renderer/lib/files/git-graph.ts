import { create } from "zustand"

import type { GitLogScope } from "@shared/api"
import { useProjects } from "../projects"
import { useStudio } from "../store"

/**
 * The `Git Graph` tabs: one per checkout, whose id **is** the root's, the shape
 * the `Changes` tab has (`lib/files/changes.ts`) and for the same reason — the
 * tab is about one repository and belongs in the strip exactly while that
 * project is the one being worked in (`rootOf` in `lib/panels.ts` is the
 * identity).
 *
 * The branches each tab is showing are kept per root here rather than in the
 * pane, which is drawn for whichever tab is selected and would forget them on
 * every switch. In memory, like the rest: a graph is reopened in a click.
 */
type GitGraphState = {
  openIds: string[]
  selectedId: string | null
  /** What each root's graph walks — every branch until somebody picks one. */
  scope: Record<string, GitLogScope>

  open: (rootId: string) => void
  select: (rootId: string) => void
  close: (rootId: string) => void
  closeOthers: (rootId: string) => void
  closeAll: () => void
  reorder: (ids: string[]) => void
  setScope: (rootId: string, scope: GitLogScope) => void
}

/** Every branch, remote ones included: what `Git Graph` is opened for. */
export const ALL_BRANCHES: GitLogScope = { kind: "all", remotes: true }

export const useGitGraph = create<GitGraphState>((set, get) => ({
  openIds: [],
  selectedId: null,
  scope: {},

  open(rootId) {
    get().select(rootId)
  },

  select(rootId) {
    const { openIds } = get()
    set({
      openIds: openIds.includes(rootId) ? openIds : [...openIds, rootId],
      selectedId: rootId,
    })
    // Not a section, so nothing else puts this pane on screen — and the
    // workbench moves to the tab's project, or the tab would be selected and
    // out of scope in the same breath. Both as `useChanges.select` does.
    useStudio.getState().showPane("graph")
    if (useStudio.getState().folders.some((folder) => folder.id === rootId)) {
      useProjects.getState().setActive(rootId)
    }
  },

  close(rootId) {
    const openIds = get().openIds.filter((entry) => entry !== rootId)
    set({
      openIds,
      selectedId:
        get().selectedId === rootId
          ? (openIds.at(-1) ?? null)
          : get().selectedId,
    })
  },

  closeOthers(rootId) {
    set({ openIds: [rootId], selectedId: rootId })
  },

  closeAll() {
    set({ openIds: [], selectedId: null })
  },

  reorder(ids) {
    const open = new Set(get().openIds)
    set({ openIds: ids.filter((id) => open.has(id)) })
  },

  setScope(rootId, scope) {
    set((state) => ({ scope: { ...state.scope, [rootId]: scope } }))
  },
}))
