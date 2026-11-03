import { create } from "zustand"

import type { TerminalShell } from "@shared/api"

import { useDock } from "../dock"
import { nameOf } from "../files/paths"
import { shownRootOf } from "../files/roots"
import { useProjects } from "../projects"
import { useSettings } from "../settings"
import { useStudio } from "../store"
import { projectOf, scopedShells, shownShellId } from "./scope"

/**
 * One shell in the dock: a pty, in a project's directory, and one of the
 * dock's tabs.
 *
 * **Any number per project.** It was one shell per place, identified by the
 * place, so that clicking a project pointed the dock at *its* shell — but a dev
 * server left running in a shell is a shell nobody can type `git log` into, and
 * the answer was a second dock tab. Clicking a project still follows it: the
 * dock switches to one of that project's shells when it has one, and the `+`
 * opens there. A pty's cwd is fixed when it starts, so following can only mean
 * another pty and not a `cd` sent into the first — which would land in
 * whatever is half-typed at the prompt and do nothing while a command is
 * running.
 *
 * **The strip is the project's.** It held every project's shells at once; it
 * draws only the active project's (and its worktrees') now, unless
 * `allProjectTabs` is on — `lib/shell/scope.ts`. The others stay mounted and
 * running, out of the strip.
 *
 * Not remembered across a launch. A shell here is ad-hoc — something opened
 * beside the work for one command — and replaying five of them on every launch
 * would be a surprise rather than a convenience. The ptys are killed on quit
 * either way.
 */
export type Shell = {
  id: string
  /** An **id**, never a path: main resolves the directory from its own
   * record. */
  folderId: string
  /** Which of main's shells this runs — PowerShell, Git Bash — or null for
   * the machine's default. Kept across a restart, which is the same shell
   * started over. */
  shellId: string | null
  /** A directory inside the folder the shell opens in, from the file tree's
   * `New terminal here`; null for the folder's root. Kept across a restart for
   * the same reason as `shellId`. */
  dir: string | null
  /** Bumped to remount the pane, which is what starting a shell over is. */
  attempt: number
  exited: boolean
  /** The directory the shell is in now, as main last read it — what its tab
   * is named after. Null until it has been asked. */
  cwd: string | null
  /** What the user called the tab, which wins over the cwd — a dev server's
   * tab named `vite` stays `vite` whatever it `cd`s into. Null for the
   * automatic name. */
  name: string | null
  /** A line typed into the shell once it starts — a push that needs a
   * passphrase — and never again: a restart is a plain shell. */
  command: string | null
}

type ShellState = {
  shells: Shell[]
  /** The tab last selected, or null when there is none. What the dock shows
   * is `shownShellId` over it, since this may be another project's. */
  activeId: string | null
  /** The shell last picked in each project, by project id — where the dock
   * lands on coming back to one. */
  picked: Record<string, string>
  /**
   * The project last clicked: where the dock looks when it is shown, and where
   * the `+` opens a shell.
   *
   * Recorded rather than acted on, because acting on it would mean spawning a
   * process. A pty started because a row in a list was clicked, running unread
   * behind a collapsed dock, is exactly the kind of thing that has to be asked
   * for. Showing the dock is the asking; see `ensure`.
   */
  target: string | null
  /** The shells installed on this machine, default first — null until the
   * `+` menu first asks. */
  installed: TerminalShell[] | null

  /** Points the dock at a project. Switches to one of its shells when it has
   * one, and otherwise only records where the next one goes. */
  showFor: (folderId: string) => void
  /**
   * Starts a shell in the target project when the dock is opened onto none of
   * that project's.
   *
   * Only on opening: it used to start one in every project clicked while the
   * dock was open, which left a pty per project nobody had typed into. A
   * project clicked with the dock already open shows an empty strip, and the
   * `+` is what opens one there.
   *
   * Called by the panel while it is on screen, which is what keeps a pty from
   * being started for a dock nobody opened. With nothing clicked yet it falls
   * back to the first folder rather than to a picker: a tab that opens onto a
   * question is a tab that has to be answered before it is any use.
   */
  ensure: () => void
  /** The `+`: another shell, in the target project, beside the ones open —
   * the default one, or the one picked from the menu beside it. */
  add: (shellId?: string) => void
  /** A shell in `folderId` that types `command` as it starts, in the dock and
   * on screen — a push that needs a passphrase, run where it can ask for
   * one rather than behind anybody's back. */
  run: (folderId: string, command: string) => void
  /** A shell in `dir`, a directory inside `folderId` — the file tree's `New
   * terminal here`. Opened beside the others, like `add`, and in the dock. */
  openAt: (folderId: string, dir: string) => void
  /** Asks main which shells there are, once. */
  loadInstalled: () => void
  select: (id: string) => void
  /** Ends the shell's pty and drops its tab. The last one in the strip closing
   * shuts the dock, as an editor's panel does — a dock left open onto nothing
   * would start a shell the moment anything nudged it. */
  close: (id: string) => void
  /** Starts a shell's pty over, in the same place. */
  restart: (id: string) => void
  setExited: (id: string, exited: boolean) => void
  setCwd: (id: string, cwd: string) => void
  /** Names the tab; a blank name hands it back to the cwd. */
  rename: (id: string, name: string) => void
}

