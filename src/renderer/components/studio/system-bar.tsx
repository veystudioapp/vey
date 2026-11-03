import { useEffect, useState } from "react"
import {
  Cpu,
  EthernetPort,
  FileDiff,
  GitBranch,
  MemoryStick,
  MessageSquareHeart,
  ShieldQuestion,
  Users,
} from "lucide-react"

import type { GitUpstream, SystemUsage } from "@shared/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { activityOf } from "@/lib/chat/running"
import { useChats } from "@/lib/chat/store"
import { unreadIn } from "@/lib/chat/unread"
import { COMMUNITIES, useFeedbackDialog } from "@/lib/feedback"
import { changeCount, useChanges } from "@/lib/files/changes"
import { useGitStatus } from "@/lib/files/git-status"
import { shownRootOf } from "@/lib/files/roots"
import { useProjects } from "@/lib/projects"
import { useStudio } from "@/lib/store"
import { useSystemUsage } from "@/lib/system/usage"
import { cn } from "@/lib/utils"
import { useUpdateWatch } from "@/lib/updates"
import { useT, type Translate } from "@/lib/i18n"
import { CommunityIcon } from "./community-icon"
import { Mark } from "./mark"
import { UpdatePill } from "./update-pill"
import { PortsDialog } from "./ports-dialog"

/**
 * What the machine has left, along the bottom of the window.
 *
 * The studio's work is the expensive kind — a `claude` turn, a Docker
 * database, a query returning more rows than expected — and the question this
 * answers is the one asked *while* that is happening: is the machine the thing
 * that is slow, and is it this app doing it. Which is why the app's own share
 * sits in the same row, on the same scale, rather than being a thing to go
 * and look up in Activity Monitor: the comparison is the whole point.
 *
 * At the bottom of the workbench rather than in the header, and never in the
 * way: this is a number to glance at, not one to act on, and the header is
 * already where the things you click live.
 *
 * Ahead of the meters, the two things that change while somebody is reading
 * something else: where the checkout stands (`GitLabel`) and what the chats are
 * doing (`ChatsLabel`). Both are a click away from the panel that says more.
 */
export function SystemBar() {
  const usage = useSystemUsage()
  // Before the early return, and here rather than in `UpdatePill`: the pill
  // draws nothing until there is something to install, so it cannot be the
  // thing that keeps the check running.
  useUpdateWatch()
  const t = useT()
  const [ports, setPorts] = useState(false)

  return (
    // No edge or fill of its own: it sits on the canvas under the cards, which
    // is what separates it from them. Two halves, the way an editor's status
    // bar splits them: the project on screen at the left, the machine and the
    // app at the right — so nothing needs a separator but the one divider.
    <footer className="flex h-6 shrink-0 items-stretch gap-0.5 px-2 text-[0.6875rem] text-muted-foreground">
      <GitLabel />
      <ChatsLabel />

      {/* The `ml-auto` is on the group rather than on the figures, so an
          update pill appearing beside them moves nothing else in the row. */}
      <div className="ml-auto flex min-w-0 items-stretch gap-0.5">
        {/* Here rather than on the rail: it is a way out of the app to GitHub,
            not a view of the workspace, and it is wanted rarely — a quiet
            word at the edge of the window is enough to be found by. */}
        <button
          type="button"
          // A shade brighter than the figures beside it, and the icon in the
          // dialog's violet: it is the one thing on this side that is asking
          // to be clicked, and in plain muted text it read as another reading.
          className={cn(ACTION, "group font-medium text-foreground/80")}
          title={t("nav.systemBar.feedbackTitle")}
          onClick={() => useFeedbackDialog.getState().show()}
        >
          <MessageSquareHeart className="size-3 shrink-0 text-violet-500 transition-transform group-hover:scale-110" />
          {t("nav.systemBar.feedback")}
        </button>
        <CommunityLink />
        {/* A tool rather than a way out, but wanted as rarely and at the
            same moment — when something says a port is already in use. */}
        <button
          type="button"
          className={cn(ACTION, "group font-medium text-foreground/80")}
          title={t("nav.systemBar.portsTitle")}
          onClick={() => setPorts(true)}
        >
          <EthernetPort className="size-3 shrink-0 text-sky-500 transition-transform group-hover:scale-110" />
          {t("nav.systemBar.ports")}
        </button>
        {ports && <PortsDialog onClose={() => setPorts(false)} />}
        {usage && <Divider />}
        <span className="flex items-center pr-1">
          <UpdatePill />
        </span>
        {/* Nothing is drawn until the first reading lands — a row of empty
            meters would be a claim that the machine is idle, which is not
            what "not yet measured" means. The left half does not wait on it. */}
        {usage && <MachineUsage usage={usage} />}
      </div>
    </footer>
  )
}

