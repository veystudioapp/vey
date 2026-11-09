import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUp,
  Cloud,
  GitBranch,
  GitGraph,
  RefreshCw,
  Search,
  X,
} from "lucide-react"

import type {
  GitChange,
  GitCommit,
  GitCommitFile,
  GitCompareAgainst,
  GitLogScope,
  GitUpstream,
  GitWriteResult,
} from "@shared/api"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import {
  PICK_ALL,
  PICK_HEAD,
  picksOf,
  scopeOfPicks,
  shortRef,
} from "@/lib/files/branch-pick"
import { changeCount, splitChanges, useChanges } from "@/lib/files/changes"
import { commitGraph, graphWidth } from "@/lib/files/commit-graph"
import { ALL_BRANCHES, useGitGraph } from "@/lib/files/git-graph"
import {
  graphColumnsOf,
  moveBorder,
  type GraphBorder,
  type GraphColumns,
} from "@/lib/files/graph-columns"
import { GIT_LETTERS, GIT_TONES, useGitStatus } from "@/lib/files/git-status"
import { nameOf, parentOf, relativeTo } from "@/lib/files/paths"
import { fileRootsOf, type FileRoot } from "@/lib/files/roots"
import { useFiles } from "@/lib/files/store"
import { useT } from "@/lib/i18n"
import { useSettings } from "@/lib/settings"
import { useStudio } from "@/lib/store"
import { cn } from "@/lib/utils"
import { FileIcon } from "../file-icon"
import { SECTION_ACCENT } from "../section-marks"
import { SideRow } from "../side-row"
import { CommitGraphCanvas, GRAPH_ROW, graphPixels } from "./commit-graph"
import { CommitFiles, readCommits } from "./commits-list"
import {
  CompareWithDialog,
  CreateRefDialog,
  GraphCommitMenu,
  type GraphDialog,
  type GraphMenuActions,
} from "./graph-commit-menu"
import { RefChips } from "./ref-chip"

/** How many commits the tab starts with, and how many `Load more` adds. More
 * than the Explorer's twenty: this is a screen of history, not a sidebar. */
const PAGE = 100
/** The tab has the room the Explorer does not. */
const MAX_LANES = 24
/** Narrower than this and the column's own heading does not fit — `Gra…`
 * at the larger font sizes, under 56. A dragged graph column may go below it;
 * this is the width it opens at. */
const MIN_GRAPH_PX = 72
const FILTER_DELAY_MS = 250

/** Description, date, author, commit — the columns after the graph's, which
 * is each row's left padding, under the one drawing of the graph. */
function restOf(columns: GraphColumns): string {
  return `minmax(0,1fr) ${columns.date}px ${columns.author}px ${columns.commit}px`
}
/** The working tree's row, fed to the graph as a commit whose one parent is
 * `HEAD` — so the lanes route it like any other tip. */
const UNCOMMITTED = "\0uncommitted"

/**
 * The `Git Graph` tab: a project's history as a table — the graph, the
 * description with the refs pointing at each commit, the date, the author and
 * the hash, one line each — over every branch, or one picked from the list.
 *
 * The Explorer's `Commits` view is the same history in a sidebar's width; this
 * is the version with room for the branches beside each other, opened from it.
 * Read-only like that view: a commit opens into its files, and a file into the
 * checkout's diff tab. `docs/design.md` § The Git Graph tab.
 */
