import { useState, type DragEvent } from "react"
import { FolderX, Plus } from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useT, type Translate } from "@/lib/i18n"
import { useProjects } from "@/lib/projects"
import { useProjectIcon } from "@/lib/project-icon"
import { checkoutsOf, projectOf, projectsIn } from "@/lib/project-checkouts"
import { useStudio } from "@/lib/store"
import { useShells } from "@/lib/shell/store"
import { chatsOf, ungroupedChats, useChats } from "@/lib/chat/store"
import {
  avatarHue,
  avatarLetter,
  railBadgeOf,
  type RailBadge,
} from "@/lib/chat/column"
import type { Chat, WorkspaceFolder } from "@shared/api"
import { IconButton } from "../icon-button"
import { ProjectMenuItems } from "./project-actions"

/**
 * The workspace's projects, as the top of the `NavRail`: one icon each, and a
 * `+` to add another.
 *
 * Picking one is what the old tree's project row did — the column, Explorer
 * and the dock's shell all move to it — and picking the one already showing
 * hides the column, which is how the rail's own buttons behave. Each icon
 * carries the one badge worth reading about the chats inside it
 * (`railBadgeOf`): a count of what needs somebody, a spinner while something
 * runs, a dot for what has answered. That is what lets every project but one
 * be out of sight without anything in it going unnoticed.
 *
 * **Dragged to reorder**, the order written into the manifest
 * (`moveFolder`, `IPC.reorderFolders`): the rail is a list somebody reads by
 * position, and the project they work in most belongs at the top whatever
 * order they were added in. The menu's `Move up` / `Move down` are the same
 * move for somebody not holding a mouse.
 */
export function ProjectRail({ onAddFolder }: { onAddFolder: () => void }) {
  const folders = useStudio((state) => state.folders)
  const activeFolderId = useProjects((state) => state.activeFolderId)
  const showingUngrouped = useProjects((state) => state.ungrouped)
  const sidebar = useProjects((state) => state.sidebar)
  const view = useProjects((state) => state.view)
  const chats = useChats((state) => state.chats)
  const sending = useChats((state) => state.sending)
  const asks = useChats((state) => state.asks)
  const unread = useChats((state) => state.unread)
  const t = useT()

  const showing = sidebar && view === "projects"
  // The same fallback the column makes for an id that names nothing. Lit by
  // its project when the active folder is one of that project's worktrees.
  const activeFolder =
    folders.find((folder) => folder.id === activeFolderId) ?? folders[0]
  const active = activeFolder && projectOf(folders, activeFolder)
  const shown = projectsIn(folders)
  const orphans = ungroupedChats(chats)
  // The column's own rule: an empty `Ungrouped` falls back to the project.
  const ungrouped = showingUngrouped && orphans.length > 0

  /** The project being dragged, and where it would land if dropped now. */
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<DropMark | null>(null)

  function drop() {
    if (dragging && over && over.id !== dragging) {
      const rest = folders
        .map((folder) => folder.id)
        .filter((id) => id !== dragging)
      const at = rest.indexOf(over.id) + (over.place === "after" ? 1 : 0)
      void useStudio.getState().moveFolder(dragging, at)
    }
    setDragging(null)
    setOver(null)
  }

  function pick(folderId: string | null) {
    const projects = useProjects.getState()
    const already =
      folderId === null ? ungrouped : !ungrouped && active?.id === folderId
    if (already && showing) {
      projects.toggleView("projects")
      return
    }
    if (folderId === null) {
      projects.showUngrouped()
    } else if (!already) {
      // Only when it is another project: the column shown again on the one
      // it was hidden on stays on whichever of its worktrees was picked.
      projects.setActive(folderId)
      // The dock's shell follows, as it did from the tree: a terminal left in
      // the last project is a `pwd` nobody asked for. It does not open the
      // dock — see `showFor`.
      useShells.getState().showFor(folderId)
    }
    projects.showView("projects")
  }

  return (
    <div
      data-tour="projects"
      // The drop is the rail's rather than an icon's, so a project let go in
      // the gap between two icons still lands where the line said it would.
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(PROJECT_MIME)) {
          event.preventDefault()
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes(PROJECT_MIME)) return
        event.preventDefault()
        drop()
      }}
      className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1.5"
    >
      {shown.map((folder) => (
        <ProjectIcon
          key={folder.id}
          folder={folder}
          active={!ungrouped && active?.id === folder.id}
          // Its worktrees' chats too: a question waiting in one of them is
          // the project's to answer, and the worktree has no icon of its own.
          badge={railBadgeOf(
            checkoutsOf(folders, folder).flatMap((checkout) =>
              chatsOf(chats, checkout.id)
            ),
            sending,
            asks,
            unread
          )}
          onClick={() => pick(folder.id)}
          drag={{
            dragging: dragging === folder.id,
            mark:
              over?.id === folder.id && dragging !== folder.id
                ? over.place
                : null,
            onDragStart: (event) => {
              event.dataTransfer.setData(PROJECT_MIME, folder.id)
              event.dataTransfer.effectAllowed = "move"
              setDragging(folder.id)
            },
            onDragOver: (event) => {
              // Only a project of this rail: a file dragged over from Finder
              // is not asking to be put between two projects.
              if (!event.dataTransfer.types.includes(PROJECT_MIME)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = "move"
              const box = event.currentTarget.getBoundingClientRect()
              const place =
                event.clientY < box.top + box.height / 2 ? "before" : "after"
              if (over?.id !== folder.id || over.place !== place) {
                setOver({ id: folder.id, place })
              }
            },
            onDragEnd: () => {
              setDragging(null)
              setOver(null)
            },
          }}
        />
      ))}
      {orphans.length > 0 && (
        <UngroupedIcon
          chats={orphans}
          active={ungrouped}
          onClick={() => pick(null)}
        />
      )}
      <IconButton
        label={t("projects.rail.addProject")}
        side="right"
        onClick={onAddFolder}
        className="size-8 shrink-0 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-solid"
      >
        <Plus className="size-4" />
      </IconButton>
    </div>
  )
}

