import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FileDiff,
  SquareArrowOutUpRight,
} from "lucide-react"

import type { GitChange } from "@shared/api"
import { useChanges } from "@/lib/files/changes"
import { GIT_LETTERS, GIT_TONES, useGitStatus } from "@/lib/files/git-status"
import { relativeTo } from "@/lib/files/paths"
import type { FileRoot } from "@/lib/files/roots"
import { isImage } from "@/lib/files/viewers"
import { useT } from "@/lib/i18n"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { FileIcon } from "../file-icon"
import { IconButton } from "../icon-button"
import { DiffControls } from "./file-workspace"

const CodeMirrorFileDiff = lazy(() => import("./codemirror-diff"))

/** How far past the visible part of the stack a file's diff is kept built —
 * ahead, so a scroll lands on a diff rather than on one being built, and
 * behind, so a short scroll back does not rebuild what just left. */
const AHEAD = "1200px 0px"

/** A diff's height before it has ever been built: the counted rows, capped,
 * so the scrollbar is roughly right without a thousand-line file reserving a
 * screen it will mostly fold away. Once built, its measured height is used. */
function estimatedHeight(change: Row): number {
  const rows = (change.added ?? 0) + (change.removed ?? 0)
  return Math.min(Math.max(rows, 3) * 20 + 40, 640)
}

/** Each diff's last measured height, by path — what stands in for it while
 * it is not built, so the scroll position does not move when it goes. */
type Heights = Map<string, number>
/** Each file's two sides as last read, by path, for one answer from git. */
type Reads = Map<string, Read>

/** One file of the stack: a path once, with both sides of the index summed —
 * the diff is against `HEAD`, which is both of them at once. */
type Row = {
  path: string
  state: GitChange["state"]
  added: number | null
  removed: number | null
}

function rowsOf(changes: GitChange[]): Row[] {
  const rows = new Map<string, Row>()
  for (const change of changes) {
    // A wholly untracked directory has no diff to draw; the list marks it and
    // the tree opens it.
    if (change.directory) continue
    const known = rows.get(change.path)
    if (!known) {
      rows.set(change.path, {
        path: change.path,
        state: change.state,
        added: change.added,
        removed: change.removed,
      })
      continue
    }
    known.added =
      known.added === null || change.added === null
        ? null
        : known.added + change.added
    known.removed =
      known.removed === null || change.removed === null
        ? null
        : known.removed + change.removed
  }
  return [...rows.values()]
}

/**
 * Every changed file's diff in one scroll — GitHub's "Files changed" — for the
 * `Changes` pane when `changesStacked` is on.
 *
 * Each file is a section with its header stuck to the top of the pane while
 * the section is under it, so the path of whatever is being read is always on
 * screen. Picking a file in the Explorer's list scrolls to it.
 *
 * **Only the diffs near the visible part are built.** A diff is a CodeMirror
 * view, and keeping every one built once scrolled past — which this did at
 * first — put a hundred editors in the page for a large change and the whole
 * window lagged. So the stack is windowed: every header stays (they are cheap,
 * and they are what the sticky path, the scroll-to and the scrollbar need),
 * and a diff is built as its section comes within `AHEAD` of the visible part
 * and **destroyed** as it leaves, a block of its last measured height left in
 * its place so nothing moves. One observer watches every section, rooted on
 * the stack's own scroller — one rooted on the viewport cannot see a margin
 * inside a scroll container, since the container clips first. What was read
 * is kept per answer from git for this checkout, so scrolling back is not a
 * second read. The working side is read from disk rather than
 * shared with an open editor, since git's patch — what the rows are drawn
 * from — is about the file on disk; `Open` puts a file in the single view,
 * where `Diff | Edit`, the picture comparison and the buffer are.
 */
