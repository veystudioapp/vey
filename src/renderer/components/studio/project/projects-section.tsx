import { useState, type ReactNode } from "react"
import {
  ChevronRight,
  FolderGit2,
  GitBranch,
  MoreHorizontal,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useProjects } from "@/lib/projects"
import { byCheckout, checkoutsOf, projectOf } from "@/lib/project-checkouts"
import { useShells } from "@/lib/shell/store"
import { useStudio } from "@/lib/store"
import { chatsOf, ungroupedChats, useChats } from "@/lib/chat/store"
import { columnSections } from "@/lib/chat/column"
import type { Chat, WorkspaceFolder } from "@shared/api"
import { IconButton } from "../icon-button"
import { SideRow } from "../side-row"
import { AccountsFooter } from "./accounts"
import { ChatList } from "./chat-list"
import { ProjectFailure, ProjectMenuItems } from "./project-actions"

/**
 * The chats this column lists: the ones that are on disk.
 *
 * A `+` opens a tab before anything has been said in it — the chat is held in
 * `unsaved` until its first message writes it down. The strip is what is open
 * in this run and so shows it at once; this column is where a conversation from
 * last week is found again, and a row for a chat that will leave no file if the
 * tab is shut is a row that disappears without anybody deleting it.
 */
function saved(chats: Chat[], unsaved: string[]): Chat[] {
  if (unsaved.length === 0) return chats
  return chats.filter((chat) => !unsaved.includes(chat.id))
}

/**
 * **One project's chats**, the project picked in the rail.
 *
 * It was a tree of every project, each folded open or shut, with a shut
 * project saying what was inside it as a count. That is the wrong shape for
 * what this app is for — several chats on several accounts at once — because
 * the way somebody does that is to start a chat, fold its project away and
 * start another, and a column of folded projects is a column that says almost
 * nothing. The projects moved to the rail (`ProjectRail`), each icon carrying
 * the one badge worth reading, and this column is the chats of the one picked:
 * what needs somebody, what is running, and the rest — and at its foot, how
 * much each account has left. `docs/design.md` § Projects and chats.
 */