/**
 * What each tab is called: the directory its shell is in now — so a `cd`
 * renames it, as a terminal app's own tab does — or its project's name before
 * that is known. Numbered from the second tab of the same name on, so two tabs
 * are never one word — except a name somebody typed, which is shown as typed.
 */
export function shellLabels(
  shells: Shell[],
  projectOf: (folderId: string) => string
): Map<string, string> {
  const seen = new Map<string, number>()
  const labels = new Map<string, string>()
  for (const shell of shells) {
    if (shell.name) {
      labels.set(shell.id, shell.name)
      continue
    }
    const name = shell.cwd ? dirName(shell.cwd) : projectOf(shell.folderId)
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    labels.set(shell.id, count === 1 ? name : `${name} ${count}`)
  }
  return labels
}

/** The last segment of a directory, with `/` itself left as `/`. */
function dirName(cwd: string): string {
  return nameOf(cwd.replace(/[\\/]+$/, "")) || cwd
}

/** The project the strip is scoped to: the one Explorer is drawing. */
function currentProject(): string | null {
  const { folders } = useStudio.getState()
  const root = shownRootOf(folders, useProjects.getState().activeFolderId)
  return root ? projectOf(folders, root.id) : null
}

/** The shells the strip draws right now, read from the stores. */
function inStrip(shells: Shell[]): Shell[] {
  return scopedShells(
    shells,
    useStudio.getState().folders,
    currentProject(),
    useSettings.getState().allProjectTabs
  )
}