export function ChangesStack({
  root,
  changes,
}: {
  root: FileRoot
  changes: GitChange[]
}) {
  const t = useT()
  const rows = useMemo(() => rowsOf(changes), [changes])
  const selected = useChanges((state) => state.selectedPath[root.id] ?? null)
  const scroller = useRef<HTMLDivElement>(null)
  const [shut, setShut] = useState<string[]>([])

  // Held for the life of the stack, and mutated rather than replaced: these
  // are measurements and a cache, not anything a render is waiting on.
  const [heights] = useState<Heights>(() => new Map())
  // A fresh cache per answer from git about this checkout — only this one:
  // another project's status moving says nothing about these files. `status`
  // is the key rather than an input, which is what the rule cannot see.
  const status = useGitStatus((state) => state.byRoot[root.id])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reads = useMemo<Reads>(() => new Map(), [status])

  /** The sections within `AHEAD` of the visible part, by path. */
  const [near, setNear] = useState<ReadonlySet<string>>(() => new Set())
  const observer = useRef<IntersectionObserver | null>(null)
  const resizes = useRef<ResizeObserver | null>(null)
  const watched = useRef(new Map<string, Element>())
  const pathOf = useRef(new Map<Element, string>())

  useEffect(() => {
    const watcher = new IntersectionObserver(
      (entries) =>
        setNear((before) => {
          let after: Set<string> | null = null
          for (const entry of entries) {
            const path = pathOf.current.get(entry.target)
            if (path === undefined) continue
            if (entry.isIntersecting === before.has(path)) continue
            after ??= new Set(before)
            if (entry.isIntersecting) after.add(path)
            else after.delete(path)
          }
          return after ?? before
        }),
      { root: scroller.current, rootMargin: AHEAD }
    )
    observer.current = watcher
    // The sections mounted before this effect ran, which is all of them.
    for (const node of watched.current.values()) watcher.observe(node)
    return () => {
      watcher.disconnect()
      observer.current = null
    }
  }, [])

  /*
   * The reading position held still while sections above it change height.
   *
   * They do, constantly: a diff destroyed while scrolled past is built again
   * on the way back up, side by side aligns its columns with spacers sized as
   * rows are measured, and a fold bar's estimate is corrected once drawn. The
   * browser's own scroll anchoring would absorb that, but it cannot anchor on
   * anything in a diff — CodeMirror's scroller turns it off (it anchors its
   * own scroller itself) and both its scroller and the merge view's are
   * nested scroll containers. So it is off here too, so as not to count
   * twice, and done by hand: a section wholly above the top of the visible
   * part that changed by some pixels moves everything under it by them, and
   * the scroll moves with it. Before paint, so nothing is seen to jump. A
   * section straddling the top is left alone — where in it the change was
   * cannot be told from its size.
   */
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const known = new Map<Element, number>()
    const watcher = new ResizeObserver((entries) => {
      const changed = entries
        .map((entry) => entry.target as HTMLElement)
        .sort((a, b) => a.offsetTop - b.offsetTop)
      let shift = 0
      for (const node of changed) {
        const height = node.offsetHeight
        const before = known.get(node)
        known.set(node, height)
        if (before === undefined || before === height) continue
        // Its top already includes any section above it that changed in this
        // same batch; the scroll does not yet, hence `shift`.
        if (node.offsetTop + before <= box.scrollTop + shift + 1) {
          shift += height - before
        }
      }
      if (shift !== 0) box.scrollTop += shift
    })
    resizes.current = watcher
    for (const node of watched.current.values()) watcher.observe(node)
    return () => {
      watcher.disconnect()
      resizes.current = null
    }
  }, [])

  /** A section's node arriving or leaving, from its ref. */
  const watch = useCallback((path: string, node: Element | null) => {
    const before = watched.current.get(path)
    if (before) {
      observer.current?.unobserve(before)
      resizes.current?.unobserve(before)
      pathOf.current.delete(before)
      watched.current.delete(path)
    }
    if (node) {
      watched.current.set(path, node)
      pathOf.current.set(node, path)
      observer.current?.observe(node)
      resizes.current?.observe(node)
    }
  }, [])

  // To the file picked in the list, its header at the top of the pane.
  useEffect(() => {
    if (!selected) return
    const section = scroller.current?.querySelector<HTMLElement>(
      `[data-change-path="${CSS.escape(selected)}"]`
    )
    section?.scrollIntoView({ block: "start" })
  }, [selected])

  const added = rows.reduce((sum, row) => sum + (row.added ?? 0), 0)
  const removed = rows.reduce((sum, row) => sum + (row.removed ?? 0), 0)

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Outside the scroller, so it stays: the single view's header row,
          with the diff's own two controls — layout and whitespace are how
          every diff below is drawn. */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <span>{t("files.changesStack.files", { count: rows.length })}</span>
        <span className={GIT_TONES.added}>+{added}</span>
        <span className={GIT_TONES.deleted}>−{removed}</span>
        {/* Icons, the words on hover: the row also holds the diff's own
            controls, and three phrases beside them crowded it. */}
        <span className="ml-auto flex items-center gap-0.5">
          <IconButton
            label={t("files.changesStack.expandAll")}
            onClick={() => setShut([])}
          >
            <ChevronsUpDown />
          </IconButton>
          <IconButton
            label={t("files.changesStack.collapseAll")}
            onClick={() => setShut(rows.map((row) => row.path))}
          >
            <ChevronsDownUp />
          </IconButton>
          <IconButton
            label={t("files.changesStack.oneFile")}
            onClick={() => useSettings.getState().setChangesStacked(false)}
          >
            <FileDiff />
          </IconButton>
        </span>
        <DiffControls />
      </div>
      {/* `relative`, so a section's `offsetTop` is measured from this
          scroller's content; anchoring off, see the effect above. */}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        {rows.map((row) => (
          <FileSection
            key={row.path}
            root={root}
            row={row}
            open={!shut.includes(row.path)}
            near={near.has(row.path)}
            watch={watch}
            heights={heights}
            reads={reads}
            current={row.path === selected}
            onToggle={() =>
              setShut((state) =>
                state.includes(row.path)
                  ? state.filter((entry) => entry !== row.path)
                  : [...state, row.path]
              )
            }
          />
        ))}
      </div>
    </div>
  )
}