export function GitGraphPane() {
  const t = useT()
  const openIds = useGitGraph((state) => state.openIds)
  const selectedId = useGitGraph((state) => state.selectedId)
  const rootId = selectedId && openIds.includes(selectedId) ? selectedId : null
  const folders = useStudio((state) => state.folders)
  const root = fileRootsOf(folders).find((candidate) => candidate.id === rootId)

  if (!root) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon" className={SECTION_ACCENT.files}>
            <GitGraph />
          </EmptyMedia>
          <EmptyTitle>{t("files.graph.goneTitle")}</EmptyTitle>
          <EmptyDescription>{t("files.graph.goneDetail")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // Keyed, so another project's tab opens at its first page with nothing
  // expanded and no filter.
  return <GitGraphView key={root.id} root={root} />
}

/** The scope as one string, for the branch list's value and for effects. */
function scopeKey(scope: GitLogScope): string {
  if (scope.kind === "branches") return scope.refs.join("\n")
  return scope.kind
}

function GitGraphView({ root }: { root: FileRoot }) {
  const t = useT()
  const scope = useGitGraph((state) => state.scope[root.id] ?? ALL_BRANCHES)
  const key = scopeKey(scope)
  const remotes = scope.kind === "all" && scope.remotes

  const [typed, setTyped] = useState("")
  const [query, setQuery] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), FILTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [typed])

  /** Per filter and branch, so either changing starts at the first page. */
  const [paged, setPaged] = useState({ key: "", count: PAGE })
  const pageKey = `${key}\n${remotes}\n${query}`
  const count = paged.key === pageKey ? paged.count : PAGE

  /** Bumped by Refresh — a fetch in another app moves remote refs without
   * touching anything `useGitStatus` watches. */
  const [refreshes, setRefreshes] = useState(0)
  const status = useGitStatus((state) => state.byRoot[root.id])

  const [read, setRead] = useState<Read | null>(null)
  useEffect(() => {
    let current = true
    void readCommits(root.folderId, count, query, scope)
      .catch(() => ({ commits: [], more: false }))
      .then((answer) => {
        if (!current) return
        const next: Read = {
          pageKey,
          count,
          ...answer,
          signature: signatureOf(answer.commits, answer.more),
        }
        // The same history again — a status change that was a file saved,
        // not a commit — keeps the answer already drawn, so nothing below
        // re-renders. During an agent's turn that is most of the re-reads.
        setRead((previous) =>
          previous &&
          previous.pageKey === next.pageKey &&
          previous.count === next.count &&
          previous.signature === next.signature
            ? previous
            : next
        )
      })
    return () => {
      current = false
    }
    // `scope` is the store's own object, replaced only by `setScope`, so its
    // identity changes exactly when its value does.
  }, [root.folderId, status, count, query, scope, pageKey, refreshes])

  const [branches, setBranches] = useState<{
    local: string[]
    remote: string[]
  }>({ local: [], remote: [] })
  const [upstream, setUpstream] = useState<GitUpstream | null>(null)
  useEffect(() => {
    let current = true
    void window.desktop
      .worktreeBranches(root.folderId)
      .catch(() => ({ local: [], remote: [] }))
      .then((answer) => {
        if (!current) return
        setBranches((previous) =>
          sameList(previous.local, answer.local) &&
          sameList(previous.remote, answer.remote)
            ? previous
            : answer
        )
      })
    void window.desktop
      .gitUpstream(root.folderId)
      .catch(() => null)
      .then((answer) => {
        if (!current) return
        setUpstream((previous) =>
          JSON.stringify(previous) === JSON.stringify(answer)
            ? previous
            : answer
        )
      })
    return () => {
      current = false
    }
  }, [root.folderId, status, refreshes])

  // Kept current by the Explorer's own watch on this root, which is the root
  // the tab is in scope for.
  const changed = changeCount(useChanges((state) => state.byRoot[root.id]))

  /**
   * The graph, with the working tree's row on top while there is anything
   * uncommitted and `HEAD` is in the list to hang it from. None under a
   * filter — a gap between two matches is not a parent.
   */
  const working = changed > 0 && !query
  const graph = useMemo(() => {
    if (!read || query) return null
    const head = read.commits.find((commit) =>
      commit.refs.some((ref) => ref.head)
    )
    const tip =
      working && head ? [{ hash: UNCOMMITTED, parents: [head.hash] }] : []
    const rows = commitGraph([...tip, ...read.commits])
    return {
      rows,
      offset: tip.length,
      merges: [
        ...tip.map(() => false),
        ...read.commits.map((commit) => commit.parents.length > 1),
      ],
      pixels: Math.max(MIN_GRAPH_PX, graphPixels(graphWidth(rows), MAX_LANES)),
    }
  }, [read, working, query])
  /** As wide as the lanes need, until somebody drags the column. */
  const lanes = graph?.pixels ?? MIN_GRAPH_PX

  /**
   * The columns' widths: the settings', or the drag's while one is under way
   * — held here and written once on release, as the commit panel's height is,
   * since every write is the whole settings bag.
   */
  const savedColumns = useSettings((state) => state.graphColumns)
  const [dragged, setDragged] = useState<GraphColumns | null>(null)
  const columns = useMemo(
    () => dragged ?? graphColumnsOf(savedColumns),
    [dragged, savedColumns]
  )
  const pixels = columns.graph ?? lanes
  const rest = restOf(columns)
  const offset = graph?.offset ?? 0

  const unpushed = useMemo(() => new Set(upstream?.ahead), [upstream])

  /**
   * The commit open in the panel under the list. A panel rather than the
   * files spliced in under the row, which pushed every row below it down by
   * the length of the commit — and, with the graph one drawing, would have
   * torn it in two.
   */
  const [selected, select] = useState<string | null>(null)
  /**
   * A comparison opened from the menu: the commit on the right, what it is
   * compared with on the left. It belongs to the picked commit — picking
   * another drops it — and its files are read once per pair, like a commit's.
   */
  const [compare, setCompare] = useState<{
    hash: string
    base: { hash: string; label: string }
  } | null>(null)
  // Picking any row ends a comparison, rather than it coming back with the
  // row it was opened on.
  const toggle = useCallback((hash: string) => {
    setCompare(null)
    select((current) => (current === hash ? null : hash))
  }, [])
  // A commit's files never change, so each is read once, the first time it is
  // picked — the arrows walking past it again cost nothing.
  const [files, setFiles] = useState<Record<string, GitCommitFile[]>>({})
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (!selected || selected === UNCOMMITTED || asked.current.has(selected))
      return
    asked.current.add(selected)
    void window.desktop
      .gitCommitFiles(root.folderId, selected)
      .catch(() => [])
      .then((answer) => setFiles((state) => ({ ...state, [selected]: answer })))
  }, [selected, root.folderId])
  const [target, setTarget] = useState<GitCommit | null>(null)
  const commits = read?.commits

  const comparing = compare && compare.hash === selected ? compare : null
  const compareKey = comparing ? `${comparing.base.hash}:${comparing.hash}` : ""
  useEffect(() => {
    if (!comparing || files[compareKey]) return
    const { hash, base } = comparing
    void window.desktop
      .gitCommitFiles(root.folderId, hash, base.hash)
      .catch(() => [])
      .then((answer) =>
        setFiles((state) => ({ ...state, [compareKey]: answer }))
      )
    // `compareKey` is the comparison's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareKey, root.folderId])

  /** Whether the menu's commit has a merge base with `HEAD` other than
   * itself, asked as the menu opens so the item can be greyed. */
  const [mergeBaseOf, setMergeBaseOf] = useState<string | null>(null)
  useEffect(() => {
    if (!target) return
    let current = true
    void window.desktop
      .gitCompareBase(root.folderId, target.hash, { kind: "mergeBase" })
      .catch(() => null)
      .then((base) => {
        if (current) setMergeBaseOf(base ? target.hash : null)
      })
    return () => {
      current = false
    }
  }, [target, root.folderId])

  const [dialog, setDialog] = useState<GraphDialog>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  useEffect(() => {
    if (!notice?.ok) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  /** After a write: the graph, the branch name beside the project and the
   * working tree all re-read, rather than waiting on a watcher that a ref
   * made under `.git` may not wake. */
  const afterWrite = useCallback(() => {
    setRefreshes((value) => value + 1)
    void useStudio.getState().refreshBranches()
  }, [])

  const actions: GraphMenuActions = {
    openChanges(commit) {
      setCompare(null)
      select(commit.hash)
      void window.desktop
        .gitCommitFiles(root.folderId, commit.hash)
        .catch(() => [] as GitCommitFile[])
        .then((answer) => {
          setFiles((state) => ({ ...state, [commit.hash]: answer }))
          asked.current.add(commit.hash)
          const first = answer[0]
          if (!first) return
          useChanges.getState().openCommitFile(root.id, {
            hash: commit.hash,
            shortHash: commit.shortHash,
            subject: commit.subject,
            path: first.path,
            ...(first.from === undefined ? {} : { from: first.from }),
          })
        })
    },
    compare(commit, against: GitCompareAgainst) {
      void window.desktop
        .gitCompareBase(root.folderId, commit.hash, against)
        .catch(() => null)
        .then((base) => {
          if (!base) {
            setNotice({
              ok: false,
              text: t("files.graph.menu.nothingToCompare"),
            })
            return
          }
          setCompare({ hash: commit.hash, base })
          select(commit.hash)
        })
    },
    write(run, done) {
      setNotice(null)
      void run()
        .catch((failure: unknown): GitWriteResult => ({
          ok: false,
          message: failure instanceof Error ? failure.message : String(failure),
        }))
        .then((answer) => {
          afterWrite()
          if (answer.ok) setNotice({ ok: true, text: done })
          else if (answer.conflict)
            setNotice({
              ok: false,
              text: t("files.graph.menu.conflict"),
              detail: answer.message,
              changes: true,
            })
          else if (answer.empty)
            setNotice({ ok: false, text: t("files.graph.menu.alreadyPicked") })
          else setNotice({ ok: false, text: answer.message })
        })
    },
    ask: setDialog,
  }
  const tags = useMemo(
    () => [
      ...new Set(
        (commits ?? []).flatMap((commit) =>
          commit.refs.filter((ref) => ref.kind === "tag").map((ref) => ref.name)
        )
      ),
    ],
    [commits]
  )
  const selectedCommit =
    commits?.find((commit) => commit.hash === selected) ?? null
  const selectedIndex = selectedCommit ? commits!.indexOf(selectedCommit) : -1
  /** The working tree's row, picked — the same picking a commit's row has,
   * so it opens its files in the same panel rather than doing nothing on a
   * click where the Explorer already showed them. */
  const workingPicked = selected === UNCOMMITTED && offset > 0
  /** The picked row among every row drawn, the working tree's included. */
  const pickedRow = workingPicked
    ? 0
    : selectedIndex < 0
      ? -1
      : selectedIndex + offset

  const stale = read !== null && read.pageKey !== pageKey
  const loading = read !== null && !stale && read.count !== count
  const more = read?.more === true && !stale

  const scroller = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  // A new branch or filter starts at the top of its own list, rather than
  // wherever the last one had been scrolled to.
  const shownKey = read?.pageKey
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [shownKey])

  // The selected row kept in view — after the panel opens under the list and
  // takes its height, and as the arrows walk past the edge.
  // The header is stuck over the top of the scroller, so a row is in view
  // only below it.
  useEffect(() => {
    if (pickedRow < 0) return
    const box = scroller.current
    if (!box) return
    const above = header.current?.offsetHeight ?? 0
    const top = pickedRow * GRAPH_ROW
    if (top < box.scrollTop) box.scrollTop = top
    else if (above + top + GRAPH_ROW > box.scrollTop + box.clientHeight) {
      box.scrollTop = above + top + GRAPH_ROW - box.clientHeight
    }
  }, [pickedRow, selectedCommit])

  // The next page asked for before the end of this one is reached, so
  // scrolling through history does not stop at a button. The list stays as it
  // is while it is read, and the page arrives under it.
  const sentinel = useRef<HTMLDivElement>(null)
  const loadMore = useCallback(
    () => setPaged({ key: pageKey, count: count + PAGE }),
    [pageKey, count]
  )
  useEffect(() => {
    const node = sentinel.current
    const box = scroller.current
    if (!node || !box || !more || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { root: box, rootMargin: `0px 0px ${GRAPH_ROW * 20}px 0px` }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [more, loading, loadMore])

  function onKeyDown(event: React.KeyboardEvent) {
    if (!commits || commits.length === 0) return
    if (event.key === "Escape" && selected) {
      event.preventDefault()
      setCompare(null)
      select(null)
      return
    }
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const keys = [
      ...(offset > 0 ? [UNCOMMITTED] : []),
      ...commits.map((commit) => commit.hash),
    ]
    const from = pickedRow < 0 ? (step > 0 ? -1 : keys.length) : pickedRow
    const next = keys[Math.max(0, Math.min(keys.length - 1, from + step))]
    if (!next) return
    setCompare(null)
    select(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <Toolbar
        scope={scope}
        branches={branches}
        typed={typed}
        onType={setTyped}
        onScope={(next) => useGitGraph.getState().setScope(root.id, next)}
        onRefresh={() => setRefreshes((value) => value + 1)}
      />
      {notice && <NoticeLine notice={notice} onClose={() => setNotice(null)} />}

      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto outline-none [overflow-anchor:none]"
      >
        {/* Inside the scroller, stuck to its top, rather than above it: a
            header outside was the scroller's width plus its scrollbar, and the
            fixed columns under it sat a scrollbar's width to the left of
            their headings. In here both are measured off one width. Opaque,
            since the rows pass under it. */}
        <div ref={header} className="sticky top-0 z-10 bg-background">
          <div
            className="relative grid border-b bg-muted/30 font-medium text-muted-foreground"
            style={{ gridTemplateColumns: `${pixels}px ${rest}` }}
          >
            <ColumnBorders
              columns={columns}
              graph={pixels}
              header={header}
              onDrag={setDragged}
              onDone={(final) => {
                setDragged(null)
                if (final) useSettings.getState().setGraphColumns(final)
              }}
              onReset={() => useSettings.getState().setGraphColumns(null)}
            />
            <span className="truncate px-2 py-1.5">
              {t("files.graph.graph")}
            </span>
            <span className="truncate px-2 py-1.5">
              {t("files.graph.description")}
            </span>
            <span className="truncate px-2 py-1.5">
              {t("files.graph.date")}
            </span>
            <span className="truncate px-2 py-1.5">
              {t("files.graph.author")}
            </span>
            <span className="truncate px-2 py-1.5">
              {t("files.graph.commit")}
            </span>
          </div>
        </div>
        {read === null ? (
          <p className="px-3 py-2 text-muted-foreground">
            {t("files.reading")}
          </p>
        ) : read.commits.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground">
            {query
              ? t("files.commits.noMatch", { query })
              : t("files.commits.noCommits")}
          </p>
        ) : (
          // Dimmed only once an answer has taken a moment: a branch or a
          // filter that comes back at once swaps without a flash.
          <div
            className={cn(
              "relative pb-3 transition-opacity",
              stale && "opacity-60 delay-200"
            )}
          >
            {offset > 0 && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => toggle(UNCOMMITTED)}
                aria-pressed={workingPicked}
                className={cn(
                  "grid w-full items-center text-left",
                  workingPicked ? "bg-accent" : "hover:bg-accent/50"
                )}
                style={{
                  height: GRAPH_ROW,
                  paddingLeft: pixels,
                  gridTemplateColumns: rest,
                }}
              >
                <span className="truncate px-2 font-medium">
                  {t("files.graph.uncommitted", { count: changed })}
                </span>
                <span className="truncate px-2 text-muted-foreground">*</span>
                <span className="px-2 text-muted-foreground">*</span>
                <span className="px-2 text-muted-foreground">*</span>
              </button>
            )}
            <ContextMenu>
              <ContextMenuTrigger render={<ul />}>
                {read.commits.map((commit) => (
                  <GraphRow
                    key={commit.hash}
                    commit={commit}
                    pixels={pixels}
                    columns={rest}
                    selected={commit.hash === selected}
                    unpushed={unpushed.has(commit.hash)}
                    onToggle={toggle}
                    onMenu={setTarget}
                  />
                ))}
              </ContextMenuTrigger>
              <GraphCommitMenu
                commit={target}
                root={root}
                upstream={upstream?.name ?? null}
                webUrl={upstream?.webUrl ?? null}
                mergeBase={!!target && mergeBaseOf === target.hash}
                actions={actions}
              />
            </ContextMenu>
            {graph && (
              // Cut at the column's edge: a graph column dragged narrower than
              // its lanes hides the outer ones rather than drawing them over
              // the descriptions.
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 overflow-hidden"
                style={{ width: pixels, height: graph.rows.length * GRAPH_ROW }}
              >
                <CommitGraphCanvas
                  rows={graph.rows}
                  merges={graph.merges}
                  pixels={lanes}
                  uncommitted={offset > 0}
                  selected={pickedRow}
                />
              </div>
            )}

            <div ref={sentinel} aria-hidden />
            {more && (
              <button
                type="button"
                disabled={loading}
                onClick={loadMore}
                className="mx-3 mt-2 flex h-7 w-[calc(100%-1.5rem)] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-60"
              >
                {loading
                  ? t("files.reading")
                  : t("files.graph.loadMore", { count: PAGE })}
              </button>
            )}
          </div>
        )}
      </div>

      {selectedCommit && (
        <CommitPanel
          commit={selectedCommit}
          root={root}
          base={comparing?.base}
          files={files[comparing ? compareKey : selectedCommit.hash]}
          onClose={() => select(null)}
          onEndCompare={() => setCompare(null)}
        />
      )}
      {workingPicked && (
        <UncommittedPanel root={root} onClose={() => select(null)} />
      )}

      {(dialog?.kind === "branch" || dialog?.kind === "tag") && (
        <CreateRefDialog
          kind={dialog.kind}
          commit={dialog.commit}
          root={root}
          onDone={(text) => {
            afterWrite()
            setNotice({ ok: true, text })
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "compare" && (
        <CompareWithDialog
          commit={dialog.commit}
          root={root}
          branches={branches}
          tags={tags}
          onCompare={(base) => {
            setCompare({ hash: dialog.commit.hash, base })
            select(dialog.commit.hash)
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

/** How long a write that worked is said for; one that failed stays. */
const NOTICE_MS = 6000

/** What the last write from the menu came to, in a line under the toolbar. */
type Notice = {
  ok: boolean
  text: string
  /** git's own words under the line, for a refusal worth reading whole. */
  detail?: string
  /** A conflict's way on: the `Changes` list, where it is resolved. */
  changes?: boolean
}

function NoticeLine({
  notice,
  onClose,
}: {
  notice: Notice
  onClose: () => void
}) {
  const t = useT()
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 items-start gap-2 border-b px-3 py-1.5",
        notice.ok
          ? "bg-muted/30 text-muted-foreground"
          : "bg-destructive/5 text-destructive"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono whitespace-pre-wrap">{notice.text}</p>
        {notice.detail && (
          <p className="mt-0.5 line-clamp-3 font-mono text-[0.65rem] whitespace-pre-wrap opacity-80">
            {notice.detail}
          </p>
        )}
      </div>
      {notice.changes && (
        <button
          type="button"
          onClick={openChanges}
          className="shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] text-primary hover:bg-primary/10"
        >
          {t("files.graph.menu.resolve")}
        </button>
      )}
      <button
        type="button"
        aria-label={t("files.graph.menu.dismiss")}
        onClick={onClose}
        className="shrink-0 rounded p-0.5 hover:bg-accent/50"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** What one read answered, and a string that changes when what it drew would. */
type Read = {
  pageKey: string
  count: number
  commits: GitCommit[]
  more: boolean
  signature: string
}

function signatureOf(commits: GitCommit[], more: boolean): string {
  return (
    commits
      .map(
        (commit) =>
          commit.hash +
          commit.refs
            .map((ref) => `${ref.kind}:${ref.name}${ref.head ? "*" : ""}`)
            .join(",")
      )
      .join("|") + (more ? "+" : "")
  )
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index])
}

/** What the commit panel takes of the tab until somebody drags it. */
const PANEL_SHARE = 0.38
/** The most a dragged panel may take: the list keeps the rest. */
const PANEL_MAX_SHARE = 0.85
/** Its floor: the heading and a couple of files, so a drag never leaves a
 * heading over nothing — closing it is what the ✕ is for. */
const PANEL_MIN = 96

/**
 * Dragging the commit panel's top edge, the way the Accounts foot is dragged:
 * held here while dragging and written once on release, since every write is
 * the whole settings bag. Kept as a setting, so the next commit opened — in
 * this tab or another project's — opens at the height last chosen.
 */
function usePanelResize() {
  const saved = useSettings((state) => state.graphDetailsHeight)
  const save = useSettings((state) => state.setGraphDetailsHeight)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; height: number; max: number } | null>(null)
  const [dragHeight, setDragHeight] = useState<number | null>(null)

  return {
    panel,
    height: dragHeight ?? saved,
    dragging: dragHeight !== null,
    start(event: React.PointerEvent<HTMLDivElement>) {
      const element = panel.current
      if (event.button !== 0 || !element) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const tab = element.parentElement?.clientHeight ?? window.innerHeight
      drag.current = {
        y: event.clientY,
        height: element.offsetHeight,
        max: Math.max(PANEL_MIN, tab * PANEL_MAX_SHARE),
      }
    },
    move(event: React.PointerEvent<HTMLDivElement>) {
      const current = drag.current
      if (!current) return
      const next = current.height + current.y - event.clientY
      setDragHeight(
        Math.round(Math.min(current.max, Math.max(PANEL_MIN, next)))
      )
    },
    end() {
      if (!drag.current) return
      drag.current = null
      if (dragHeight !== null) save(dragHeight)
      setDragHeight(null)
    },
    reset() {
      save(null)
    },
  }
}

/**
 * The panel under the list, whatever was picked in it: a heading, a ✕, and
 * the files below. A fixed height, so moving between rows never moves the
 * list — and a top edge that drags.
 */
function DetailsPanel({
  heading,
  actions,
  onClose,
  children,
}: {
  heading: React.ReactNode
  /** Beside the ✕ — what this kind of row can do besides list its files. */
  actions?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  const t = useT()
  const {
    panel,
    height,
    dragging,
    start: startResize,
    move: moveResize,
    end: endResize,
    reset: resetResize,
  } = usePanelResize()
  return (
    <div
      ref={panel}
      // Its own share of the tab until dragged, and never past the share that
      // leaves rows above it: a panel that ate the list would be a commit
      // with no history left to pick the next one from.
      style={{
        height:
          height === null
            ? `${PANEL_SHARE * 100}%`
            : `min(${height}px, ${PANEL_MAX_SHARE * 100}%)`,
      }}
      className="relative flex shrink-0 flex-col border-t bg-muted/10"
    >
      {/* Straddling the top border, the Accounts foot's handle: found by
          aiming at the edge, a double-click gives the panel its own height
          back. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("files.graph.resizeDetails")}
        title={t("files.graph.resizeHint")}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={resetResize}
        className="group absolute inset-x-0 -top-1.5 z-20 flex h-3 cursor-ns-resize items-center"
      >
        <span
          className={cn(
            "h-0.5 w-full transition-colors group-hover:bg-ring/60",
            dragging && "bg-ring/60"
          )}
        />
      </div>
      <div className="flex shrink-0 items-start gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">{heading}</div>
        {actions}
        <button
          type="button"
          aria-label={t("files.graph.closeDetails")}
          title={t("files.graph.closeDetails")}
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">{children}</div>
    </div>
  )
}

/**
 * The commit picked in the list: the whole message line, who and when, and
 * its files — each opening in the checkout's diff tab.
 */
function CommitPanel({
  commit,
  root,
  base,
  files,
  onClose,
  onEndCompare,
}: {
  commit: GitCommit
  root: FileRoot
  /** A comparison's left side, from the menu; absent, the first parent. */
  base?: { hash: string; label: string }
  files: GitCommitFile[] | undefined
  onClose: () => void
  onEndCompare: () => void
}) {
  const t = useT()
  return (
    <DetailsPanel
      onClose={onClose}
      actions={
        base && (
          <button
            type="button"
            onClick={onEndCompare}
            className="shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] text-primary hover:bg-primary/10"
          >
            {t("files.graph.menu.endCompare")}
          </button>
        )
      }
      heading={
        <>
          {base && (
            <p className="mb-0.5 truncate text-[0.65rem] text-primary">
              {t("files.graph.menu.comparing", {
                hash: commit.shortHash,
                base: base.label,
              })}
            </p>
          )}
          <p className="truncate font-medium" title={commit.subject}>
            {commit.subject}
          </p>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[0.65rem] text-muted-foreground">
            <span className="font-mono">{commit.hash}</span>
            <span>{commit.author}</span>
            <span className="tabular-nums">{formatDate(commit.date)}</span>
            {commit.parents.length > 0 && (
              <span className="font-mono">
                {t("files.graph.parents")}{" "}
                {commit.parents.map((parent) => parent.slice(0, 7)).join(" ")}
              </span>
            )}
          </p>
        </>
      }
    >
      <CommitFiles commit={commit} root={root} files={files} base={base} />
    </DetailsPanel>
  )
}

/**
 * The working tree's row, picked: what is uncommitted, in the `Changes`
 * list's two piles, each file opening in the checkout's diff tab — the same
 * one tab a commit's file opens in. Read off the `Changes` list's own store,
 * which the Explorer keeps current for this root, so nothing here asks git.
 *
 * Staging and committing stay the `Changes` list's: the button beside the ✕
 * takes the reader there. This was all the row did once, and a click on it
 * with the Explorer already on that list did nothing anybody could see.
 */
function UncommittedPanel({
  root,
  onClose,
}: {
  root: FileRoot
  onClose: () => void
}) {
  const t = useT()
  const changes = useChanges((state) => state.byRoot[root.id])
  const openPath = useChanges((state) =>
    state.commitFile[root.id] ? null : (state.selectedPath[root.id] ?? null)
  )
  const { staged, unstaged } = splitChanges(changes ?? [])

  return (
    <DetailsPanel
      onClose={onClose}
      heading={
        <>
          <p className="truncate font-medium">
            {t("files.graph.uncommitted", { count: changeCount(changes) })}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
            {t("files.graph.uncommittedDetail", {
              staged: new Set(staged.map((change) => change.path)).size,
              unstaged: new Set(unstaged.map((change) => change.path)).size,
            })}
          </p>
        </>
      }
      actions={
        <button
          type="button"
          onClick={openChanges}
          className="shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] text-primary hover:bg-primary/10"
        >
          {t("files.graph.openChanges")}
        </button>
      }
    >
      {[
        { label: t("files.graph.staged"), changes: staged },
        { label: t("files.graph.unstaged"), changes: unstaged },
      ]
        .filter((pile) => pile.changes.length > 0)
        .map((pile) => (
          <section key={pile.label} className="pb-1">
            <p className="px-3 pt-1 pb-0.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
              {pile.label}
            </p>
            <ul>
              {pile.changes.map((change) => (
                <li key={`${pile.label}:${change.path}`}>
                  <WorkingFileRow
                    root={root}
                    change={change}
                    active={!change.staged && openPath === change.path}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </DetailsPanel>
  )
}

/** One uncommitted file, drawn the way a commit's file is under it. */
function WorkingFileRow({
  root,
  change,
  active,
}: {
  root: FileRoot
  change: GitChange
  active: boolean
}) {
  const name = nameOf(change.path)
  const directory = relativeTo(root.path, parentOf(change.path))
  return (
    <SideRow
      indent={1.5}
      active={active}
      title={change.path}
      onClick={() => {
        // A wholly untracked directory has no diff: it is opened in the tree,
        // as the `Changes` list opens it.
        if (change.directory) {
          useStudio.getState().setExplorerTab("files")
          void useFiles
            .getState()
            .reveal(change.path)
            .then(() => {
              const files = useFiles.getState()
              if (!files.expanded.includes(change.path))
                files.toggle(change.path)
            })
          return
        }
        useChanges.getState().openPath(root.id, change.path)
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left">
        <FileIcon filePath={change.path} className="size-3.5" />
        <span
          className={cn(
            "shrink-0 text-xs leading-normal",
            GIT_TONES[change.state]
          )}
        >
          {name}
          {change.directory && "/"}
        </span>
        <span className="min-w-0 truncate text-[0.65rem] text-muted-foreground">
          {directory}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center gap-1.5",
          GIT_TONES[change.state]
        )}
      >
        <span className="font-mono text-[0.65rem]">
          {GIT_LETTERS[change.state]}
        </span>
        {change.added !== null && change.removed !== null && (
          <span className="font-mono text-[0.65rem] tabular-nums">
            <span className={GIT_TONES.added}>+{change.added}</span>{" "}
            <span className={GIT_TONES.deleted}>−{change.removed}</span>
          </span>
        )}
      </span>
    </SideRow>
  )
}

/** Where uncommitted work is staged and committed: the Explorer's `Changes`
 * list, opened from the working tree's panel. */
function openChanges() {
  const studio = useStudio.getState()
  if (!studio.sidebar) studio.toggleSidebar()
  studio.setExplorerTab("git")
  studio.setGitView("changes")
}

/** An entry of the branch list: a refname, or `PICK_ALL` / `PICK_HEAD`. */
type BranchOption = { value: string; label: string }
type BranchGroup = { label: string; items: BranchOption[] }

/**
 * `Branches`: several ticked at once, with a filter over them — a repository
 * with forty remote branches is not a list to scroll for the two wanted.
 * Which ticks make which scope is `lib/files/branch-pick.ts`.
 */
function BranchPicker({
  scope,
  branches,
  onScope,
}: {
  scope: GitLogScope
  branches: { local: string[]; remote: string[] }
  onScope: (scope: GitLogScope) => void
}) {
  const t = useT()
  const picks = picksOf(scope)

  const special: BranchOption[] = [
    { value: PICK_ALL, label: t("files.graph.showAll") },
    { value: PICK_HEAD, label: t("files.graph.currentBranch") },
  ]
  const local = branches.local.map((name) => ({
    value: `refs/heads/${name}`,
    label: name,
  }))
  const remote = branches.remote.map((name) => ({
    value: `refs/remotes/${name}`,
    label: name,
  }))
  // A branch picked and since deleted stays listed, ticked, so it can be
  // taken off — git skips it meanwhile (`--ignore-missing`).
  const listed = new Set([...local, ...remote].map((option) => option.value))
  for (const pick of picks) {
    if (pick === PICK_ALL || pick === PICK_HEAD || listed.has(pick)) continue
    const option = { value: pick, label: shortRef(pick) }
    if (pick.startsWith("refs/remotes/")) remote.push(option)
    else local.push(option)
  }
  const groups: BranchGroup[] = [
    { label: "", items: special },
    { label: t("files.graph.localBranches"), items: local },
    { label: t("files.graph.remoteBranches"), items: remote },
  ].filter((group) => group.items.length > 0)

  const byValue = new Map(
    groups.flatMap((group) => group.items).map((item) => [item.value, item])
  )
  const value = picks.map(
    (pick) => byValue.get(pick) ?? { value: pick, label: shortRef(pick) }
  )

  const summary =
    scope.kind === "all"
      ? t("files.graph.showAll")
      : scope.kind === "head"
        ? t("files.graph.currentBranch")
        : scope.refs.length <= 2
          ? scope.refs.map(shortRef).join(", ")
          : t("files.graph.branchesPicked", {
              first: shortRef(scope.refs[0]!),
              count: scope.refs.length - 1,
            })

  return (
    <Combobox
      multiple
      items={groups}
      value={value}
      onValueChange={(next: BranchOption[]) =>
        onScope(
          scopeOfPicks(
            scope,
            next.map((option) => option.value)
          )
        )
      }
      itemToStringLabel={(item: BranchOption) => item.label}
      isItemEqualToValue={(item: BranchOption, current: BranchOption) =>
        item.value === current.value
      }
      autoHighlight
    >
      <ComboboxTrigger
        title={
          scope.kind === "branches"
            ? scope.refs.map(shortRef).join("\n")
            : summary
        }
        className="flex h-7 w-56 items-center justify-between gap-1.5 rounded-md border border-input bg-transparent pr-2 pl-2.5 text-xs outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring dark:bg-input/30"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            scope.kind === "branches" && "font-mono"
          )}
        >
          {summary}
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="w-72">
        <ComboboxInput
          showTrigger={false}
          placeholder={t("files.graph.findBranch")}
          spellCheck={false}
          autoComplete="off"
          className="text-xs"
        />
        <ComboboxEmpty>{t("files.graph.noBranch")}</ComboboxEmpty>
        <ComboboxList>
          {(group: BranchGroup) => (
            <ComboboxGroup key={group.label || "views"} items={group.items}>
              {group.label && <ComboboxLabel>{group.label}</ComboboxLabel>}
              <ComboboxCollection>
                {(item: BranchOption) => (
                  <ComboboxItem
                    key={item.value}
                    value={item}
                    className={cn(
                      "text-xs",
                      item.value.startsWith("refs/") && "font-mono"
                    )}
                  >
                    {item.value.startsWith("refs/remotes/") ? (
                      <Cloud className="size-3.5 text-muted-foreground" />
                    ) : item.value.startsWith("refs/") ? (
                      <GitBranch className="size-3.5 text-muted-foreground" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function Toolbar({
  scope,
  branches,
  typed,
  onType,
  onScope,
  onRefresh,
}: {
  scope: GitLogScope
  branches: { local: string[]; remote: string[] }
  typed: string
  onType: (value: string) => void
  onScope: (scope: GitLogScope) => void
  onRefresh: () => void
}) {
  const t = useT()

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-muted-foreground">
          {t("files.graph.branches")}
        </span>
        <BranchPicker scope={scope} branches={branches} onScope={onScope} />
      </div>

      {/* Only means something over every branch: picked branches are the
          ones picked. */}
      <label
        className={cn(
          "flex items-center gap-2",
          scope.kind !== "all" && "opacity-50"
        )}
      >
        <Checkbox
          checked={scope.kind === "all" && scope.remotes}
          disabled={scope.kind !== "all"}
          onCheckedChange={(checked) =>
            onScope({ kind: "all", remotes: checked === true })
          }
        />
        <span>{t("files.graph.showRemotes")}</span>
      </label>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex h-7 w-56 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-1 focus-within:ring-ring">
          <Search
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <input
            value={typed}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && typed) {
                event.preventDefault()
                onType("")
              }
            }}
            placeholder={t("files.commits.filterPlaceholder")}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {typed && (
            <button
              type="button"
              aria-label={t("files.commits.clearFilter")}
              onClick={() => onType("")}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          title={t("files.graph.refresh")}
          aria-label={t("files.graph.refresh")}
          onClick={onRefresh}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * The header's column borders, each a handle: the border follows the pointer
 * (`moveBorder`), a double-click puts every column back. Laid over the header
 * rather than in its cells, at offsets read off the widths — the right-hand
 * three from the right, since Description between them stretches.
 */
function ColumnBorders({
  columns,
  graph,
  header,
  onDrag,
  onDone,
  onReset,
}: {
  columns: GraphColumns
  /** The graph column as drawn — its own width or the lanes'. */
  graph: number
  header: React.RefObject<HTMLDivElement | null>
  onDrag: (columns: GraphColumns) => void
  onDone: (columns: GraphColumns | null) => void
  onReset: () => void
}) {
  const t = useT()
  const drag = useRef<{
    border: GraphBorder
    x: number
    start: GraphColumns
    graph: number
    description: number
    last: GraphColumns | null
  } | null>(null)
  const [active, setActive] = useState<GraphBorder | null>(null)

  const borders: { border: GraphBorder; style: React.CSSProperties }[] = [
    { border: "graph", style: { left: graph } },
    {
      border: "description",
      style: { right: columns.date + columns.author + columns.commit },
    },
    { border: "date", style: { right: columns.author + columns.commit } },
    { border: "author", style: { right: columns.commit } },
  ]

  return (
    <>
      {borders.map(({ border, style }) => (
        <div
          key={border}
          role="separator"
          aria-orientation="vertical"
          aria-label={t("files.graph.resizeColumn")}
          title={t("files.graph.resizeHint")}
          style={style}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            const width = header.current?.clientWidth ?? 0
            drag.current = {
              border,
              x: event.clientX,
              start: columns,
              graph,
              description:
                width - graph - columns.date - columns.author - columns.commit,
              last: null,
            }
            setActive(border)
          }}
          onPointerMove={(event) => {
            const current = drag.current
            if (!current) return
            current.last = moveBorder(
              current.start,
              current.border,
              event.clientX - current.x,
              current.graph,
              current.description
            )
            onDrag(current.last)
          }}
          onPointerUp={() => {
            const current = drag.current
            drag.current = null
            setActive(null)
            onDone(current?.last ?? null)
          }}
          onPointerCancel={() => {
            drag.current = null
            setActive(null)
            onDone(null)
          }}
          onDoubleClick={onReset}
          className={cn(
            "group absolute inset-y-0 z-10 flex w-2 cursor-col-resize justify-center",
            // Centred on the border whichever side it is measured from.
            "left" in style ? "-translate-x-1/2" : "translate-x-1/2"
          )}
        >
          <span
            className={cn(
              "w-px transition-colors group-hover:bg-ring/70",
              active === border ? "bg-ring/70" : "bg-border"
            )}
          />
        </div>
      ))}
    </>
  )
}

/**
 * One commit's line. Memoised, with the handlers taking the commit rather than
 * closing over it: a re-read that changed one row — a ref moved, a commit
 * landed on top — re-renders that row, not the hundreds under it.
 */
const GraphRow = memo(function GraphRow({
  commit,
  pixels,
  columns,
  selected,
  unpushed,
  onToggle,
  onMenu,
}: {
  commit: GitCommit
  pixels: number
  /** `restOf` the widths — a string, so a row re-renders only when they
   * change. */
  columns: string
  selected: boolean
  unpushed: boolean
  onToggle: (hash: string) => void
  onMenu: (commit: GitCommit) => void
}) {
  const t = useT()
  const head = commit.refs.some((ref) => ref.head)
  return (
    <li>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onToggle(commit.hash)}
        onContextMenu={() => onMenu(commit)}
        aria-pressed={selected}
        title={`${commit.subject}\n\n${commit.hash}`}
        className={cn(
          "grid w-full items-center text-left",
          selected ? "bg-accent" : "hover:bg-accent/50"
        )}
        style={{
          height: GRAPH_ROW,
          paddingLeft: pixels,
          gridTemplateColumns: columns,
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5 px-2">
          <RefChips refs={commit.refs} />
          <span className={cn("min-w-0 truncate", head && "font-medium")}>
            {commit.subject}
          </span>
          {unpushed && (
            <ArrowUp
              aria-label={t("files.commits.notPushed")}
              className="size-3 shrink-0 text-primary"
            />
          )}
        </span>
        <span className="truncate px-2 text-muted-foreground tabular-nums">
          {formatDate(commit.date)}
        </span>
        <span className="truncate px-2 text-muted-foreground">
          {commit.author}
        </span>
        <span className="truncate px-2 font-mono text-muted-foreground">
          {commit.shortHash}
        </span>
      </button>
    </li>
  )
})

/** One formatter for every row: building an `Intl` formatter per call was a
 * few hundred of them per render of the list. */
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/** `5 Nov 2026 13:27`, in the reader's own locale's order. */
function formatDate(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  return DATE_FORMAT.format(at)
}
