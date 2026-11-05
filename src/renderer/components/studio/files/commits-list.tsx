import { useEffect, useState } from "react"
import {
  ArrowUp,
  Copy,
  ExternalLink,
  GitBranch,
  GitGraph,
  MessageSquarePlus,
  Search,
  X,
} from "lucide-react"
import { create } from "zustand"

import type {
  GitCommit,
  GitCommitFile,
  GitLogScope,
  GitUpstream,
} from "@shared/api"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useChanges } from "@/lib/files/changes"
import { askAboutLoggedCommit, commitUrl } from "@/lib/files/git-blame"
import { useGitGraph } from "@/lib/files/git-graph"
import { GIT_LETTERS, GIT_TONES, useGitStatus } from "@/lib/files/git-status"
import type { FileRoot } from "@/lib/files/roots"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useComposerBus } from "@/lib/chat/composer-bus"
import { useShells } from "@/lib/shell/store"
import { since } from "@/lib/chat/since"
import { FileIcon } from "../file-icon"
import { RefChips } from "./ref-chip"
import { SideRow } from "../side-row"

/** How many commits the list starts with, and how many each `Show more` adds. */
const PAGE = 20
/** What one `git:log` call is allowed to answer with — `MAX_LOG_PAGE` in
 * `main/ipc.ts`. A list paged past it is re-read in several calls. */
const MAX_CALL = 1000
/** How long the filter waits for typing to stop. A filter is a walk of the log
 * in main, and one per keystroke is a walk per letter of a word. */
const FILTER_DELAY_MS = 250

/** Whether the list is every branch or the checked-out one — for the session
 * and for every project, so switching project does not switch it back. */
const useBranchScope = create<{ all: boolean; toggle: () => void }>()(
  (set) => ({
    all: false,
    toggle: () => set((state) => ({ all: !state.all })),
  })
)

/**
 * The first `count` commits — of the matches, under a `query` — and whether
 * there is one past them.
 *
 * One more than asked for, which is how the list knows whether to offer
 * `Show more` without a count of the whole history — a `rev-list --count` on a
 * large repository is the full walk this is paging to avoid.
 */
export async function readCommits(
  folderId: string,
  count: number,
  query: string,
  scope: GitLogScope
): Promise<{ commits: GitCommit[]; more: boolean }> {
  const wanted = count + 1
  const commits: GitCommit[] = []
  while (commits.length < wanted) {
    const limit = Math.min(MAX_CALL, wanted - commits.length)
    const page = await window.desktop.gitLog(
      folderId,
      limit,
      commits.length,
      query,
      scope
    )
    commits.push(...page)
    if (page.length < limit) break
  }
  return { commits: commits.slice(0, count), more: commits.length > count }
}

/**
 * The `Git` tab's `Commits` view: the branch the project has checked out — or
 * every branch, with `All branches` — newest first, `PAGE` at a time,
 * filterable, marked where it is ahead of its remote, and with each commit's
 * files a click away. **No graph**: that is the `Git Graph` tab, opened from
 * the button beside the filter (`docs/design.md` § The commit graph).
 *
 * What it grew is what the question it answers — "what has this branch had
 * done to it lately" — kept running into: **which
 * of these are pushed** (an arrow on the ones that are not, and `↑2 ↓1` over
 * the list), **what did that one change** (a commit opens into its files, and a
 * file opens in the checkout's one diff tab, the same tab `Changes` uses), and
 * **which one was it** (the filter). The right-click menu is the blame card's
 * — copy, ask in chat, open on the forge — for a commit found by date rather
 * than by line. `docs/design.md` § Commits has the argument.
 *
 * Re-read off the git status rather than on a timer of its own: a commit, a
 * pull or a checkout all move the working tree's status, which is already
 * watched (`useGitStatus`), so the list follows them without a second set of
 * watchers over the same events. **The re-read covers everything shown**, not
 * the first page: a list somebody has paged to sixty would otherwise snap back
 * to twenty under them every time a turn committed.
 *
 * Keyed by folder where it is drawn, so another project's list opens at its
 * first page with nothing opened and no filter.
 */