function FileSection({
  root,
  row,
  open,
  near,
  watch,
  heights,
  reads,
  current,
  onToggle,
}: {
  root: FileRoot
  row: Row
  open: boolean
  /** Within `AHEAD` of the visible part: the diff is built while this is. */
  near: boolean
  watch: (path: string, node: Element | null) => void
  heights: Heights
  reads: Reads
  current: boolean
  onToggle: () => void
}) {
  const t = useT()
  const { path } = row
  const ref = useCallback(
    (node: HTMLElement | null) => watch(path, node),
    [watch, path]
  )

  return (
    <section
      ref={ref}
      data-change-path={row.path}
      className="border-b last:border-b-0"
    >
      {/* Stuck while its section is under it, and pushed off by the next
          section's: the path of what is being read stays on screen. */}
      <header
        className={cn(
          "sticky top-0 z-10 flex h-9 items-center gap-2 bg-background px-2 text-xs",
          // A rule under the header only above a diff: shut, the section's
          // own bottom edge is the line, and both drew a doubled one.
          open && "border-b",
          current && "bg-accent"
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
          />
          <FileIcon filePath={row.path} className="size-3.5 shrink-0" />
          <span className="truncate font-mono" title={row.path}>
            {relativeTo(root.path, row.path)}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[0.65rem]",
              GIT_TONES[row.state]
            )}
          >
            {GIT_LETTERS[row.state]}
          </span>
          {row.added !== null && row.removed !== null && (
            <span className="shrink-0 font-mono text-[0.65rem]">
              <span className={GIT_TONES.added}>+{row.added}</span>{" "}
              <span className={GIT_TONES.deleted}>−{row.removed}</span>
            </span>
          )}
        </button>
        <IconButton
          label={t("files.copyPath")}
          className="shrink-0"
          onClick={() => void navigator.clipboard.writeText(path)}
        >
          <Copy />
        </IconButton>
        <IconButton
          label={t("files.reveal")}
          className="shrink-0"
          onClick={() => void window.desktop.revealPath(path)}
        >
          <ExternalLink />
        </IconButton>
        <IconButton
          label={t("files.changesStack.open")}
          className="shrink-0"
          onClick={() => {
            useSettings.getState().setChangesStacked(false)
            useChanges.getState().selectPath(root.id, row.path)
          }}
        >
          <SquareArrowOutUpRight />
        </IconButton>
      </header>

      {open &&
        (near ? (
          <SectionBody row={row} heights={heights} reads={reads} />
        ) : (
          <div style={{ height: heights.get(path) ?? estimatedHeight(row) }} />
        ))}
    </section>
  )
}

