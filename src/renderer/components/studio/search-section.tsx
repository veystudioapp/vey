import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import {
  CaseSensitive,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FileText,
  FolderDot,
  FolderTree,
  History,
  Link,
  Link2,
  ListCollapse,
  ListFilter,
  MessageSquare,
  Regex,
  ReplaceAll,
  RotateCw,
  WholeWord,
  X,
} from "lucide-react"

import type {
  SearchKinds,
  SearchOptions,
  SearchPreview,
  WorkspaceSearch,
} from "@shared/api"
import { matcherOf, previewReplacement } from "@shared/search"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { since } from "@/lib/chat/since"
import { nameOf } from "@/lib/files/paths"
import { useFiles } from "@/lib/files/store"
import { revealAt } from "@/lib/files/typescript"
import { useProjects } from "@/lib/projects"
import { useStudio } from "@/lib/store"
import { useWorkspaceSearch, type SearchKind } from "@/lib/workspace-search"
import { useChats } from "@/lib/chat/store"
import { useT, type MessageKey, type Translate } from "@/lib/i18n"
import { FileIcon } from "./file-icon"
import { IconButton } from "./icon-button"
import { PanelHeader } from "./panel-header"
import { SIDE_ROW_SHAPE, sideRowIndent } from "./side-row"

/**
 * The left column's Search: `Find in files` the way the editors draw it — a
 * field with `Aa` / `ab` / `.*`, and the results grouped by where they are,
 * each line a row that opens on the match.
 *
 * Over the **contents** of the workspace, where `⌘P` is over its names: every
 * file under every folder, and what was said in every chat — the one half an
 * editor cannot answer. A file row opens the file with the match selected
 * (`revealAt`, the jump go-to-definition uses); a chat row opens the chat with
 * its `⌘F` bar already on that occurrence (`landing`, taken by the chat pane).
 *
 * The rows are one flat list (`rowsOf`) drawn in order, so the arrow keys walk
 * exactly what is on screen and nothing has to know how deep a row is nested.
 */
/**
 * `on`, but only once it has stayed on for `ms`. Most searches answer inside a
 * frame or two, and a ring that lit for one of those read as a flicker rather
 * than as work; this lets it say so only for the search worth waiting on.
 */
function useLate(on: boolean, ms = 200) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) return
    const timer = setTimeout(() => setLate(true), ms)
    // Reset as it goes off, so the next run waits its `ms` again.
    return () => {
      clearTimeout(timer)
      setLate(false)
    }
  }, [on, ms])
  return on && late
}