/** What a drag carries: a project's id, under a type of this app's own so a
 * drop can tell it from a file or a chat tab. */
const PROJECT_MIME = "application/x-veystudio-project"

/** Which side of a project the dragged one would land on. */
type DropMark = { id: string; place: "before" | "after" }

/** A project icon's half of the rail's drag. */
type SlotDrag = {
  dragging: boolean
  mark: DropMark["place"] | null
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

/** One project's icon: its picture, or its initial in a hue of its own. */
function ProjectIcon({
  folder,
  active,
  badge,
  onClick,
  drag,
}: {
  folder: WorkspaceFolder
  active: boolean
  badge: RailBadge
  onClick: () => void
  drag: SlotDrag
}) {
  const picture = useProjectIcon(folder.id)
  const t = useT()

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <RailSlot
            label={badgeTitle(t, folder.name, badge)}
            active={active}
            badge={badge}
            onClick={onClick}
            drag={drag}
          >
            {picture ? (
              <img
                src={picture}
                alt=""
                draggable={false}
                className="size-full rounded-[inherit] object-contain"
              />
            ) : (
              <span
                className="flex size-full items-center justify-center rounded-[inherit] text-[0.8125rem] font-semibold text-white"
                style={{
                  backgroundColor: `oklch(0.6 0.12 ${avatarHue(folder.id)})`,
                }}
              >
                {avatarLetter(folder.name)}
              </span>
            )}
          </RailSlot>
        }
      />
      <ContextMenuContent className="w-52">
        <ProjectMenuItems
          folder={folder}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The chats that belong to no project, drawn only while there are some. */
function UngroupedIcon({
  chats,
  active,
  onClick,
}: {
  chats: Chat[]
  active: boolean
  onClick: () => void
}) {
  // Never answering — a chat here has nowhere to run — so the only thing its
  // badge could say is a limit or an unread line from before the project left.
  const sending = useChats((state) => state.sending)
  const asks = useChats((state) => state.asks)
  const unread = useChats((state) => state.unread)
  const badge = railBadgeOf(chats, sending, asks, unread)
  const t = useT()
  return (
    <RailSlot
      label={t("projects.rail.ungrouped", { count: chats.length })}
      active={active}
      badge={badge}
      onClick={onClick}
    >
      <span className="flex size-full items-center justify-center rounded-[inherit] bg-muted text-muted-foreground">
        <FolderX className="size-4" />
      </span>
    </RailSlot>
  )
}

/**
 * The frame every icon in the list is drawn in: a 32px tile, a bar at the
 * rail's edge for the one picked, and the badge over its corner.
 *
 * Extra props go to the button — `ContextMenuTrigger`'s `render` hands it its
 * handlers and ref, and a slot that dropped them would right-click to nothing.
 */
function RailSlot({
  label,
  active,
  badge,
  onClick,
  drag,
  children,
  ...rest
}: {
  label: string
  active: boolean
  badge: RailBadge
  onClick: () => void
  /** Absent for `Ungrouped`, which is not one of the projects and so has no
   * place among them to be dragged to. */
  drag?: SlotDrag
  children: React.ReactNode
}) {
  return (
    <div
      draggable={drag ? true : undefined}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDragEnd={drag?.onDragEnd}
      className={cn(
        "relative flex w-full shrink-0 justify-center",
        drag?.dragging && "opacity-40"
      )}
    >
      {/* Where the dragged project would land: a line in the gap above or
          below this one, the gap being `gap-2` on the rail. */}
      {drag?.mark && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary",
            drag.mark === "before" ? "-top-[5px]" : "-bottom-[5px]"
          )}
        />
      )}
      {/* The picked one's bar, at the rail's edge — Discord's shape, and the
          one thing that has to read across the rail at a glance. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-r-full bg-foreground transition-[height]",
          active ? "h-5" : "h-0"
        )}
      />
      <IconButton
        {...rest}
        label={label}
        side="right"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        // Round whatever its state. It used to turn into a rounded square when
        // picked or hovered, Discord's way, and read as a glitch here: the bar
        // at the edge already says which one is picked, so hover only lights
        // it up.
        className={cn(
          "size-8 overflow-hidden rounded-full p-0 transition-opacity",
          active ? "opacity-100" : "opacity-75 hover:opacity-100"
        )}
      >
        {children}
      </IconButton>
      <Badge badge={badge} />
    </div>
  )
}

function Badge({ badge }: { badge: RailBadge }) {
  if (!badge) return null
  // `pointer-events-none` so it never swallows the click meant for the icon.
  if (badge.kind === "needs") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute -top-0.5 right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[0.5625rem] font-bold text-primary-foreground tabular-nums ring-2 ring-background"
      >
        {badge.count}
      </span>
    )
  }
  if (badge.kind === "working") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-background"
      >
        <Spinner className="size-3 text-muted-foreground" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 right-2 size-2 rounded-full bg-primary ring-2 ring-background"
    />
  )
}

/** The badge said out loud, after the project's name in the tooltip. */
function badgeTitle(t: Translate, name: string, badge: RailBadge): string {
  if (!badge) return name
  const vars = { name, count: badge.count }
  switch (badge.kind) {
    case "needs":
      return t("projects.rail.needs", vars)
    case "working":
      return t("projects.rail.running", vars)
    case "unread":
      return t("projects.rail.answered", vars)
  }
}