export const useShells = create<ShellState>((set, get) => {
  /** Selects a shell and remembers it as its project's. */
  function pick(id: string): Partial<ShellState> {
    const shell = get().shells.find((candidate) => candidate.id === id)
    if (!shell) return { activeId: id }
    const project = projectOf(useStudio.getState().folders, shell.folderId)
    return { activeId: id, picked: { ...get().picked, [project]: id } }
  }

  /** Keeps only the shells `alive` accepts, and moves the dock onto a
   * neighbour when the one it was showing went. The pty is not killed here: the
   * pane unmounts with the shell and its own teardown is what ends it. */
  function keep(alive: (shell: Shell) => boolean) {
    const before = get().shells
    const shells = before.filter(alive)
    if (shells.length === before.length) return

    const { activeId } = get()
    let next = activeId
    if (!shells.some((shell) => shell.id === activeId)) {
      // The tab to its left, as a browser does, or the new first one.
      const at = before.findIndex((shell) => shell.id === activeId)
      const left = before
        .slice(0, Math.max(at, 0))
        .reverse()
        .find((shell) => shells.includes(shell))
      next = (left ?? shells[0])?.id ?? null
    }
    set({ shells, activeId: next })
  }

  /** Where a shell opens with no project said: the one last clicked — while
   * it is still the project being worked in, since the `+` is on that
   * project's strip — that project, the one on screen, the first. */
  function place(): string | null {
    const { target, shells, activeId } = get()
    const { folders } = useStudio.getState()
    const project = currentProject()
    if (target && (project === null || projectOf(folders, target) === project))
      return target
    return (
      project ??
      shells.find((shell) => shell.id === activeId)?.folderId ??
      folders[0]?.id ??
      null
    )
  }

  function start(
    folderId: string,
    shellId: string | null = null,
    command: string | null = null,
    dir: string | null = null
  ) {
    const shell: Shell = {
      id: crypto.randomUUID(),
      folderId,
      shellId,
      dir,
      attempt: 0,
      exited: false,
      cwd: null,
      name: null,
      command,
    }
    set({ shells: [...get().shells, shell] })
    set(pick(shell.id))
  }

  // A folder dropped from the workspace takes its shells with it: they run in a
  // directory the studio no longer points at.
  useStudio.subscribe((studio) => {
    const kept = new Set(studio.folders.map((folder) => folder.id))
    keep((shell) => kept.has(shell.folderId))
    const target = get().target
    if (target && !kept.has(target)) set({ target: null })
  })

  return {
    shells: [],
    activeId: null,
    picked: {},
    target: null,
    installed: null,

    showFor(folderId) {
      const { shells, activeId, picked } = get()
      const showing = shells.find((shell) => shell.id === activeId)
      // Already on one of its shells: stay on the one somebody picked.
      if (showing?.folderId === folderId) {
        set({ target: folderId })
        return
      }
      const project = projectOf(useStudio.getState().folders, folderId)
      const own =
        shells.find(
          (shell) => shell.id === picked[project] && shell.folderId === folderId
        ) ?? shells.find((shell) => shell.folderId === folderId)
      set({ target: folderId })
      if (own) set(pick(own.id))
    },

    ensure() {
      if (inStrip(get().shells).length > 0) return
      const folderId = place()
      if (folderId) start(folderId)
    },

    add(shellId) {
      const folderId = place()
      if (!folderId) return
      start(folderId, shellId ?? null)
      useDock.getState().show()
    },

    run(folderId, command) {
      set({ target: folderId })
      start(folderId, null, command)
      useDock.getState().show()
    },

    openAt(folderId, dir) {
      set({ target: folderId })
      start(folderId, null, null, dir)
      useDock.getState().show()
    },

    loadInstalled() {
      if (get().installed) return
      void window.desktop
        .terminalShells()
        .then((installed) => set({ installed }))
        .catch(() => set({ installed: [] }))
    },

    select(id) {
      set(pick(id))
      useDock.getState().show()
    },

    close(id) {
      keep((shell) => shell.id !== id)
      if (inStrip(get().shells).length === 0) useDock.getState().close()
    },

    restart(id) {
      set({
        shells: get().shells.map((shell) =>
          shell.id === id
            ? {
                ...shell,
                attempt: shell.attempt + 1,
                exited: false,
                command: null,
              }
            : shell
        ),
        activeId: id,
      })
    },

    setCwd(id, cwd) {
      const shell = get().shells.find((candidate) => candidate.id === id)
      if (!shell || shell.cwd === cwd) return
      set({
        shells: get().shells.map((candidate) =>
          candidate.id === id ? { ...candidate, cwd } : candidate
        ),
      })
    },

    rename(id, name) {
      const trimmed = name.trim() || null
      set({
        shells: get().shells.map((shell) =>
          shell.id === id ? { ...shell, name: trimmed } : shell
        ),
      })
    },

    setExited(id, exited) {
      set({
        shells: get().shells.map((shell) =>
          shell.id === id ? { ...shell, exited } : shell
        ),
      })
    },
  }
})

/**
 * The strip as the dock draws it: the project's shells, and which of them is
 * on screen. A hook rather than a selector because the answer is read off
 * three stores — the column's project and the `allProjectTabs` setting as
 * well as the shells.
 */
export function useScopedShells(): { scoped: Shell[]; shownId: string | null } {
  const shells = useShells((state) => state.shells)
  const activeId = useShells((state) => state.activeId)
  const picked = useShells((state) => state.picked)
  const folders = useStudio((state) => state.folders)
  const activeFolderId = useProjects((state) => state.activeFolderId)
  const all = useSettings((state) => state.allProjectTabs)

  const root = shownRootOf(folders, activeFolderId)
  const project = root ? projectOf(folders, root.id) : null
  const scoped = scopedShells(shells, folders, project, all)
  return { scoped, shownId: shownShellId(scoped, activeId, picked, project) }
}
