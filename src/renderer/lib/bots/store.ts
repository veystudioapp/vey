import { create } from "zustand"

import type { Bot, BotInput } from "@shared/api"
import { useChats } from "../chat/store"
import { projectOf } from "../project-checkouts"
import { useProjects } from "../projects"
import { useStudio } from "../store"

/**
 * Every project's bots as main last pushed them (`main/bots.ts`), and the
 * `Bots` tabs: one per project, whose id **is** the project's folder id —
 * the inbox's shape (`lib/inbox/store.ts`). `docs/design.md` § Bots.
 */

/** The form, open over one project's tab: a bot being edited, or a new one
 * with whatever a starting point filled in. */
export type BotForm = {
  projectId: string
  bot: Bot | null
  draft?: Partial<BotInput>
}

type BotsState = {
  bots: Bot[]
  openIds: string[]
  selectedId: string | null
  form: BotForm | null

  load: () => Promise<void>
  listen: () => () => void
  open: (projectId: string) => void
  select: (projectId: string) => void
  close: (projectId: string) => void
  closeOthers: (projectId: string) => void
  closeAll: () => void
  reorder: (ids: string[]) => void
  edit: (form: BotForm | null) => void
}

/**
 * What a push means for the chats store, against the list it replaces.
 *
 * A run's chat is made by main, so the column has never heard of it: a chat
 * id not seen before is a re-read of the listing. A run that has just turned
 * `quiet` ended on `NOTHING_TO_REPORT`, and the dot the renderer put on it a
 * moment earlier (`marksUnread`, off the same quiet) comes off — only on that
 * transition, so a quiet run somebody has since continued keeps its own dot.
 */
function follow(before: Bot[], after: Bot[]) {
  const runsBefore = new Map(
    before.flatMap((bot) => bot.runs.map((run) => [run.id, run] as const))
  )
  let fresh = false
  for (const bot of after) {
    for (const run of bot.runs) {
      const was = runsBefore.get(run.id)
      if (run.chatId && was?.chatId !== run.chatId) fresh = true
      if (run.state === "quiet" && was?.state !== "quiet" && run.chatId) {
        useChats.getState().markRead(run.chatId)
      }
    }
  }
  if (fresh) void useChats.getState().refresh()
}

export const useBots = create<BotsState>((set, get) => ({
  bots: [],
  openIds: [],
  selectedId: null,
  form: null,

  async load() {
    set({ bots: await window.desktop.bots() })
  },

  listen() {
    return window.desktop.onBotsChanged((bots) => {
      follow(get().bots, bots)
      set({ bots })
    })
  },

  open(projectId) {
    get().select(projectId)
  },

  select(projectId) {
    const { openIds } = get()
    set({
      openIds: openIds.includes(projectId) ? openIds : [...openIds, projectId],
      selectedId: projectId,
    })
    useStudio.getState().showPane("bots")
    // Onto the project unless one of its worktrees is already picked — the
    // inbox's rule, for the inbox's reason.
    const { folders } = useStudio.getState()
    const active = folders.find(
      (folder) => folder.id === useProjects.getState().activeFolderId
    )
    const project = folders.find((folder) => folder.id === projectId)
    if (project && (!active || projectOf(folders, active).id !== projectId)) {
      useProjects.getState().setActive(projectId)
    }
  },

  close(projectId) {
    const openIds = get().openIds.filter((entry) => entry !== projectId)
    set({
      openIds,
      selectedId:
        get().selectedId === projectId
          ? (openIds.at(-1) ?? null)
          : get().selectedId,
    })
  },

  closeOthers(projectId) {
    set({ openIds: [projectId], selectedId: projectId })
  },

  closeAll() {
    set({ openIds: [], selectedId: null })
  },

  reorder(ids) {
    const open = new Set(get().openIds)
    set({ openIds: ids.filter((id) => open.has(id)) })
  },

  edit(form) {
    set({ form })
  },
}))

/** A project's bots, in the order they were made. */
export function botsOf(bots: Bot[], projectId: string): Bot[] {
  return bots.filter((bot) => bot.projectId === projectId)
}