/**
 * A file's diff while its section is near the visible part. Its two sides come
 * from the stack's cache when they were read for git's current answer, and
 * are read otherwise; the last ones read stay on screen meanwhile, so a save
 * does not blank the diff for a beat. Its height is written down as it
 * changes — a fold opened inside it included — for the block that stands in
 * for it once it is gone.
 */
function SectionBody({
  row,
  heights,
  reads,
}: {
  row: Row
  heights: Heights
  reads: Reads
}) {
  const t = useT()
  const sideBySide = useSettings((state) => state.diffSideBySide)
  const whitespace = useSettings((state) => state.diffWhitespace)
  const { path, state } = row
  const [read, setRead] = useState<Read | null>(() => reads.get(path) ?? null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isImage(path)) return
    let alive = true
    const known = reads.get(path)
    const answer = known
      ? Promise.resolve(known)
      : readBoth(path, state).then((fresh) => {
          reads.set(path, fresh)
          return fresh
        })
    void answer.then((fresh) => alive && setRead(fresh))
    return () => {
      alive = false
    }
  }, [reads, path, state])

  useEffect(() => {
    const node = box.current
    if (!node) return
    const measure = new ResizeObserver(() => {
      // Zero is a diff still mounting, not a height worth standing in for.
      if (node.offsetHeight > 0) heights.set(path, node.offsetHeight)
    })
    measure.observe(node)
    return () => measure.disconnect()
  }, [heights, path])

  const placeholder = heights.get(path) ?? estimatedHeight(row)

  return (
    <div ref={box}>
      {isImage(path) ? (
        <Note>{t("files.changesStack.image")}</Note>
      ) : !read ? (
        <div style={{ height: placeholder }} />
      ) : read.kind === "note" ? (
        <Note>{t(read.message)}</Note>
      ) : (
        <Suspense fallback={<div style={{ height: placeholder }} />}>
          <CodeMirrorFileDiff
            path={row.path}
            initialText={read.working}
            modified={read.working}
            original={read.head}
            patch={read.patch}
            sideBySide={sideBySide}
            whitespace={whitespace}
            autoHeight
          />
        </Suspense>
      )}
    </div>
  )
}

type Read =
  | { kind: "diff"; head: string | null; working: string; patch: string | null }
  | {
      kind: "note"
      message:
        | "files.changesStack.binary"
        | "files.changesStack.tooLarge"
        | "files.changesStack.unreadable"
    }

async function readBoth(path: string, state: Row["state"]): Promise<Read> {
  const [diff, working] = await Promise.all([
    window.desktop.fileDiff(path).catch(() => null),
    // A deleted file has no working side; its diff is the committed text gone.
    state === "deleted"
      ? Promise.resolve(null)
      : window.desktop.readTextFile(path).catch(() => null),
  ])
  if (working && working.kind === "binary") {
    return { kind: "note", message: "files.changesStack.binary" }
  }
  if (working && working.kind === "too-large") {
    return { kind: "note", message: "files.changesStack.tooLarge" }
  }
  if (!diff && !working) {
    return { kind: "note", message: "files.changesStack.unreadable" }
  }
  return {
    kind: "diff",
    head: diff?.head ?? null,
    working:
      working && working.kind === "text"
        ? working.text.replace(/\r\n?/g, "\n")
        : "",
    patch: diff?.patch ?? null,
  }
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-xs text-muted-foreground">{children}</p>
}