export function CommitsList({ root }: { root: FileRoot }) {
  const t = useT()
  const [typed, setTyped] = useState("")
  const [query, setQuery] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), FILTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const [read, setRead] = useState<{
    /** What was asked for, so a read still answering the last question is
     * told apart from one answering this one — see `loading`. */
    query: string
    all: boolean
    count: number
    commits: GitCommit[]
    more: boolean
  } | null>(null)
  const all = useBranchScope((state) => state.all)
  /** How many are asked for — per filter and per scope, so a new word or a
   * flip of `All branches` starts at the first page of its own list. */
  const [paged, setPaged] = useState({ query: "", all: false, count: PAGE })
  const count = paged.query === query && paged.all === all ? paged.count : PAGE

  const status = useGitStatus((state) => state.byRoot[root.id])
  useEffect(() => {
    let current = true
    void readCommits(
      root.folderId,
      count,
      query,
      all ? { kind: "all", remotes: true } : { kind: "head" }
    )
      .catch(() => ({ commits: [], more: false }))
      .then((answer) => {
        if (current) setRead({ query, all, count, ...answer })
      })
    return () => {
      current = false
    }
  }, [root.folderId, status, count, query, all])

  const [upstream, setUpstream] = useState<GitUpstream | null>(null)
  /** Bumped by a push from the button, which moves the remote-tracking ref
   * and nothing in the working tree — so not a status the list would re-read
   * on. */
  const [pushes, setPushes] = useState(0)
  useEffect(() => {
    let current = true
    void window.desktop
      .gitUpstream(root.folderId)
      .catch(() => null)
      .then((answer) => {
        if (current) setUpstream(answer)
      })
    return () => {
      current = false
    }
  }, [root.folderId, status, pushes])

  /** The commits opened into their files, and the files read for them — a
   * commit's files never change, so a read is kept for as long as the list. */
  const [opened, setOpened] = useState<string[]>([])
  const [files, setFiles] = useState<Record<string, GitCommitFile[]>>({})
  function toggle(hash: string) {
    if (opened.includes(hash)) {
      setOpened((state) => state.filter((entry) => entry !== hash))
      return
    }
    setOpened((state) => [...state, hash])
    if (files[hash]) return
    void window.desktop
      .gitCommitFiles(root.folderId, hash)
      .catch(() => [])
      .then((answer) => setFiles((state) => ({ ...state, [hash]: answer })))
  }

  /** Which commit the menu is about — one trigger over the list rather than
   * one per row, the shape the `Changes` list's menu has. */
  const [target, setTarget] = useState<GitCommit | null>(null)

  const unpushed = new Set(upstream?.ahead)
  // A new filter keeps the last list on screen, dimmed, until its own answer
  // lands, and `Show more` says so on its button; the re-reads a commit causes
  // ask for what is already shown, so they never read as loading.
  const stale = read !== null && (read.query !== query || read.all !== all)
  const loading = read !== null && !stale && read.count !== count

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1.5 border-b bg-background p-2">
        <div className="flex items-center gap-1.5">
          <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-1 focus-within:ring-ring">
            <Search
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && typed) {
                  event.preventDefault()
                  setTyped("")
                }
              }}
              placeholder={t("files.commits.filterPlaceholder")}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {typed && (
              <button
                type="button"
                aria-label={t("files.commits.clearFilter")}
                onClick={() => setTyped("")}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <BranchScopeToggle />
          <button
            type="button"
            title={t("files.commits.openGraph")}
            aria-label={t("files.commits.openGraph")}
            onClick={() => useGitGraph.getState().open(root.id)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <GitGraph aria-hidden className="size-3.5" />
          </button>
        </div>
        <UpstreamLine
          upstream={upstream}
          folderId={root.folderId}
          onPushed={() => setPushes((count) => count + 1)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-3">
        {read === null ? (
          <Note>{t("files.reading")}</Note>
        ) : read.commits.length === 0 ? (
          <Note>
            {read.query
              ? t("files.commits.noMatch", { query: read.query })
              : t("files.commits.noCommits")}
          </Note>
        ) : (
          <div className={cn("transition-opacity", stale && "opacity-60")}>
            {/* The trigger is the rows and nothing under them, so a menu only
              ever opens on a commit — each row names itself on the way past. */}
            <ContextMenu>
              <ContextMenuTrigger render={<ul className="py-1" />}>
                {read.commits.map((commit) => (
                  <CommitRow
                    key={commit.hash}
                    commit={commit}
                    root={root}
                    open={opened.includes(commit.hash)}
                    files={files[commit.hash]}
                    unpushed={unpushed.has(commit.hash)}
                    upstreamName={upstream?.name ?? null}
                    onToggle={() => toggle(commit.hash)}
                    onMenu={() => setTarget(commit)}
                  />
                ))}
              </ContextMenuTrigger>
              <CommitMenu commit={target} webUrl={upstream?.webUrl ?? null} />
            </ContextMenu>

            {/* Only while there is something past the last row — the extra
                commit `readCommits` asked for is what says so — so the list
                ends on its first commit with nothing under it. */}
            {read.more && !stale && (
              <button
                type="button"
                disabled={loading}
                onClick={() => setPaged({ query, all, count: count + PAGE })}
                className="mx-3 mt-1 flex h-7 w-[calc(100%-1.5rem)] items-center justify-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-60"
              >
                {loading
                  ? t("files.reading")
                  : t("files.commits.showMore", { count: PAGE })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** `All branches`, beside the filter: lit while the list is every branch. */
function BranchScopeToggle() {
  const t = useT()
  const all = useBranchScope((state) => state.all)
  return (
    <button
      type="button"
      aria-pressed={all}
      title={
        all ? t("files.commits.currentBranch") : t("files.commits.allBranches")
      }
      onClick={() => useBranchScope.getState().toggle()}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        all
          ? "border-primary/40 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      <GitBranch aria-hidden className="size-3.5" />
    </button>
  )
}

/**
 * Where the branch stands against its remote, in one line over the list, and
 * the push for whatever is ahead of it. Nothing at all for a repository with no
 * remote, which has nowhere to stand.
 */
function UpstreamLine({
  upstream,
  folderId,
  onPushed,
}: {
  upstream: GitUpstream | null
  folderId: string
  onPushed: () => void
}) {
  const t = useT()
  const [pushing, setPushing] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  if (!upstream) return null
  const { name, aheadCount, behind } = upstream

  /**
   * In the background first, and in a dock shell only when that could not
   * finish without somebody typing — a key's passphrase that no agent holds, a
   * host key to accept. `push` in `main/git.ts` never prompts, so that case
   * comes back as `auth` rather than as a push left hanging; the shell then
   * runs the same command, where ssh can ask.
   */
  async function onPush() {
    setPushing(true)
    setSaid(null)
    const result = await window.desktop.gitPush(folderId).catch(
      (error: unknown) =>
        ({
          ok: false,
          reason: "failed",
          command: "git push",
          message: error instanceof Error ? error.message : String(error),
        }) as const
    )
    setPushing(false)
    if (result.ok) {
      setSaid({
        ok: true,
        text: name
          ? t("files.commits.pushedTo", { name })
          : t("files.commits.pushed"),
      })
      onPushed()
    } else if (result.reason === "auth") {
      useShells.getState().run(folderId, result.command)
    } else {
      setSaid({
        ok: false,
        text: result.message || t("files.commits.pushFailed"),
      })
    }
  }

  const button = aheadCount > 0 && (
    <button
      type="button"
      disabled={pushing}
      title={
        name
          ? t("files.commits.pushTitle", { count: aheadCount, name })
          : t("files.commits.pushNewBranch")
      }
      onClick={() => void onPush()}
      className="ml-auto flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[0.65rem] text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
    >
      <ArrowUp aria-hidden className="size-3" />
      {pushing ? t("files.commits.pushing") : t("files.commits.push")}
    </button>
  )

  const line = !name ? (
    aheadCount === 0 ? null : (
      <p className="flex items-center gap-1.5 px-0.5 text-[0.65rem] text-muted-foreground">
        <span className="min-w-0 truncate">
          {t("files.commits.noUpstream")}{" "}
          <span className="text-primary">
            {t("files.commits.notOnRemote", { count: aheadCount })}
          </span>
        </span>
        {button}
      </p>
    )
  ) : (
    <p className="flex items-center gap-1.5 px-0.5 text-[0.65rem] text-muted-foreground">
      <span className="min-w-0 truncate font-mono">{name}</span>
      {aheadCount === 0 && behind === 0 ? (
        <span>{t("files.commits.upToDate")}</span>
      ) : (
        <span className="flex shrink-0 gap-1.5 tabular-nums">
          {aheadCount > 0 && (
            <span
              className="text-primary"
              title={t("files.commits.aheadTitle", { count: aheadCount, name })}
            >
              ↑{aheadCount}
            </span>
          )}
          {behind > 0 && (
            <span
              title={t("files.commits.behindTitle", { count: behind, name })}
            >
              ↓{behind}
            </span>
          )}
        </span>
      )}
      {button}
    </p>
  )

  return (
    <>
      {line}
      {/* Under the line rather than in a toast: a rejected push's reason — fetch first, a protected
          branch — is git's own words and worth reading whole. */}
      {said && (
        <p
          className={cn(
            "flex items-start gap-1 px-0.5 text-[0.65rem]",
            said.ok ? "text-muted-foreground" : "text-destructive"
          )}
        >
          <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
            {said.text}
          </span>
          <button
            type="button"
            aria-label={t("files.dismiss")}
            onClick={() => setSaid(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </p>
      )}
    </>
  )
}

function CommitRow({
  commit,
  root,
  open,
  files,
  unpushed,
  upstreamName,
  onToggle,
  onMenu,
}: {
  commit: GitCommit
  root: FileRoot
  open: boolean
  files: GitCommitFile[] | undefined
  unpushed: boolean
  upstreamName: string | null
  onToggle: () => void
  onMenu: () => void
}) {
  const t = useT()
  const head = commit.refs.some((ref) => ref.head)
  return (
    <li>
      {/* The `Git Graph` tab's row folded into a sidebar's width: its
          description and date on one line, its author and hash on the next,
          the same chips and the same marks, so a commit reads the same in
          either. */}
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={onMenu}
        aria-expanded={open}
        title={`${commit.subject}\n\n${commit.hash}\n${commit.author} — ${new Date(commit.date).toLocaleString()}`}
        className={cn(
          "flex w-full flex-col gap-0.5 px-3 py-1.5 text-left",
          open ? "bg-accent/40" : "hover:bg-accent/50"
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5 text-xs">
          <RefChips refs={commit.refs} max={2} />
          <span
            className={cn("min-w-0 flex-1 truncate", head && "font-medium")}
          >
            {commit.subject}
          </span>
          <span className="shrink-0 text-[0.65rem] text-muted-foreground tabular-nums">
            {since(commit.date)}
          </span>
        </span>
        <span className="flex w-full min-w-0 items-center gap-1.5 text-[0.65rem] text-muted-foreground">
          <span className="min-w-0 truncate">{commit.author}</span>
          {unpushed && (
            <ArrowUp
              aria-label={
                upstreamName
                  ? t("files.commits.notPushedTo", { name: upstreamName })
                  : t("files.commits.notOnAnyRemote")
              }
              className="size-3 shrink-0 text-primary"
            />
          )}
          <span className="ml-auto shrink-0 font-mono">{commit.shortHash}</span>
        </span>
      </button>

      {open && (
        <div className="border-y bg-muted/20 py-1">
          <CommitFiles commit={commit} root={root} files={files} />
        </div>
      )}
    </li>
  )
}

/** A commit's files, under it — each opening in the checkout's diff tab. */
export function CommitFiles({
  commit,
  root,
  files,
}: {
  commit: GitCommit
  root: FileRoot
  files: GitCommitFile[] | undefined
}) {
  const selected = useChanges((state) => state.commitFile[root.id] ?? null)
  const t = useT()

  if (files === undefined) return <Note indent>{t("files.reading")}</Note>
  if (files.length === 0) {
    return <Note indent>{t("files.commits.noFiles")}</Note>
  }

  return (
    <ul className="pb-1">
      {files.map((file) => {
        const slash = file.path.lastIndexOf("/")
        const name = file.path.slice(slash + 1)
        const directory = slash > 0 ? file.path.slice(0, slash) : ""
        return (
          <li key={file.path}>
            <SideRow
              indent={1.5}
              active={
                selected?.hash === commit.hash && selected.path === file.path
              }
              title={file.from ? `${file.from} → ${file.path}` : file.path}
              onClick={() =>
                useChanges.getState().openCommitFile(root.id, {
                  hash: commit.hash,
                  shortHash: commit.shortHash,
                  subject: commit.subject,
                  path: file.path,
                  ...(file.from === undefined ? {} : { from: file.from }),
                })
              }
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left">
                <FileIcon filePath={file.path} className="size-3.5" />
                <span
                  className={cn(
                    "shrink-0 text-xs leading-normal",
                    GIT_TONES[file.state]
                  )}
                >
                  {name}
                </span>
                <span className="min-w-0 truncate text-[0.65rem] text-muted-foreground">
                  {directory}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex shrink-0 items-center gap-1.5",
                  GIT_TONES[file.state]
                )}
              >
                <span className="font-mono text-[0.65rem]">
                  {file.from ? "R" : GIT_LETTERS[file.state]}
                </span>
                {file.added !== null && file.removed !== null && (
                  <span className="font-mono text-[0.65rem] tabular-nums">
                    <span className={GIT_TONES.added}>+{file.added}</span>{" "}
                    <span className={GIT_TONES.deleted}>−{file.removed}</span>
                  </span>
                )}
              </span>
            </SideRow>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The blame card's actions, for a commit picked off the list: copy it, ask a
 * chat about it, open it on the forge — absent rather than greyed where
 * `origin` is not one `webUrlOf` can address.
 */
export function CommitMenu({
  commit,
  webUrl,
}: {
  commit: GitCommit | null
  webUrl: string | null
}) {
  const t = useT()
  if (!commit) return null

  const forge = webUrl && new URL(webUrl).hostname.replace(/\.(com|org)$/, "")

  return (
    <ContextMenuContent className="w-56">
      <ContextMenuItem
        onClick={() => void navigator.clipboard.writeText(commit.hash)}
      >
        <Copy />
        {t("files.commit.copySha")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => void navigator.clipboard.writeText(commit.subject)}
      >
        <Copy />
        {t("files.commit.copyMessage")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() =>
          // Into the draft, never sent — the same bargain the blame card's
          // `Ask in chat` makes.
          useComposerBus
            .getState()
            .deliver({ text: askAboutLoggedCommit(commit) })
        }
      >
        <MessageSquarePlus />
        {t("files.commit.askInChat")}
      </ContextMenuItem>
      {webUrl && forge && (
        <ContextMenuItem
          onClick={() =>
            // `window.open`, which `setWindowOpenHandler` in `main.ts` sends to
            // the system browser.
            window.open(commitUrl(webUrl, commit.hash), "_blank", "noreferrer")
          }
        >
          <ExternalLink />
          {t("files.commits.openOn", {
            forge: forge[0]!.toUpperCase() + forge.slice(1),
          })}
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  )
}

function Note({
  children,
  indent = false,
}: {
  children: string
  indent?: boolean
}) {
  return (
    <p
      className={cn(
        "py-2 pr-3 text-xs text-muted-foreground",
        indent ? "pl-7" : "pl-3"
      )}
    >
      {children}
    </p>
  )
}
