import type { ReactNode } from "react"
import { Puzzle, Search, Settings, SquareTerminal } from "lucide-react"

import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useDock } from "@/lib/dock"
import { useProjects } from "@/lib/projects"
import { useWorkspaceSearch } from "@/lib/workspace-search"
import { PLUGIN_ICON_COMPONENTS } from "@/lib/plugins/icons"
import { runPluginButton, usePlugins } from "@/lib/plugins/store"
import { IconButton } from "./icon-button"
import { ProjectRail } from "./project/project-rail"

/**
 * The window's leftmost strip: the workspace's projects at the top, and the
 * ways into the rest of the window at the foot.
 *
 * **The projects are here**, one icon each (`ProjectRail`), and the column
 * beside the rail is the chats of the one picked. They were a tree in that
 * column, opened and shut one by one, with a button at the top of this strip
 * that showed and hid the whole column; picking a project is that button now,
 * and picking the one already showing hides the column. `docs/design.md`
 * § Projects and chats has the argument.
 *
 * Its own card rather than part of the column's, so the column can collapse to
 * nothing and leave the projects — the way back to it — on screen.
 */
export function NavRail({
  onOpenSettings,
  onAddFolder,
}: {
  onOpenSettings: () => void
  /** The workbench's Add folder dialog, for the `+` under the projects. */
  onAddFolder: () => void
}) {
  // "Showing" is the column open *on that view*: Search open hides the
  // projects as surely as a shut column does.
  const column = useProjects((state) => state.sidebar)
  const view = useProjects((state) => state.view)
  const toggleView = useProjects((state) => state.toggleView)
  const searching = column && view === "search"
  const browsingPlugins = column && view === "plugins"
  const dockOpen = useDock((state) => state.open)
  const pluginButtons = usePlugins((state) => state.railButtons)
  const toggleDock = useDock((state) => state.toggle)
  const t = useT()

  return (
    <nav
      aria-label={t("nav.rail.window")}
      className="studio-surface flex w-12 shrink-0 flex-col items-center gap-1 rounded-xl bg-background py-2 outline -outline-offset-1 outline-border"
    >
      <ProjectRail onAddFolder={onAddFolder} />
      <div aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />

      {/* The workspace's `Find in files`, in the left column — `⌘P` (the title
          bar's field) is still the way to go to a file or a chat by name. */}
      <RailButton
        label={t(searching ? "nav.rail.hideSearch" : "nav.rail.search")}
        pressed={searching}
        onClick={() => {
          toggleView("search")
          if (!searching) useWorkspaceSearch.getState().focus()
        }}
      >
        <Search />
      </RailButton>

      {/* The plugins, in the left column as Search is — a view with a pressed
          state, so it sits with Search rather than with the plugins' own
          buttons below, which run something and have none. */}
      <RailButton
        label={t(browsingPlugins ? "nav.rail.hidePlugins" : "nav.rail.plugins")}
        pressed={browsingPlugins}
        onClick={() => toggleView("plugins")}
      >
        <Puzzle />
      </RailButton>

      {/* What plugins add, at the foot beside Settings rather than under
          Search: a plugin's button runs something — the built-in `usage`
          plugin's dashboard (`plugins/usage/`) is a dialog — and has no pressed
          state, so beside the column's two views it read as a third. Above
          Terminal, so the foot's two stay put however many plugins there are. */}
      {pluginButtons.map((button) => {
        const Icon = PLUGIN_ICON_COMPONENTS[button.icon]
        return (
          <RailButton
            key={button.id}
            label={button.label}
            onClick={() => void runPluginButton(button)}
          >
            <Icon />
          </RailButton>
        )
      })}
      <RailButton
        label={t("nav.rail.terminal")}
        pressed={dockOpen}
        onClick={toggleDock}
        tour="terminal"
      >
        <SquareTerminal />
      </RailButton>
      <RailButton label={t("common.settings")} onClick={onOpenSettings}>
        <Settings />
      </RailButton>
    </nav>
  )
}

function RailButton({
  label,
  pressed,
  onClick,
  tour,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  /** The name the onboarding tour finds this button by (`data-tour`). */
  tour?: string
  children: ReactNode
}) {
  return (
    <div className="relative" data-tour={tour}>
      <IconButton
        label={label}
        side="right"
        pressed={pressed}
        onClick={onClick}
        className={cn(
          "size-8 [&_svg]:size-4",
          pressed && "bg-accent text-accent-foreground"
        )}
      >
        {children}
      </IconButton>
    </div>
  )
}