export function ProjectsSection({ onAddFolder }: { onAddFolder: () => void }) {
  const folders = useStudio((state) => state.folders)
  const branches = useStudio((state) => state.branches)
  const activeFolderId = useProjects((state) => state.activeFolderId)
  const showingUngrouped = useProjects((state) => state.ungrouped)
  const chats = useChats((state) => state.chats)
  const unsaved = useChats((state) => state.unsaved)
  const t = useT()

  const listed = saved(chats, unsaved)
  const orphans = ungroupedChats(listed)
  // Only while there is something in it: the last ungrouped chat deleted leaves
  // the column on the project rather than on an empty list with no `+`, and
  // the rail stops drawing the icon that picked it.
  const ungrouped = showingUngrouped && orphans.length > 0
  // The active project, or the first one for an id that names nothing — the
  // same fallback Explorer's `shownRoot` makes, so the two never disagree about
  // which project is on screen.
  const folder =
    folders.find((entry) => entry.id === activeFolderId) ?? folders[0] ?? null

  if (!ungrouped && !folder) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("projects.section.emptyHint")}
        </p>
        <Button size="sm" onClick={onAddFolder}>
          <Plus />
          {t("projects.section.addProject")}
        </Button>
      </div>
    )
  }

  // The project's own chats and its worktrees' together: a worktree is the
  // same project on another branch, so its chats are listed here rather than
  // behind a switch somebody has to remember is there.
  const checkouts = ungrouped
    ? []
    : checkoutsOf(folders, projectOf(folders, folder!))
  const own = ungrouped
    ? orphans
    : checkouts.flatMap((checkout) => chatsOf(listed, checkout.id))

  return (
    <nav
      aria-label={t("projects.section.chats")}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      {ungrouped ? (
        <Header
          title={t("projects.section.ungrouped")}
          caption={t("projects.section.ungroupedCaption")}
        />
      ) : (
        <ProjectHeader
          project={projectOf(folders, folder!)}
          folder={folder!}
          branch={branches[folder!.id] ?? null}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        <Sections
          chats={own}
          checkouts={checkouts.length > 1 ? checkouts : null}
          activeId={folder?.id ?? null}
        />
      </div>

      <ProjectFailure />
      <AccountsFooter />
    </nav>
  )
}

/** A column header: a title, a line under it, and whatever acts on it. */
function Header({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b py-2 pr-2 pl-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[0.8125rem] font-semibold">{title}</h2>
        <p className="truncate text-[0.6875rem] text-muted-foreground">
          {caption}
        </p>
      </div>
      {children}
    </div>
  )
}

/**
 * The picked project: its name, where the picked checkout is and what is
 * checked out there, a `+` for a chat in that checkout, and the project's menu
 * — the same items its icon in the rail right-clicks to.
 */
function ProjectHeader({
  project,
  folder,
  branch,
}: {
  project: WorkspaceFolder
  folder: WorkspaceFolder
  branch: string | null
}) {
  const t = useT()
  return (
    <Header
      title={project.name}
      caption={[tildePath(folder.path), branch].filter(Boolean).join(" · ")}
    >
      <Button
        size="xs"
        variant="outline"
        className="pl-1.5 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground dark:hover:bg-primary/15"
        onClick={() => void useChats.getState().create({ folderId: folder.id })}
        title={t("projects.section.newChatIn", { name: folder.name })}
      >
        <Plus className="text-primary" />
        {/* Segoe UI's tall ascent sets its capitals ~1px below the line box's
            middle, so on Windows the word sat lower than the centred `+`. */}
        <span
          className={
            window.desktop.platform === "win32" ? "-translate-y-px" : undefined
          }
        >
          {t("projects.section.chat")}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              label={t("projects.section.project")}
              side="bottom"
              className="size-6"
            >
              <MoreHorizontal />
            </IconButton>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <ProjectMenuItems
            folder={project}
            Item={DropdownMenuItem}
            Separator={DropdownMenuSeparator}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </Header>
  )
}

/**
 * A checkout's heading over its chats: a chevron that folds them, the branch,
 * a `+` for a chat there, and — on a right-click — that checkout's own menu,
 * which is where `Remove worktree…` is. Clicking the branch picks the
 * checkout, so Explorer and the dock's shell move to it the way opening one
 * of its chats does. Folded, it says how many chats it is hiding.
 */
function CheckoutHeading({
  checkout,
  main,
  active,
  open,
  count,
}: {
  checkout: WorkspaceFolder
  main: boolean
  active: boolean
  open: boolean
  count: number
}) {
  // What is checked out there now; a worktree's name is the branch it was
  // made on, for the moment before the branch has been read.
  const branch = useStudio((state) => state.branches[checkout.id] ?? null)
  const label = branch ?? checkout.name
  const Icon = main ? GitBranch : FolderGit2
  const t = useT()

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={cn(
              "group/checkout flex items-center gap-1 rounded-md pt-1.5 pr-1 pb-1 pl-1",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-label={t(
                open ? "projects.section.fold" : "projects.section.unfold",
                { name: label }
              )}
              onClick={() => useProjects.getState().toggleCheckout(checkout.id)}
              className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-accent hover:text-foreground"
            >
              <ChevronRight
                className={cn(
                  "size-3 transition-transform",
                  open && "rotate-90"
                )}
              />
            </button>
            <button
              type="button"
              title={checkout.path}
              onClick={() => {
                useProjects.getState().setActive(checkout.id)
                useShells.getState().showFor(checkout.id)
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-mono text-[0.6875rem] hover:text-foreground"
            >
              <Icon
                className={cn("size-3 shrink-0", active && "text-primary")}
              />
              <span className="truncate">{label}</span>
              {!open && count > 0 && (
                <span className="shrink-0 text-muted-foreground/70 tabular-nums">
                  {count}
                </span>
              )}
            </button>
            <IconButton
              label={t("projects.section.newChatIn", { name: label })}
              side="bottom"
              onClick={() =>
                void useChats.getState().create({ folderId: checkout.id })
              }
              className="size-5 opacity-0 group-hover/checkout:opacity-100 focus-visible:opacity-100"
            >
              <Plus className="size-3" />
            </IconButton>
          </div>
        }
      />
      <ContextMenuContent className="w-52">
        <ProjectMenuItems
          folder={checkout}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** `/Users/me/work/app` as `~/work/app`, which is what fits a header. The home
 * directory is read off the path itself — the renderer cannot ask for it. */
function tildePath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~")
}

/** How many of the `Recent` chats are listed before `View all`. A project
 * with months of chats otherwise pushes the accounts off the column. */
const CHAT_LIMIT = 20

/**
 * The project's chats in their three sections — see `columnSections`. A
 * section with nothing in it draws nothing, and `Recent` loses its label when
 * it is the only section there is, since a label over the whole list names
 * nothing.
 *
 * With worktrees (`checkouts`), `Recent` is split into one group per
 * checkout under its branch (`byCheckout`), each with its own heading even
 * while empty — that heading is where a chat in the worktree is started.
 * `Needs you` and `Running` stay one list across them: what is asking for
 * somebody is read before which branch it is on.
 */
function Sections({
  chats,
  checkouts,
  activeId,
}: {
  chats: Chat[]
  checkouts: WorkspaceFolder[] | null
  activeId: string | null
}) {
  const sending = useChats((state) => state.sending)
  const asks = useChats((state) => state.asks)
  const unread = useChats((state) => state.unread)
  const selectedId = useChats((state) => state.selectedId)
  const shutCheckouts = useProjects((state) => state.shutCheckouts)
  const t = useT()

  if (chats.length === 0 && !checkouts) {
    return (
      <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t("projects.section.noChats")}
      </p>
    )
  }

  const { needsYou, running, recent } = columnSections(
    chats,
    sending,
    asks,
    unread
  )
  const alone = needsYou.length === 0 && running.length === 0

  return (
    <>
      {needsYou.length > 0 && (
        <Section label={t("projects.section.needsYou")} tone="primary">
          <ChatList chats={needsYou} />
        </Section>
      )}
      {running.length > 0 && (
        <Section label={t("projects.section.running")}>
          <ChatList chats={running} />
        </Section>
      )}
      {checkouts ? (
        <Section label={alone ? null : t("projects.section.recent")}>
          {byCheckout(recent, checkouts).map((group, index) => {
            const open = !shutCheckouts.includes(group.folder.id)
            // Folded, the selected chat stays listed, as it does past
            // `View all`: a chat picked from the tab strip with no row lit
            // for it reads as the column having lost it.
            const selected = open
              ? []
              : group.chats.filter((chat) => chat.id === selectedId)
            return (
              <div key={group.folder.id}>
                <CheckoutHeading
                  checkout={group.folder}
                  main={index === 0}
                  active={group.folder.id === activeId}
                  open={open}
                  count={group.chats.length}
                />
                {!open ? (
                  selected.length > 0 && <ChatList chats={selected} />
                ) : group.chats.length > 0 ? (
                  <RecentList chats={group.chats} />
                ) : (
                  <p className="px-3 pb-1 pl-6 text-[0.6875rem] text-muted-foreground/70">
                    {t("projects.section.noChatsHere")}
                  </p>
                )}
              </div>
            )
          })}
        </Section>
      ) : (
        recent.length > 0 && (
          <Section label={alone ? null : t("projects.section.recent")}>
            <RecentList chats={recent} />
          </Section>
        )
      )}
    </>
  )
}

/** Quiet chats, cut at `CHAT_LIMIT` behind a `View all`. */
function RecentList({ chats }: { chats: Chat[] }) {
  const selectedId = useChats((state) => state.selectedId)
  const [showAll, setShowAll] = useState(false)
  const t = useT()

  const hidden = chats.length - CHAT_LIMIT
  const shown = showAll || hidden <= 0 ? chats : chats.slice(0, CHAT_LIMIT)
  // The selected chat stays listed past the cut: a chat picked from the tab
  // strip with no row lit for it reads as the column having lost it.
  const selected = chats.find((chat) => chat.id === selectedId)
  const rows =
    selected && !shown.includes(selected) ? [...shown, selected] : shown

  return (
    <>
      <ChatList chats={rows} />
      {hidden > 0 && (
        <SideRow
          className="rounded-md text-[0.6875rem]"
          onClick={() => setShowAll((all) => !all)}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {showAll
              ? t("projects.section.showLess")
              : t("projects.section.viewAll", { count: chats.length })}
          </span>
        </SideRow>
      )}
    </>
  )
}

function Section({
  label,
  tone,
  children,
}: {
  label: string | null
  tone?: "primary"
  children: ReactNode
}) {
  return (
    <section className="mb-2 last:mb-0">
      {label && (
        <h3
          className={cn(
            "px-3 pt-1.5 pb-1 text-[0.625rem] font-medium tracking-wider uppercase",
            tone === "primary" ? "text-primary" : "text-muted-foreground"
          )}
        >
          {label}
        </h3>
      )}
      {children}
    </section>
  )
}