/** One slot of the bar, and a `button` only when it does something. A
 * clickable one says so by brightening its text alone: a filled cell on hover
 * was a block sitting on the canvas the bar is drawn on, heavier than
 * anything it was labelling. */
const ITEM =
  "flex min-w-0 shrink-0 items-center gap-1.5 rounded-sm px-1.5 tabular-nums"
const ACTION = cn(
  ITEM,
  "transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
)

/**
 * The way out to where the users talk: a menu of the communities, each under
 * its own mark. A menu even while there is only one, so the word in the bar
 * names no platform and stays put as the others arrive.
 */
function CommunityLink() {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(ACTION, "group font-medium text-foreground/80")}
        title={t("nav.systemBar.communityTitle")}
      >
        <Users className="size-3 shrink-0 text-emerald-500 transition-transform group-hover:scale-110" />
        {t("nav.systemBar.community")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-44">
        {COMMUNITIES.map((community) => (
          <DropdownMenuItem
            key={community.kind}
            // Out to the browser — `setWindowOpenHandler` in `main.ts`.
            render={<a href={community.url} target="_blank" rel="noreferrer" />}
          >
            <CommunityIcon kind={community.kind} className="size-3.5" />
            {community.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 my-1.5 w-px shrink-0 bg-border" />
}

/**
 * The figures alone, without the `Meter` beside them: at this size a bar
 * repeated what the number beside it said, at twice its width. What the bar
 * did that the number does not is warn, so the number takes its colour — the
 * same thresholds as `Meter`, so amber means one thing wherever it is seen.
 */
function MachineUsage({ usage }: { usage: SystemUsage }) {
  const t = useT()
  return (
    <>
      <span className={ITEM} title={cpuTitle(t, usage)}>
        <Cpu className="size-3 shrink-0" />
        {/* A fixed width, so the row does not shift as 9% becomes 10%. */}
        <span className={cn("w-7", tone(usage.cpuPercent))}>
          {Math.round(usage.cpuPercent)}%
        </span>
      </span>

      <span className={cn(ITEM, "shrink")} title={memoryTitle(t, usage)}>
        <MemoryStick className="size-3 shrink-0" />
        {/* The free figure, not the used one: "how much is left" is the
            question a glance at the bottom of the window is asking. */}
        <span className={cn("truncate", tone(memoryUsedPercent(usage)))}>
          {t("nav.systemBar.memoryFree", {
            size: bytes(usage.memoryAvailable),
          })}
        </span>
      </span>

      {/* The app's share after a divider: it is a part of what the machine's
          two meters show, measured on the same scale, and the divider is
          what keeps "this app" from reading as a third resource. */}
      <Divider />
      <span className={ITEM} title={appTitle(t, usage)}>
        <Mark className="h-2.5 w-auto shrink-0" />
        <span className="sr-only">Vey</span>
        <span>{formatPercent(usage.appCpuPercent)}</span>
        <span className="text-muted-foreground/60">
          {bytes(usage.appMemory)}
        </span>
      </span>
    </>
  )
}

/**
 * The branch the project on screen has checked out, where an editor's status
 * bar keeps it. It was the second half of a `project › branch` crumb in the
 * title bar, which made git state read as a place one level below the project.
 * Resolved through `shownRootOf`, as the Explorer is, so the two always name
 * the same project.
 *
 * With where it stands — unpushed, behind, files changed — because those are
 * the questions a branch name is glanced at to answer, and the Explorer that
 * answers them may be shut to its rail. A click opens it on `Changes`.
 */
function GitLabel() {
  const folders = useStudio((state) => state.folders)
  const branches = useStudio((state) => state.branches)
  const activeFolderId = useProjects((state) => state.activeFolderId)
  const t = useT()

  const shown = shownRootOf(folders, activeFolderId)
  const rootId = shown?.id ?? null
  const folderId = shown?.folderId ?? null
  const branch = folderId ? branches[folderId] : undefined

  // Kept current by the Explorer's own `useWatchChanges`: the panel is hidden
  // rather than unmounted when shut, so it is always watching this root.
  const changes = useChanges((state) =>
    rootId ? state.byRoot[rootId] : undefined
  )
  const changed = changeCount(changes)

  // Re-read on the same signal the `Commits` list re-reads on — the status
  // changing identity is a commit, a checkout or a fetch having landed.
  const status = useGitStatus((state) =>
    rootId ? state.byRoot[rootId] : undefined
  )
  const [upstream, setUpstream] = useState<GitUpstream | null>(null)
  useEffect(() => {
    if (!folderId || !branch) return
    let current = true
    void window.desktop
      .gitUpstream(folderId)
      .catch(() => null)
      .then((answer) => {
        if (current) setUpstream(answer)
      })
    return () => {
      current = false
    }
  }, [folderId, branch, status])

  if (!shown || !branch) return null

  const ahead = upstream?.aheadCount ?? 0
  const behind = upstream?.behind ?? 0

  function openChanges() {
    const studio = useStudio.getState()
    if (!studio.sidebar) studio.toggleSidebar()
    studio.setExplorerTab("git")
    studio.setGitView("changes")
  }

  return (
    <button
      type="button"
      className={cn(ACTION, "shrink")}
      title={gitTitle(t, branch, shown.path, upstream, changed)}
      onClick={openChanges}
    >
      <GitBranch className="size-3 shrink-0" />
      <span className="truncate font-mono">{branch}</span>
      {(ahead > 0 || behind > 0) && (
        <span className="flex shrink-0 items-center gap-1">
          {ahead > 0 && <span>↑{ahead}</span>}
          {behind > 0 && <span>↓{behind}</span>}
        </span>
      )}
      {changed > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          <FileDiff className="size-3" />
          {changed}
        </span>
      )}
    </button>
  )
}

function gitTitle(
  t: Translate,
  branch: string,
  path: string,
  upstream: GitUpstream | null,
  changed: number
): string {
  const lines = [branch, path, ""]
  if (upstream?.name) {
    lines.push(
      t("nav.systemBar.gitUpstream", {
        ahead: upstream.aheadCount,
        behind: upstream.behind,
        name: upstream.name,
      })
    )
  } else if (upstream) {
    lines.push(t("nav.systemBar.gitNoUpstream", { count: upstream.aheadCount }))
  }
  lines.push(
    t("nav.systemBar.filesChanged", { count: changed }),
    "",
    t("nav.systemBar.openChanges")
  )
  return lines.join("\n")
}

/**
 * What the chats across the whole workspace are doing — working, stopped on a
 * question, answered and not yet read.
 *
 * Every chat rather than the active project's, for the reason the rail's dot
 * gives: the one that matters is usually the one in another project, and with
 * the projects column shut nothing else in the window says so. Drawn only when
 * there is something to say, since three zeros is a row of noise.
 *
 * A click goes to the chat most in want of somebody — a question before an
 * answer, an answer before a spinner — and a second click to the next of that
 * kind, so a handful of finished chats can be walked through from here.
 */
function ChatsLabel() {
  const chats = useChats((state) => state.chats)
  const sending = useChats((state) => state.sending)
  const asks = useChats((state) => state.asks)
  const unread = useChats((state) => state.unread)
  const selectedId = useChats((state) => state.selectedId)
  const t = useT()

  const { working, waiting } = activityOf(chats, sending, asks)
  const unseen = unreadIn(chats, unread)
  if (working + waiting + unseen === 0) return null

  function reveal() {
    const ids = chats.map((chat) => chat.id)
    const kinds = [
      ids.filter((id) => asks[id] !== undefined),
      ids.filter((id) => unread[id] === true),
      ids.filter((id) => sending.includes(id) && asks[id] === undefined),
    ]
    const targets = kinds.find((kind) => kind.length > 0)
    if (!targets) return
    const at = selectedId ? targets.indexOf(selectedId) : -1
    const next = targets[(at + 1) % targets.length]
    if (next) useChats.getState().select(next)
  }

  const title = [
    waiting > 0 && t("nav.systemBar.chatsWaiting", { count: waiting }),
    unseen > 0 && t("nav.systemBar.chatsUnread", { count: unseen }),
    working > 0 && t("nav.systemBar.chatsWorking", { count: working }),
    "",
    t("nav.systemBar.chatsNext"),
  ]
    .filter((line) => line !== false)
    .join("\n")

  return (
    <button
      type="button"
      className={cn(ACTION, "gap-2.5")}
      title={title}
      onClick={reveal}
    >
      {waiting > 0 && (
        <span className="flex items-center gap-1 text-primary">
          <ShieldQuestion className="size-3 animate-pulse" />
          {waiting}
        </span>
      )}
      {unseen > 0 && (
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {unseen}
        </span>
      )}
      {working > 0 && (
        <span className="flex items-center gap-1">
          <Spinner className="size-3" />
          {working}
        </span>
      )}
    </button>
  )
}

function tone(percent: number): string | undefined {
  if (percent >= 90) return "text-destructive"
  if (percent >= 70) return "text-warning"
  return undefined
}

function memoryUsedPercent(usage: SystemUsage): number {
  if (usage.memoryTotal <= 0) return 0
  const used = usage.memoryTotal - usage.memoryAvailable
  return Math.max(0, Math.min(100, (used / usage.memoryTotal) * 100))
}

function cpuTitle(t: Translate, usage: SystemUsage): string {
  return [
    t("nav.systemBar.cpuUse", {
      used: Math.round(usage.cpuPercent),
      idle: Math.round(100 - usage.cpuPercent),
    }),
    t("nav.systemBar.cpuCores", { count: usage.cores }),
  ].join("\n")
}

function memoryTitle(t: Translate, usage: SystemUsage): string {
  const used = usage.memoryTotal - usage.memoryAvailable
  return [
    t("nav.systemBar.memoryUse", {
      used: bytes(used),
      total: bytes(usage.memoryTotal),
    }),
    t("nav.systemBar.memoryAvailable", { size: bytes(usage.memoryAvailable) }),
    "",
    // Worth saying, because it is why this figure is kinder than the one a
    // naive "free memory" reading would give — and than the one macOS itself
    // shows under "Memory Used".
    t("nav.systemBar.memoryNote"),
  ].join("\n")
}

function appTitle(t: Translate, usage: SystemUsage): string {
  return [
    t("nav.systemBar.appProcesses", { count: usage.appProcesses }),
    t("nav.systemBar.appCpu", {
      machine: formatPercent(usage.appCpuPercent),
      core: formatPercent(usage.appCoreCpuPercent),
    }),
    t("nav.systemBar.appMemory", { size: bytes(usage.appMemory) }),
    "",
    // The distinction that stops this reading as a bug: an agent chewing
    // through a turn is the user's own `claude`, and it costs what it costs
    // whether it was started from here or from a terminal.
    t("nav.systemBar.appNote"),
  ].join("\n")
}

/** One decimal below 10%, none above — the difference between 34% and 34.2%
 * is not something anybody reads a status bar for, but 0.4% and 0% are not
 * the same statement about an idle app. */
function formatPercent(percent: number): string {
  return percent < 10 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`
}

/** Bytes at the width a status bar has for them: GB once it is into them,
 * MB below, and never more than three significant figures. */
function bytes(value: number): string {
  const mb = value / 1024 ** 2
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  return `${Math.round(mb)} MB`
}