export function SearchSection() {
  const query = useWorkspaceSearch((state) => state.query)
  const options = useWorkspaceSearch((state) => state.options)
  const scope = useWorkspaceSearch((state) => state.scope)
  const filtersOpen = useWorkspaceSearch((state) => state.filtersOpen)
  const replaceOpen = useWorkspaceSearch((state) => state.replaceOpen)
  const replacement = useWorkspaceSearch((state) => state.replacement)
  const replacing = useWorkspaceSearch((state) => state.replacing)
  const notice = useWorkspaceSearch((state) => state.notice)
  const result = useWorkspaceSearch((state) => state.result)
  const searching = useWorkspaceSearch((state) => state.searching)
  const focused = useWorkspaceSearch((state) => state.focused)
  const shut = useWorkspaceSearch((state) => state.shut)
  const shutKinds = useWorkspaceSearch((state) => state.shutKinds)
  const recent = useWorkspaceSearch((state) => state.recent)
  const {
    setQuery,
    toggleOption,
    setScope,
    toggleFilters,
    toggleReplace,
    setReplacement,
    replace,
    run,
    toggleGroup,
    toggleKind,
    toggleAll,
    remember,
    forget,
    clearRecent,
    dismiss,
  } = useWorkspaceSearch.getState()
  const folders = useStudio((state) => state.folders)
  const activeFolderId = useProjects((state) => state.activeFolderId)
  const t = useT()

  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [focused])

  const [cursor, setCursor] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const nameOfFolder = (folderId: string | null) =>
    folders.find((folder) => folder.id === folderId)?.name
  // Only worth saying which project a file is in when there is more than one.
  const several = folders.length > 1

  const fileMatches =
    result?.files.reduce((sum, file) => sum + file.matches.length, 0) ?? 0
  const chatMatches =
    result?.chats.reduce((sum, chat) => sum + chat.matches.length, 0) ?? 0

  // Built here as well as in main, for the replace preview alone: the rows
  // draw what each match would become as the replace field is typed.
  const built = useMemo(() => matcherOf(query, options), [query, options])
  const preview =
    replaceOpen && built && "matcher" in built
      ? (text: string, from: number) =>
          previewReplacement(
            text,
            from,
            built.matcher,
            replacement,
            options.regex
          )
      : undefined

  const rows = useMemo(
    () =>
      result
        ? rowsOf(result, {
            shut,
            shutKinds,
            folderName: nameOfFolder,
            several,
          })
        : [],
    // `nameOfFolder` reads `folders`, which is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, shut, shutKinds, folders, several]
  )
  const at = rows.findIndex((row) => row.key === cursor)

  // The row under the cursor kept on screen as the keys walk past the edge.
  useEffect(() => {
    if (!cursor) return
    list.current
      ?.querySelector(`[data-row="${CSS.escape(cursor)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  function openRow(row: Row) {
    setCursor(row.key)
    if (row.type === "kind") toggleKind(row.kind)
    else if (row.type === "group") toggleGroup(row.group)
    else {
      remember(query)
      openLine(row)
    }
  }

  function openLine(row: Extract<Row, { type: "line" }>) {
    if (row.chatId) {
      useWorkspaceSearch.getState().land({
        chatId: row.chatId,
        messageId: row.messageId,
        offset: row.offset,
        length: row.length,
      })
      useChats.getState().select(row.chatId)
    } else revealAt(row.path, row.line, row.column, row.length)
  }

  /*
   * `F4` / `⇧F4` — the next and previous match, opened, the editors' keys for
   * stepping through a search's results from wherever the caret is. Bound only
   * while this section is mounted, which is while the column shows Search, and
   * never inside the dock's shell, whose function keys are the program's.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "F4" || event.metaKey || event.ctrlKey) return
      if (event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest(".xterm"))
        return
      const lines = rows.filter((row) => row.type === "line")
      if (lines.length === 0) return
      event.preventDefault()
      const from = lines.findIndex((row) => row.key === cursor)
      const step = event.shiftKey ? -1 : 1
      const next =
        from === -1
          ? event.shiftKey
            ? lines.length - 1
            : 0
          : (from + step + lines.length) % lines.length
      const row = lines[next]
      if (row) openRow(row)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  /**
   * Dismisses the file or chat `row` belongs to, and moves the cursor to the
   * first row past it — or the last one before it, at the end of the list — so
   * Delete pressed again keeps clearing downwards.
   */
  function dismissRow(row: Row) {
    if (row.type === "kind") return
    const from = rows.indexOf(row)
    const after = rows.slice(from).find((other) => groupOf(other) !== row.group)
    const before = rows
      .slice(0, from)
      .reverse()
      .find((other) => groupOf(other) !== row.group)
    dismiss(row.group)
    setCursor((after ?? before)?.key ?? null)
  }

  function onListKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const row = rows[at]
    switch (event.key) {
      case "Escape":
        event.preventDefault()
        setCursor(null)
        field.current?.focus()
        break
      case "Delete":
      case "Backspace":
        if (!row || row.type === "kind") break
        event.preventDefault()
        dismissRow(row)
        break
      case "ArrowDown": {
        event.preventDefault()
        const next = rows[Math.min(at + 1, rows.length - 1)]
        if (next) setCursor(next.key)
        break
      }
      case "ArrowUp": {
        event.preventDefault()
        if (at <= 0) {
          field.current?.focus()
          setCursor(null)
          break
        }
        const next = rows[at - 1]
        if (next) setCursor(next.key)
        break
      }
      case "ArrowRight":
        if (row && row.type !== "line" && !row.open) {
          event.preventDefault()
          openRow(row)
        }
        break
      case "ArrowLeft":
        event.preventDefault()
        if (!row) break
        if (row.type !== "line" && row.open) openRow(row)
        else if (row.type === "line") setCursor(row.parent)
        break
      case "Enter":
      case " ":
        if (!row) break
        event.preventDefault()
        openRow(row)
        break
      case "Home":
        event.preventDefault()
        if (rows[0]) setCursor(rows[0].key)
        break
      case "End":
        event.preventDefault()
        if (rows.length > 0) setCursor(rows[rows.length - 1]!.key)
        break
    }
  }

  const slowSearch = useLate(searching)
  const slowReplace = useLate(replacing)

  const replaceable = replaceOpen && fileMatches > 0 && !replacing
  const filtered = scope.include.trim() !== "" || scope.exclude.trim() !== ""
  const narrowing = [
    scope.kinds === "chats" && t("nav.search.narrowChatsOnly"),
    scope.kinds === "files" && t("nav.search.narrowFilesOnly"),
    scope.thisProject && t("nav.search.narrowThisProject"),
    filtered && t("nav.search.narrowGlobs"),
  ].filter((part): part is string => Boolean(part))

  // `toggleAll` opens everything once every group is shut, so the button says
  // which of the two it is about to do.
  const groups = (result?.files.length ?? 0) + (result?.chats.length ?? 0)
  const allShut = groups > 0 && shut.length >= groups

  const sections = useMemo(() => sectionsOf(rows), [rows])

  /*
   * `⌥⌘C` / `⌥⌘W` / `⌥⌘R` — the editors' keys for the three toggles, taken
   * anywhere inside this column, field or list. `code` rather than `key`: with
   * ⌥ held, macOS hands over `ç`, `∑` and `®`.
   */
  function onSectionKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!event.altKey || !(event.metaKey || event.ctrlKey) || event.shiftKey)
      return
    const option = OPTION_KEYS[event.code]
    if (!option) return
    event.preventDefault()
    toggleOption(option)
  }

  function pickRecent(entry: string) {
    setQuery(entry)
    remember(entry)
    field.current?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={onSectionKey}>
      <PanelHeader title={t("common.search")}>
        <IconButton
          label={t("nav.search.searchAgain")}
          onClick={run}
          disabled={!query}
        >
          <RotateCw />
        </IconButton>
        <IconButton
          label={t(allShut ? "nav.search.expandAll" : "nav.search.collapseAll")}
          onClick={toggleAll}
          disabled={!result || (fileMatches === 0 && chatMatches === 0)}
        >
          {allShut ? <ChevronsUpDown /> : <ListCollapse />}
        </IconButton>
      </PanelHeader>

      <div className="shrink-0 space-y-1.5 border-b p-2">
        <div className="flex gap-1">
          {/* The disclosure for Replace, the search field's height and level
              with it: stretched down the pair, it read as a bar. */}
          <IconButton
            label={t(
              replaceOpen ? "nav.search.hideReplace" : "nav.search.replace"
            )}
            onClick={toggleReplace}
            aria-expanded={replaceOpen}
            className="size-7 shrink-0 [&_svg]:size-3.5"
          >
            <ChevronRight
              className={cn("transition-transform", replaceOpen && "rotate-90")}
            />
          </IconButton>

          <div className="min-w-0 flex-1 space-y-1">
            <div
              className="border-run flex h-7 items-center rounded-md border bg-background pr-0.5 focus-within:ring-1 focus-within:ring-ring"
              data-running={slowSearch || undefined}
            >
              <input
                ref={field}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    remember(query)
                    run()
                  }
                  if (event.key === "Escape" && query) {
                    event.preventDefault()
                    setQuery("")
                  }
                  if (event.key === "ArrowDown" && rows.length > 0) {
                    event.preventDefault()
                    setCursor(rows[0]!.key)
                    list.current?.focus()
                  }
                }}
                placeholder={t("nav.search.placeholder")}
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
              />
              {/* Kept mounted while empty, disabled, so the toggles beside it
                  do not jump left as the first letter is typed. */}
              <IconButton
                label={t("nav.search.clear")}
                onClick={() => setQuery("")}
                disabled={!query}
                className="size-6 [&_svg]:size-3"
              >
                <X />
              </IconButton>
              <Toggle
                option="matchCase"
                label={t("nav.search.matchCase")}
                options={options}
                onToggle={toggleOption}
              >
                <CaseSensitive />
              </Toggle>
              <Toggle
                option="wholeWord"
                label={t("nav.search.wholeWord")}
                options={options}
                onToggle={toggleOption}
              >
                <WholeWord />
              </Toggle>
              <Toggle
                option="regex"
                label={t("nav.search.regex")}
                options={options}
                onToggle={toggleOption}
              >
                <Regex />
              </Toggle>
            </div>

            {replaceOpen && (
              <div
                className="border-run flex h-7 items-center rounded-md border bg-background pr-0.5 focus-within:ring-1 focus-within:ring-ring"
                data-running={slowReplace || undefined}
              >
                <input
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey) &&
                      replaceable
                    ) {
                      event.preventDefault()
                      setConfirming(true)
                    }
                  }}
                  placeholder={
                    options.regex
                      ? t("nav.search.replaceRegexPlaceholder")
                      : t("nav.search.replace")
                  }
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
                />
                <IconButton
                  label={t("nav.search.replaceAllInFiles")}
                  onClick={() => setConfirming(true)}
                  disabled={!replaceable}
                  className="size-6 [&_svg]:size-3.5"
                >
                  <ReplaceAll />
                </IconButton>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <KindSwitch
            value={scope.kinds}
            onChange={(kinds) => setScope({ kinds })}
          />
          <span className="flex-1" />
          <IconButton
            label={
              scope.thisProject
                ? t("nav.search.onlyProject", {
                    name:
                      nameOfFolder(activeFolderId) ??
                      t("nav.search.narrowThisProject"),
                  })
                : t("nav.search.onlyThisProject")
            }
            pressed={scope.thisProject}
            onClick={() => setScope({ thisProject: !scope.thisProject })}
            className={cn(
              "size-6 [&_svg]:size-3.5",
              scope.thisProject && "bg-accent text-accent-foreground"
            )}
          >
            <FolderDot />
          </IconButton>
          <IconButton
            label={t(
              filtersOpen ? "nav.search.hideFilters" : "nav.search.showFilters"
            )}
            pressed={filtersOpen || filtered}
            onClick={toggleFilters}
            className={cn(
              "size-6 [&_svg]:size-3.5",
              (filtersOpen || filtered) && "bg-accent text-accent-foreground"
            )}
          >
            <ListFilter />
          </IconButton>
        </div>

        {filtersOpen && (
          <div className="space-y-1">
            <GlobField
              label={t("nav.search.include")}
              value={scope.include}
              placeholder={t("nav.search.includePlaceholder")}
              disabled={scope.kinds === "chats"}
              onChange={(include) => setScope({ include })}
            />
            <GlobField
              label={t("nav.search.exclude")}
              value={scope.exclude}
              placeholder={t("nav.search.excludePlaceholder")}
              disabled={scope.kinds === "chats"}
              onChange={(exclude) => setScope({ exclude })}
            />
          </div>
        )}

        <p className="min-h-4 px-0.5 text-[0.7rem] text-muted-foreground">
          {result?.error ? (
            <span className="text-destructive">{result.error}</span>
          ) : notice ? (
            <span className="text-foreground">{notice}</span>
          ) : replacing ? (
            t("nav.search.replacing")
          ) : !query ? null : searching && !result ? (
            t("nav.search.searching")
          ) : result ? (
            <>
              {summary(
                t,
                fileMatches,
                result.files.length,
                chatMatches,
                result.chats.length
              )}
              {result.truncated && t("nav.search.truncated")}
              {searching && t("nav.search.stillSearching")}
            </>
          ) : null}
        </p>
      </div>

      <div
        ref={list}
        tabIndex={rows.length > 0 ? 0 : -1}
        role="tree"
        aria-label={t("nav.search.results")}
        aria-activedescendant={at >= 0 ? rowId(rows[at]!.key) : undefined}
        onKeyDown={onListKey}
        onFocus={() => {
          if (at === -1 && rows[0]) setCursor(rows[0].key)
        }}
        className="group/list min-h-0 flex-1 overflow-y-auto py-1 outline-none"
      >
        {!query && rows.length === 0 && (
          <SearchStart
            recent={recent}
            onPick={pickRecent}
            onForget={forget}
            onClear={clearRecent}
          />
        )}

        {/* Drawn nested — a box per kind, a box per file or chat — though
            `rows` stays flat for the keys: a sticky header sticks only inside
            its own box, so each file's name stays on screen while its matches
            scroll under it and gives way to the next file's, rather than every
            header piling up at the top of the list. */}
        {sections.map(({ head, groups }) => (
          <div key={head.key}>
            <Kind
              id={head.key}
              current={head.key === cursor}
              label={t(KIND_LABELS[head.kind])}
              count={head.count}
              open={head.open}
              onToggle={() => openRow(head)}
            />
            {groups.map(({ head: group, lines }) => (
              <div key={group.key}>
                <Group
                  id={group.key}
                  current={group.key === cursor}
                  open={group.open}
                  onToggle={() => openRow(group)}
                  icon={
                    group.path ? (
                      <FileIcon filePath={group.path} />
                    ) : (
                      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                    )
                  }
                  name={group.name}
                  where={group.where}
                  when={group.when}
                  title={group.relative ?? group.name}
                  count={group.count}
                  onReplace={
                    replaceable && group.path
                      ? () => void replace([group.path!])
                      : undefined
                  }
                  onDismiss={() => dismissRow(group)}
                  menu={
                    <GroupMenu
                      group={group}
                      onOpen={() => {
                        // On its first match where one is drawn; a shut group
                        // has none on screen, so the file or chat itself.
                        const first = lines[0]
                        if (first) openRow(first)
                        else if (group.path)
                          useFiles.getState().select(group.path)
                        else useChats.getState().select(group.group)
                      }}
                      onDismiss={() => dismissRow(group)}
                    />
                  }
                />
                {lines.map((row) => (
                  <Line
                    key={row.key}
                    id={row.key}
                    current={row.key === cursor}
                    preview={row.preview}
                    replacement={row.chatId ? undefined : preview}
                    // A chat's lines have no line number; they have a voice.
                    line={row.chatId ? undefined : row.line}
                    role={row.role}
                    onClick={() => openRow(row)}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}

        {result &&
          !result.error &&
          !searching &&
          result.files.length === 0 &&
          result.chats.length === 0 && (
            <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
              <p>
                {t("nav.search.noResultsFor")}{" "}
                <span className="text-foreground">“{query}”</span>
              </p>
              {/* A filter that is on narrows the answer without saying so, so
                  the empty answer is the place to say it. */}
              {narrowing.length > 0 && (
                <p className="text-[0.7rem]">
                  {t("nav.search.narrowedBy", { list: narrowing.join(", ") })}
                </p>
              )}
            </div>
          )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("nav.search.confirmTitle", {
                occurrences: t("nav.search.occurrences", {
                  count: fileMatches,
                }),
                files: t("nav.search.fileCount", {
                  count: result?.files.length ?? 0,
                }),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("nav.search.confirmEvery")}{" "}
              <code className="font-mono text-foreground">{query}</code>{" "}
              {t("nav.search.confirmBecomes")}{" "}
              <code className="font-mono text-foreground">
                {replacement || t("nav.search.confirmNothing")}
              </code>
              {t("nav.search.confirmRest")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false)
                void replace()
              }}
            >
              {t("nav.search.replaceAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type Row =
  | {
      type: "kind"
      key: string
      kind: SearchKind
      count: number
      open: boolean
    }
  | {
      type: "group"
      key: string
      /** What `shut` keys this group by — a file's path or a chat's id. */
      group: string
      open: boolean
      name: string
      where?: string
      /** A chat's last activity, as the projects column draws it — `3d`. */
      when?: string
      /** A file's; a chat group has none. */
      path?: string
      /** A file's path inside its folder, for the tooltip and the menu. */
      relative?: string
      count: number
    }
  | {
      type: "line"
      key: string
      parent: string
      /** Its group's `group`, so a line can dismiss the file it is in. */
      group: string
      preview: SearchPreview
      path: string
      line: number
      column: number
      length: number
      chatId?: string
      /** A chat's; a file's line has no voice. */
      role?: "user" | "assistant"
      messageId: string
      offset: number
    }

/** What is on screen, top to bottom — chats, then files, as before. */
function rowsOf(
  result: WorkspaceSearch,
  {
    shut,
    shutKinds,
    folderName,
    several,
  }: {
    shut: string[]
    shutKinds: SearchKind[]
    folderName: (folderId: string | null) => string | undefined
    several: boolean
  }
): Row[] {
  const rows: Row[] = []
  const count = (matches: { matches: unknown[] }[]) =>
    matches.reduce((sum, entry) => sum + entry.matches.length, 0)

  if (result.chats.length > 0) {
    const open = !shutKinds.includes("chats")
    rows.push({
      type: "kind",
      key: "kind:chats",
      kind: "chats",
      count: count(result.chats),
      open,
    })
    if (open)
      for (const chat of result.chats) {
        const key = `chat:${chat.chatId}`
        const groupOpen = !shut.includes(chat.chatId)
        rows.push({
          type: "group",
          key,
          group: chat.chatId,
          open: groupOpen,
          name: chat.title,
          where: folderName(chat.folderId),
          when: since(chat.updatedAt) || undefined,
          count: chat.matches.length,
        })
        // Keyed by place in the group, not by message: a transcript carries the
        // same message id more than once, and two keys alike in one flat list
        // leave React drawing rows from a search long since replaced.
        if (groupOpen)
          for (const [index, match] of chat.matches.entries())
            rows.push({
              type: "line",
              key: `${key}:${index}`,
              parent: key,
              group: chat.chatId,
              preview: match.preview,
              path: "",
              line: 0,
              column: 0,
              length: match.length,
              chatId: chat.chatId,
              role: match.role,
              messageId: match.messageId,
              offset: match.offset,
            })
      }
  }

  if (result.files.length > 0) {
    const open = !shutKinds.includes("files")
    rows.push({
      type: "kind",
      key: "kind:files",
      kind: "files",
      count: count(result.files),
      open,
    })
    if (open)
      for (const file of result.files) {
        const key = `file:${file.path}`
        const groupOpen = !shut.includes(file.path)
        const dir = file.relative.slice(0, -nameOf(file.relative).length - 1)
        const folder = several ? folderName(file.folderId) : undefined
        rows.push({
          type: "group",
          key,
          group: file.path,
          open: groupOpen,
          name: nameOf(file.relative),
          where: [folder, dir].filter(Boolean).join(" › ") || undefined,
          path: file.path,
          relative: file.relative,
          count: file.matches.length,
        })
        if (groupOpen)
          for (const [index, match] of file.matches.entries())
            rows.push({
              type: "line",
              key: `${key}:${index}`,
              parent: key,
              group: file.path,
              preview: match.preview,
              path: file.path,
              line: match.line,
              column: match.column,
              length: match.length,
              messageId: "",
              offset: 0,
            })
      }
  }

  return rows
}

type KindRow = Extract<Row, { type: "kind" }>
type GroupRow = Extract<Row, { type: "group" }>
type LineRow = Extract<Row, { type: "line" }>

const groupOf = (row: Row) => (row.type === "kind" ? null : row.group)

/** `rows` nested again for drawing — see the list's own comment. */
function sectionsOf(
  rows: Row[]
): { head: KindRow; groups: { head: GroupRow; lines: LineRow[] }[] }[] {
  const sections: ReturnType<typeof sectionsOf> = []
  for (const row of rows) {
    if (row.type === "kind") sections.push({ head: row, groups: [] })
    else if (row.type === "group")
      sections.at(-1)?.groups.push({ head: row, lines: [] })
    else sections.at(-1)?.groups.at(-1)?.lines.push(row)
  }
  return sections
}

const OPTION_KEYS: Record<string, keyof SearchOptions> = {
  KeyC: "matchCase",
  KeyW: "wholeWord",
  KeyR: "regex",
}

/** An element id for `aria-activedescendant`, which wants no spaces. */
const rowId = (key: string) =>
  `search-row-${key.replace(/[^\w-]/g, (char) => `_${char.charCodeAt(0)}`)}`

const KIND_LABELS: Record<SearchKind, MessageKey> = {
  chats: "nav.search.chats",
  files: "nav.search.files",
}

function summary(
  t: Translate,
  fileMatches: number,
  files: number,
  chatMatches: number,
  chats: number
): string {
  const parts: string[] = []
  if (chats > 0)
    parts.push(
      t("nav.search.resultsIn", {
        results: t("nav.search.resultCount", { count: chatMatches }),
        where: t("nav.search.chatCount", { count: chats }),
      })
    )
  if (files > 0)
    parts.push(
      t("nav.search.resultsIn", {
        results: t("nav.search.resultCount", { count: fileMatches }),
        where: t("nav.search.fileCount", { count: files }),
      })
    )
  return parts.join(", ") || t("nav.search.noResults")
}

function Toggle({
  option,
  label,
  options,
  onToggle,
  children,
}: {
  option: keyof SearchOptions
  label: string
  options: SearchOptions
  onToggle: (option: keyof SearchOptions) => void
  children: ReactNode
}) {
  const on = options[option]
  return (
    <IconButton
      label={label}
      pressed={on}
      onClick={() => onToggle(option)}
      className={cn(
        "size-6 [&_svg]:size-3.5",
        on && "bg-accent text-accent-foreground"
      )}
    >
      {children}
    </IconButton>
  )
}

const KINDS: { value: SearchKinds; label: MessageKey }[] = [
  { value: "all", label: "nav.search.all" },
  { value: "chats", label: "nav.search.chats" },
  { value: "files", label: "nav.search.files" },
]

/** Which half is searched. A segmented control rather than two toggles, since
 * both off is not a search. */
function KindSwitch({
  value,
  onChange,
}: {
  value: SearchKinds
  onChange: (kinds: SearchKinds) => void
}) {
  const t = useT()
  return (
    <div role="radiogroup" className="flex h-6 rounded-md border p-0.5">
      {KINDS.map((kind) => (
        <button
          key={kind.value}
          type="button"
          role="radio"
          aria-checked={value === kind.value}
          onClick={() => onChange(kind.value)}
          className={cn(
            "rounded-sm px-1.5 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground",
            value === kind.value && "bg-accent text-accent-foreground"
          )}
        >
          {t(kind.label)}
        </button>
      ))}
    </div>
  )
}

function GlobField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-0.5">
      <span className="px-0.5 text-[0.65rem] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-6 w-full rounded-md border bg-background px-2 font-mono text-[0.7rem] outline-none placeholder:font-sans placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
    </label>
  )
}

/** The ring on the keyboard's row, drawn only while the list has focus — a
 * cursor left behind in a list nobody is in reads as a selection. */
const CURSOR = "group-focus/list:ring-1 group-focus/list:ring-ring ring-inset"

/**
 * A header that stays put while its rows scroll under it. Slightly see-through
 * and blurred rather than solid: with a picture behind the studio the card is
 * translucent, and a solid strip across it reads as a hole in the picture.
 */
const STICKY = "sticky bg-background/95 backdrop-blur-sm"

/** `Chats` / `Files` above their groups — two kinds of row in one list, each
 * folding away whole, the way a `PanelHeader` folds: the whole label is the
 * target. */
function Kind({
  id,
  current,
  label,
  count,
  open,
  onToggle,
}: {
  id: string
  current: boolean
  label: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      id={rowId(id)}
      data-row={id}
      tabIndex={-1}
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        STICKY,
        "top-0 z-20 flex h-6 w-full items-center gap-1 px-2 pt-1 text-left text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground",
        current && CURSOR
      )}
    >
      <ChevronRight
        className={cn(
          "size-3 shrink-0 transition-transform",
          open && "rotate-90"
        )}
      />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  )
}

function Group({
  id,
  current,
  open,
  onToggle,
  icon,
  name,
  where,
  when,
  title,
  count,
  onReplace,
  onDismiss,
  menu,
}: {
  id: string
  current: boolean
  open: boolean
  onToggle: () => void
  icon: ReactNode
  name: string
  where?: string
  when?: string
  title?: string
  count: number
  /** Set while Replace is open, for a file's group. */
  onReplace?: () => void
  onDismiss: () => void
  /** The right-click menu's items — `GroupMenu`. */
  menu: ReactNode
}) {
  const t = useT()
  const row = (
    // A row rather than one button, so the actions beside the count are
    // buttons of their own and not ones nested in another.
    <div
      id={rowId(id)}
      data-row={id}
      // Sticky under the kind's header, which is `h-6`.
      className={cn(STICKY, "group/row top-6 z-10", current && CURSOR)}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onToggle}
        aria-expanded={open}
        title={title}
        style={sideRowIndent(0)}
        className={cn(SIDE_ROW_SHAPE, "text-left hover:bg-accent/60")}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        {icon}
        <span className="shrink-0 truncate">{name}</span>
        {where && (
          <span className="min-w-0 truncate text-muted-foreground">
            {where}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 group-hover/row:invisible">
          {when && (
            <span className="text-[0.65rem] text-muted-foreground/70 tabular-nums">
              {when}
            </span>
          )}
          <span className="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground tabular-nums">
            {count}
          </span>
        </span>
      </button>
      <span className="invisible absolute top-1/2 right-1 flex -translate-y-1/2 items-center group-hover/row:visible">
        {onReplace && (
          <IconButton
            label={t("nav.search.replaceInFile")}
            tabIndex={-1}
            onClick={onReplace}
            className="size-5 [&_svg]:size-3.5"
          >
            <ReplaceAll />
          </IconButton>
        )}
        <IconButton
          label={t("nav.search.dismissKey")}
          tabIndex={-1}
          onClick={onDismiss}
          className="size-5 [&_svg]:size-3.5"
        >
          <X />
        </IconButton>
      </span>
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger render={row} />
      <ContextMenuContent className="w-56">{menu}</ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * A file's or a chat's right-click menu: open it, the copies the Explorer's
 * tree offers for a file, and Dismiss.
 */
function GroupMenu({
  group,
  onOpen,
  onDismiss,
}: {
  group: GroupRow
  onOpen: () => void
  onDismiss: () => void
}) {
  const t = useT()
  const copy = (text: string) => void navigator.clipboard.writeText(text)
  const path = group.path

  return (
    <>
      <ContextMenuItem onClick={onOpen}>
        {path ? <FileText /> : <MessageSquare />}
        {t(path ? "nav.search.openFile" : "nav.search.openChat")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {path ? (
        <>
          <ContextMenuItem onClick={() => copy(path)}>
            <Link />
            {t("nav.tabs.copyPath")}
          </ContextMenuItem>
          {group.relative && (
            <ContextMenuItem onClick={() => copy(group.relative!)}>
              <Link2 />
              {t("nav.search.copyRelativePath")}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => revealInExplorer(path)}>
            <FolderTree />
            {t("nav.search.revealInExplorer")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void window.desktop.revealPath(path)}>
            <ExternalLink />
            {t("nav.search.revealInFileManager")}
          </ContextMenuItem>
        </>
      ) : (
        <ContextMenuItem onClick={() => copy(group.name)}>
          <Copy />
          {t("nav.search.copyTitle")}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onDismiss}>
        <X />
        {t("nav.search.dismiss")}
      </ContextMenuItem>
    </>
  )
}

/** The right-hand panel opened on `All files`, with the tree down to `path`. */
function revealInExplorer(path: string) {
  const studio = useStudio.getState()
  if (!studio.sidebar) studio.toggleSidebar()
  studio.setExplorerTab("files")
  void useFiles.getState().reveal(path)
}

/**
 * One match: its line, with the match itself painted in the find amber — or,
 * while a replacement is typed, struck through beside what it would become.
 */
function Line({
  id,
  current,
  preview,
  replacement,
  line,
  role,
  onClick,
}: {
  id: string
  current: boolean
  preview: SearchPreview
  replacement?: (text: string, from: number) => string
  /** A file's line number, drawn the way an editor's gutter draws it. */
  line?: number
  /** A chat's: who said it, which is half of what a match in a chat means. */
  role?: "user" | "assistant"
  onClick: () => void
}) {
  const t = useT()
  const match = preview.text.slice(preview.from, preview.to)
  return (
    <button
      type="button"
      id={rowId(id)}
      data-row={id}
      tabIndex={-1}
      onClick={onClick}
      style={sideRowIndent(2)}
      className={cn(
        SIDE_ROW_SHAPE,
        "text-left text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        current && CURSOR
      )}
    >
      {line !== undefined && (
        <span className="w-7 shrink-0 text-right text-[0.65rem] text-muted-foreground/70 tabular-nums">
          {line}
        </span>
      )}
      {role && (
        <span
          className={cn(
            "shrink-0 rounded-sm px-1 text-[0.6rem] leading-4 font-medium",
            role === "user"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {role === "user" ? t("nav.search.you") : "Claude"}
        </span>
      )}
      <span className="min-w-0 truncate font-mono text-[0.7rem] whitespace-pre">
        {preview.text.slice(0, preview.from)}
        {replacement ? (
          <>
            <del className="rounded-sm bg-destructive/20 text-foreground">
              {match}
            </del>
            <ins className="rounded-sm bg-success/25 text-foreground no-underline">
              {replacement(preview.text, preview.from)}
            </ins>
          </>
        ) : (
          <mark className="rounded-sm bg-warning/30 text-foreground">
            {match}
          </mark>
        )}
        {preview.text.slice(preview.to)}
      </span>
    </button>
  )
}

/**
 * What the empty column says before anything is asked: the queries that led
 * somewhere lately, one click from asking again, and the keys that walk a
 * result list — none of which is on screen until there is a list to walk.
 */
function SearchStart({
  recent,
  onPick,
  onForget,
  onClear,
}: {
  recent: string[]
  onPick: (query: string) => void
  onForget: (query: string) => void
  onClear: () => void
}) {
  const t = useT()
  const hints: [string, MessageKey][] = [
    ["↑ ↓", "nav.search.hintWalk"],
    ["Enter", "nav.search.hintOpen"],
    ["F4 / ⇧F4", "nav.search.hintNext"],
    ["⌫", "nav.search.hintDismiss"],
    ["⌥⌘C W R", "nav.search.hintOptions"],
    ["Esc", "nav.search.hintEscape"],
  ]
  return (
    <div className="space-y-3 py-1">
      {recent.length > 0 && (
        <section>
          <div className="flex h-6 items-center gap-1 px-2 pt-1 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
            <span className="flex-1 pl-1">{t("nav.search.recent")}</span>
            <button
              type="button"
              onClick={onClear}
              className="rounded-sm px-1 tracking-normal normal-case transition-colors hover:text-foreground"
            >
              {t("nav.search.clearRecent")}
            </button>
          </div>
          <ul>
            {recent.map((entry) => (
              <li key={entry} className="group/recent relative">
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  style={sideRowIndent(0)}
                  className={cn(
                    SIDE_ROW_SHAPE,
                    "text-left text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <History className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate font-mono text-[0.7rem]">
                    {entry}
                  </span>
                </button>
                <IconButton
                  label={t("nav.search.removeRecent")}
                  onClick={() => onForget(entry)}
                  className="invisible absolute top-1/2 right-1 size-5 -translate-y-1/2 group-hover/recent:visible [&_svg]:size-3"
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 px-3 text-xs">
        {hints.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt className="font-mono text-[0.7rem] whitespace-nowrap text-foreground">
              {keys}
            </dt>
            <dd className="text-muted-foreground">{t(what)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
