import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { DragEvent } from "react"
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
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import {
  BookOpen,
  Globe,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileCode,
  Image,
  Link,
  Link2,
  FilePlus,
  Folder,
  FolderOpen,
  FolderInput,
  FolderPlus,
  NotebookPen,
  Pencil,
  RotateCw,
  Rows3,
  Scissors,
  SquareTerminal,
  Trash2,
} from "lucide-react"

import type { FileEntry, WorkspaceFolder } from "@shared/api"
import { changeCount, useChanges, useWatchChanges } from "@/lib/files/changes"
import { useShells } from "@/lib/shell/store"
import { isDirty, useFiles, viewOf } from "@/lib/files/store"
import {
  gitStateOf,
  GIT_LABELS,
  GIT_LETTERS,
  GIT_TONES,
  useGitStatus,
} from "@/lib/files/git-status"
import { iconFor } from "@/lib/files/icons"
import {
  isImage,
  VIEWER_LABELS,
  viewersFor,
  type Viewer,
} from "@/lib/files/viewers"
import { useT } from "@/lib/i18n"
import { useProjects } from "@/lib/projects"
import { shownRootOf } from "@/lib/files/roots"
import { isInside, parentOf, relativeTo } from "@/lib/files/paths"
import { useStudio } from "@/lib/store"
import { useSettings } from "@/lib/settings"
import { RenameDialog } from "../rename-dialog"
import { IconButton } from "../icon-button"
import { RenameRow, useMenuFocusHandoff } from "../rename-row"
import { SideRow } from "../side-row"
import { ChangesList } from "./changes-list"
import { CommitsList } from "./commits-list"

/** What the right-click menu is about: a row in the tree, or the workspace
 * folder heading above one. */
/** What the tree's own menu is over: a row, or the empty space under the last
 * one. The root has a menu of its own, on the bar above the list — see
 * `RootMenu`. */
type MenuTarget = { kind: "entry"; entry: FileEntry }

/**
 * The directory a drag from outside the app would land in, or null.
 *
 * A context rather than a prop because the row that lights up is at the bottom
 * of the recursion and the drag is caught once, at the top — and only the two
 * rows whose answer changes re-render as the pointer moves.
 */
const DropTarget = createContext<string | null>(null)

/** The path `Cut` is holding, drawn faded until it is pasted — VS Code's way of
 * saying the row is about to leave. A context for the reason `DropTarget` is. */
const CutPath = createContext<string | null>(null)

const carriesFiles = (event: DragEvent) =>
  [...event.dataTransfer.types].includes("Files")

function failureOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * The workspace's folders, as directories.
 *
 * The other sidebars list records this app owns — a request, a note, a saved
 * query — and can therefore file them however they like. This one lists what is
 * actually on disk, so its shape is not the studio's to choose: the tree is the
 * directory tree, and a folder is read one level at a time, as it is opened. A
 * repository holds far more files than anybody wants listed, and the ones under
 * a folded directory are ones nobody has asked about.
 *
 * What is expanded is watched, and nothing else is — one non-recursive watcher
 * per open directory, closed again when the row is folded (`main/watch.ts`). A
 * watcher over a whole repository would be a `node_modules` of file handles and
 * a rebuild of the tree on every `npm install`; this costs a handle per row
 * somebody is looking at. Refresh is still in the header, for the filesystems
 * `fs.watch` is quiet on. What is never silently overwritten either way is an
 * edit: only the files with nothing unsaved in them are re-read.
 *
 * The rows are coloured by what git says about them — new, modified, ignored —
 * from one `git status` per folder (`lib/files/git-status.ts`). A tracked file
 * with no changes is the ordinary row and has no colour of its own.
 *
 * **The folders are this panel's, and only this panel's.** Adding, renaming and
 * removing one used to live in the Terminal sidebar as well, which drew the
 * same folder list a second time to hang the same three actions off it — so a
 * workspace of three folders with one session running redrew this sidebar over
 * there with a single extra row in it, and "where do I remove a folder" had two
 * answers. This is the list that says what the workspace is pointed at, so it
 * is the one that changes it. The File menu opens the same Add folder dialog,
 * which is what a rail with this section hidden falls back to.
 *
 * **Nothing here starts a terminal.** A folder's menu used to hold
 * `New session here…`, and there was a Sessions list under the tree; both are
 * gone with the panel they opened into. A shell is a tab of the dock now,
 * pointed at whichever project was last clicked in the left column, so the one
 * place to open one is the one place it can be — and a menu item that put a
 * shell in a corner of another column would be a menu item nobody could find
 * the result of.
 */
export function FileTree({ onAddFolder }: { onAddFolder: () => void }) {
  const t = useT()
  const folders = useStudio((state) => state.folders)
  const renameFolder = useStudio((state) => state.renameFolder)
  const removeFolder = useStudio((state) => state.removeFolder)

  /** The one root drawn: the project being worked in. Subscribed to both
   * stores rather than read through `shownRoot`, since this is the render that
   * has to follow a row being clicked in the left column. */
  const activeFolderId = useProjects((state) => state.activeFolderId)
  const shown = shownRootOf(folders, activeFolderId)
  const folder = folders.find((entry) => entry.id === shown?.folderId) ?? null

  const expanded = useFiles((state) => state.expanded)
  const refresh = useFiles((state) => state.refresh)

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null)
  const [trashing, setTrashing] = useState<FileEntry | null>(null)
  const menuFocus = useMenuFocusHandoff()
  const [dropDir, setDropDir] = useState<string | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  /** What `Copy` or `Cut` picked up for a later `Paste`. The app's own rather
   * than the OS clipboard, which holds text here — `Copy path` is already its —
   * and held across a switch of project, since pasting into another one is the
   * point. */
  const [copied, setCopied] = useState<{ path: string; cut: boolean } | null>(
    null
  )
  /** Every project but the one on screen, for `Copy to`. */
  const others = folders.filter((entry) => entry.id !== folder?.id)
  const [renamingFolder, setRenamingFolder] = useState<WorkspaceFolder | null>(
    null
  )
  const [removingFolder, setRemovingFolder] = useState<WorkspaceFolder | null>(
    null
  )

  /*
   * The root is read and watched without being a row.
   *
   * `expanded` is what the tree reads and what `main/watch.ts` watches, and
   * every other directory joins it by being clicked. This one has no row to
   * click — it *is* the list — so it is put there whenever it is not, which
   * also covers Collapse all: that clears the set, and a tree whose own root
   * had been collapsed out of it would be a blank panel with no way back.
   */
  const rootPath = shown?.path ?? null
  const rootRead = rootPath !== null && expanded.includes(rootPath)
  useEffect(() => {
    if (rootPath !== null && !rootRead) useFiles.getState().toggle(rootPath)
  }, [rootPath, rootRead])

  /** Which of the two tabs is showing, and what the other one has to say for
   * itself. The count is read for the project on screen whichever tab that is,
   * so `Changes 12` is true before it is clicked — which is the whole use of a
   * number on a tab. */
  const tab = useStudio((state) => state.explorerTab)
  const setTab = useStudio((state) => state.setExplorerTab)
  const gitView = useStudio((state) => state.gitView)
  const setGitView = useStudio((state) => state.setGitView)
  // Files, not rows: a file staged and then edited again is two rows in the
  // list below and one file here.
  const changes = useChanges((state) =>
    shown ? state.byRoot[shown.id] : undefined
  )
  const changed = changes === undefined ? undefined : changeCount(changes)
  useWatchChanges(shown)

  /** The nearest row's directory under the pointer — a folder's own, a file's
   * parent — and the root for the empty space under the last row. */
  function dropDirOf(event: DragEvent): string | null {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-drop-dir]"
    )
    return row?.dataset.dropDir ?? rootPath
  }

  /*
   * A drop from Finder is a **copy** into the directory under the pointer.
   *
   * A path already inside one of the workspace's folders is left out: that is
   * a row of this tree dragged back onto it (`startDragPath` makes it an OS
   * drag), and copying it would leave a `name 2` beside every row somebody
   * nudged. Moving within the tree is a different gesture this does not claim.
   */
  function onDrop(event: DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    const dir = dropDirOf(event)
    setDropDir(null)
    if (dir === null) return
    const sources = [...event.dataTransfer.files]
      .map((file) => window.desktop.getPathForFile(file))
      .filter(
        (source) =>
          source && !folders.some((entry) => isInside(entry.path, source))
      )
    if (sources.length === 0) return
    void useFiles
      .getState()
      .copyIn(dir, sources)
      .catch((error: unknown) => {
        setDropError(failureOf(error, t("files.tree.couldNotCopyIn")))
      })
  }

  /** A cut is spent by its paste — the source is gone — and a copy is not. */
  function paste(dir: string) {
    if (!copied) return
    if (!copied.cut) return copyTo(dir, copied.path)
    setCopied(null)
    void useFiles
      .getState()
      .moveInto(copied.path, dir)
      .catch((error: unknown) => {
        setDropError(failureOf(error, t("files.tree.couldNotMove")))
      })
  }

  /** Copies one of the tree's own paths in. `copyIn` already never overwrites —
   * a taken name gets ` 2` — and refuses a folder pasted into itself. */
  function copyTo(dir: string, source: string) {
    void useFiles
      .getState()
      .copyIn(dir, [source])
      .catch((error: unknown) => {
        setDropError(failureOf(error, t("files.tree.couldNotCopyIn")))
      })
  }

  return (
    <ContextMenu>
      <div className="flex h-full flex-col">
        {/* Two tabs where the panel's title used to be.
            `Explorer` named the panel to somebody already looking at it, and
            the space is worth more as the way in to the other list this panel
            has: what the project has changed, which after an agent's turn is
            the only question being asked. The names are Conductor's, since this
            is Conductor's column. */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b pr-2 pl-1.5">
          {/* `overflow-hidden` is the safety valve: the two tabs fit the
              panel's minimum with room to spare, and a sidebar dragged
              narrower than that clips them rather than overflowing the
              column. The actions are in each tab's own row below. */}
          <div
            role="tablist"
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
          >
            <ExplorerTabButton
              active={tab === "files"}
              onClick={() => setTab("files")}
              label={t("files.tree.allFiles")}
            />
            {/* The count rides on `Git` too, so `Git 12` is true before it is
                clicked — and on whichever view is showing inside it. */}
            <ExplorerTabButton
              active={tab === "git"}
              onClick={() => setTab("git")}
              label={t("files.tree.git")}
              count={changed}
            />
          </div>
        </div>

        {/* The changed files, when that is the tab.
            Their own scroller and **outside** the tree's context menu: the rows
            there open a diff, and a right-click offering `Add folder…` over
            them would be the workspace's menu on a list that is not about the
            workspace. The changed-file list carries its own menu — Stage,
            Unstage, Discard — inside this scroller. */}
        {tab === "git" ? (
          <>
            {/* The `Git` tab's two views, a row under the tab that holds them:
                what has changed, and what has been committed. */}
            <div
              role="tablist"
              className="flex h-8 shrink-0 items-center gap-0.5 border-b px-1.5"
            >
              <ExplorerTabButton
                active={gitView === "changes"}
                onClick={() => setGitView("changes")}
                label={t("files.tree.changes")}
                count={changed}
              />
              <ExplorerTabButton
                active={gitView === "commits"}
                onClick={() => setGitView("commits")}
                label={t("files.tree.commits")}
              />
              {/* Every changed file's diff in one scroll, or the one picked —
                  how the pane reads, so it sits with the list that feeds it. */}
              <span className="ml-auto flex items-center gap-0.5">
                {gitView === "changes" && shown && (
                  <ChangesAllToggle rootId={shown.id} />
                )}
                <RefreshButton
                  disabled={folders.length === 0}
                  onRefresh={() => void refresh()}
                />
              </span>
            </div>
            {/* `Commits` is its own scroller, under a header that stays put;
                inside this one, the header's rule stopped at the scrollbar's
                track rather than at the card's edge. */}
            {gitView === "commits" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {shown && <CommitsList key={shown.folderId} root={shown} />}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto pb-3">
                {shown && <ChangesList root={shown} />}
              </div>
            )}
          </>
        ) : (
          <>
            {/* The tree's own row of four, under the tabs as the Git tab's
                views are: make something at the project's top, show or hide
                dotfiles, read the disk again. The menus still create inside
                a folder; these are the ones wanted without aiming at one. */}
            <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-b px-1.5">
              <IconButton
                label={t("files.tree.newFile")}
                disabled={!shown}
                onClick={() =>
                  shown && useFiles.getState().beginCreate(shown.path, "file")
                }
              >
                <FilePlus />
              </IconButton>
              <IconButton
                label={t("files.tree.newFolder")}
                disabled={!shown}
                onClick={() =>
                  shown &&
                  useFiles.getState().beginCreate(shown.path, "directory")
                }
              >
                <FolderPlus />
              </IconButton>
              <HiddenFilesToggle />
              <RefreshButton
                disabled={folders.length === 0}
                onRefresh={() => void refresh()}
              />
            </div>
            {/* One trigger over the whole tree, rather than one per row: the
                rows are a recursive component, and a trigger inside a trigger
                inside a trigger is a menu nobody can predict the target of.
                Each row says what it is instead, on the way past. */}
            <ContextMenuTrigger
              render={
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-auto pb-3",
                    dropDir !== null &&
                      dropDir === rootPath &&
                      "bg-primary/5 ring-1 ring-primary/40 ring-inset"
                  )}
                  onContextMenu={(event) => {
                    // Only the empty space below the last row: a row of its own
                    // has already set the target by the time this is reached.
                    if (event.target === event.currentTarget)
                      setMenuTarget(null)
                  }}
                  onDragOver={(event) => {
                    if (!carriesFiles(event) || rootPath === null) return
                    // Without this the drop is refused, and Chromium navigates
                    // the window to the dropped file instead.
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "copy"
                    setDropDir(dropDirOf(event))
                  }}
                  onDragLeave={(event) => {
                    // Only on leaving the list, not on crossing from row to row.
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    ) {
                      setDropDir(null)
                    }
                  }}
                  onDrop={onDrop}
                />
              }
            >
              <DropTarget.Provider value={dropDir}>
                <CutPath.Provider value={copied?.cut ? copied.path : null}>
                  {/* No heading over the list, and no row for the root itself. The
                tree is one project's files, so a row saying which one would be
                a row every file is indented under for no answer it gives —
                which project and which branch is the bar above, where it can be
                read with the list scrolled. */}
                  {shown && folder ? (
                    <Directory
                      dir={shown.path}
                      depth={0}
                      onMenu={(entry) =>
                        setMenuTarget({ kind: "entry", entry })
                      }
                    />
                  ) : (
                    /* A workspace pointed at nothing used to draw an empty list and
                 say nothing, because `Add folder` was a button in the header
                 directly above it. It is not any more, and a blank column whose
                 only way forward is a right-click is a dead end — so the way in
                 is drawn where the files would have been. Only for a workspace
                 with no folders at all: a folder that is merely empty has a
                 root bar above it saying which one it is. */
                    folders.length === 0 && (
                      <Empty className="border-0 py-8">
                        <EmptyHeader>
                          <EmptyTitle className="text-sm">
                            {t("files.tree.noFolders")}
                          </EmptyTitle>
                          <EmptyDescription>
                            {t("files.tree.noFoldersDescription")}
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onAddFolder}
                          >
                            <FolderPlus />
                            {t("files.tree.addFolder")}
                          </Button>
                        </EmptyContent>
                      </Empty>
                    )
                  )}
                </CutPath.Provider>
              </DropTarget.Provider>
            </ContextMenuTrigger>
          </>
        )}

        {renamingFolder && (
          <RenameDialog
            title={t("files.tree.renameFolder")}
            description={(() => {
              // Split around the placeholder so the path can be set as code.
              const [before, after] = t(
                "files.tree.renameFolderDescription"
              ).split("{path}")
              return (
                <>
                  {before}
                  <code className="font-mono">{renamingFolder.path}</code>
                  {after}
                </>
              )
            })()}
            label={t("files.tree.folderName")}
            currentName={renamingFolder.name}
            onRename={async (name) => {
              try {
                await renameFolder(renamingFolder.id, name)
                return null
              } catch (error) {
                return failureOf(error, t("files.tree.couldNotRenameFolder"))
              }
            }}
            onClose={() => setRenamingFolder(null)}
          />
        )}
      </div>

      {/* The empty space under the tree is **the root's** menu.
          It was the bar above the list — the project's name, its branch and a
          checkout picker — and the bar is gone: the left column already lists
          every project and says which one is selected, so
          a strip repeating it was a row of chrome answering a question that was
          already on screen. What the bar carried had to go somewhere, and the
          empty space under the last row is the only part of this panel that is
          about the project as a whole rather than about a file in it. It acts
          on the project being read — a new file lands in the branch on
          screen — while Rename and Remove are about the workspace's record of
          the **project** being read. */}
      {menuTarget === null &&
        (shown && folder ? (
          <RootMenu
            folder={folder}
            path={shown.path}
            expanded={expanded.length > 1}
            onCreate={(kind) => {
              menuFocus.handOff()
              useFiles.getState().beginCreate(shown.path, kind)
            }}
            finalFocus={menuFocus.finalFocus}
            onRename={() => setRenamingFolder(folder)}
            onRemove={() => setRemovingFolder(folder)}
            onAddFolder={onAddFolder}
            onPaste={copied ? () => paste(shown.path) : undefined}
          />
        ) : (
          <ContextMenuContent className="w-52">
            <ContextMenuItem onClick={onAddFolder}>
              <FolderPlus />
              {t("files.tree.addFolder")}
            </ContextMenuItem>
          </ContextMenuContent>
        ))}

      {menuTarget?.kind === "entry" && (
        <ContextMenuContent
          className="w-52"
          // Rename hands focus to the field it opens — see `useMenuFocusHandoff`.
          finalFocus={menuFocus.finalFocus}
        >
          {/* Only where there is a choice to make — an SVG, a `.md` and an
              `.html` are the files the studio can honestly draw more than one
              way; offering the menu on a `.ts` would be offering the same thing
              twice. */}
          {menuTarget.entry.kind === "file" &&
            viewersFor(menuTarget.entry.path).length > 1 && (
              <>
                <ContextMenuGroup>
                  {/* Base UI throws for a label outside the group it names. */}
                  <ContextMenuLabel>
                    {t("files.tree.openWith")}
                  </ContextMenuLabel>
                  <OpenWith path={menuTarget.entry.path} />
                </ContextMenuGroup>
                <ContextMenuSeparator />
              </>
            )}
          {menuTarget.entry.kind === "directory" && (
            <>
              <ContextMenuItem
                onClick={() => {
                  menuFocus.handOff()
                  useFiles.getState().beginCreate(menuTarget.entry.path, "file")
                }}
              >
                <FilePlus />
                {t("files.tree.newFile")}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  menuFocus.handOff()
                  useFiles
                    .getState()
                    .beginCreate(menuTarget.entry.path, "directory")
                }}
              >
                <FolderPlus />
                {t("files.tree.newFolder")}
              </ContextMenuItem>
              {/* In the folder the tree is showing, so the shell's directory is
                  inside a root main already knows; `openAt` only ever gets a
                  path under it. */}
              {folder && (
                <ContextMenuItem
                  onClick={() =>
                    useShells
                      .getState()
                      .openAt(folder.id, menuTarget.entry.path)
                  }
                >
                  <SquareTerminal />
                  {t("files.tree.newTerminalHere")}
                </ContextMenuItem>
              )}
              {copied && (
                <ContextMenuItem onClick={() => paste(menuTarget.entry.path)}>
                  <ClipboardPaste />
                  {t("files.tree.paste")}
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            onClick={() =>
              setCopied({ path: menuTarget.entry.path, cut: false })
            }
          >
            <Copy />
            {t("common.copy")}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() =>
              setCopied({ path: menuTarget.entry.path, cut: true })
            }
          >
            <Scissors />
            {t("files.tree.cut")}
          </ContextMenuItem>
          {others.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput />
                {t("files.tree.copyTo")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-52">
                {others.map((other) => (
                  <ContextMenuItem
                    key={other.id}
                    onClick={() => copyTo(other.path, menuTarget.entry.path)}
                  >
                    <Folder />
                    <span className="truncate">{other.name}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() =>
              void navigator.clipboard.writeText(menuTarget.entry.path)
            }
          >
            <Link />
            {t("files.copyPath")}
          </ContextMenuItem>
          {shown && (
            <ContextMenuItem
              onClick={() =>
                void navigator.clipboard.writeText(
                  relativeTo(shown.path, menuTarget.entry.path)
                )
              }
            >
              <Link2 />
              {t("files.tree.copyRelativePath")}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() =>
              void window.desktop.revealPath(menuTarget.entry.path)
            }
          >
            <ExternalLink />
            {t("files.reveal")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              menuFocus.handOff()
              useFiles.getState().beginRename(menuTarget.entry.path)
            }}
          >
            <Pencil />
            {t("common.rename")}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onClick={() => setTrashing(menuTarget.entry)}
          >
            <Trash2 />
            {t("files.tree.moveToTrashEllipsis")}
          </ContextMenuItem>
        </ContextMenuContent>
      )}

      <AlertDialog
        open={trashing !== null}
        onOpenChange={(next) => {
          if (!next) setTrashing(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("files.tree.trashTitle", { name: trashing?.name ?? "" })}
            </AlertDialogTitle>
            {/* Says where it goes rather than "this cannot be undone", because
                it can: the OS trash is the undo, which is the whole reason
                this is not an `unlink`. */}
            <AlertDialogDescription>
              {trashing?.kind === "directory"
                ? t("files.tree.trashFolderDescription")
                : t("files.tree.trashFileDescription")}{" "}
              {t("files.tree.trashPutBack")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (trashing) {
                  void useFiles
                    .getState()
                    .trash(trashing.path)
                    .catch((error: unknown) => {
                      console.error("Could not move that to the trash", error)
                    })
                }
                setTrashing(null)
              }}
            >
              {t("files.tree.moveToTrash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dropError !== null}
        onOpenChange={(next) => {
          if (!next) setDropError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("files.tree.dropErrorTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>{dropError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removingFolder !== null}
        onOpenChange={(next) => {
          if (!next) setRemovingFolder(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("files.tree.removeFolderTitle")}
            </AlertDialogTitle>
            {/*
              The folder is the user's own — a dialog that left that in doubt
              would be asking them to gamble a repository on it. No path: a long
              one has nowhere to break and widens the dialog past its card.
            */}
            <AlertDialogDescription>
              {t("files.tree.removeFolderDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removingFolder) void removeFolder(removingFolder.id)
                setRemovingFolder(null)
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  )
}

/**
 * One of the Explorer's tabs, or one of the `Git` tab's two views inside it.
 *
 * Not the workbench's `TabStrip`, and not shadcn's `Tabs`: those are about
 * things somebody opened and can close, and these are two fixed views of one
 * project. What it borrows instead is the treatment `SideRow` gives a selected
 * row, so a tab and the row under it read as the same kind of "this is the one".
 */
function ExplorerTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {/* Nothing at all at zero, and nothing before the first read: a badge
          saying `0` has to be read to learn there is nothing to read. */}
      {count !== undefined && count > 0 && (
        <span className="font-mono text-[0.65rem] tabular-nums opacity-70">
          {count}
        </span>
      )}
    </button>
  )
}

/**
 * The viewers a file can be opened with, as a radio group.
 *
 * Its own component so the current choice is read from the store rather than
 * captured when the menu opened: picking one leaves the menu on screen for the
 * blink before it closes, and a stale tick in that moment reads as a click that
 * did not land.
 */
function OpenWith({ path }: { path: string }) {
  const current = useFiles((state) => viewOf(state, path))
  const t = useT()

  return (
    <ContextMenuRadioGroup
      value={current}
      onValueChange={(value) => {
        void useFiles.getState().setView(path, value as Viewer)
        // Opened as well as switched: the menu is reachable from a row that is
        // not the one on screen, and choosing a viewer for it plainly means
        // "show me this".
        void useFiles.getState().open(path)
      }}
    >
      {viewersFor(path).map((viewer) => (
        <ContextMenuRadioItem key={viewer} value={viewer}>
          <ViewerIcon viewer={viewer} />
          {t(VIEWER_LABELS[viewer])}
        </ContextMenuRadioItem>
      ))}
    </ContextMenuRadioGroup>
  )
}

function ViewerIcon({ viewer }: { viewer: Viewer }) {
  const Icon =
    viewer === "image"
      ? Image
      : viewer === "markdown"
        ? BookOpen
        : viewer === "html"
          ? Globe
          : viewer === "blocks"
            ? NotebookPen
            : FileCode
  return <Icon className="text-muted-foreground" />
}

/**
 * One directory's rows, and the open directories under it.
 *
 * Recursive rather than a flattened list because the shape it draws is
 * recursive and nothing here needs the flat one: the tree has no keyboard
 * navigation across rows, and every row's indent is its own depth.
 */
/**
 * The menu on the bar above the tree: the project being read, and the project
 * it belongs to.
 *
 * Split that way on purpose. `New file…`, `Refresh`, `Copy path` and `Reveal`
 * act on the **directory on screen**, which is the project — a file made here
 * while a branch is being read belongs to that branch. `Rename…` and
 * `Remove folder…` act on the workspace's record of the **project**: what the
 * studio calls it, and whether it is pointed at it at all, neither of which is
 * a property of one of its copies.
 */
function RootMenu({
  folder,
  path,
  expanded,
  onCreate,
  onRename,
  onRemove,
  onAddFolder,
  onPaste,
  finalFocus,
}: {
  folder: WorkspaceFolder
  /** The directory being read — the project folder's own path. */
  path: string
  /** Whether anything is open below the root, which is what `Collapse all` has
   * to do. The root itself is always in the set — it is read without being a
   * row — so the count rather than the set is what the panel hands down. */
  expanded: boolean
  onCreate: (kind: "file" | "directory") => void
  onRename: () => void
  onRemove: () => void
  onAddFolder: () => void
  /** Absent while nothing has been copied. */
  onPaste?: () => void
  /** New file and New folder hand focus to the field they open. */
  finalFocus: () => boolean
}) {
  const t = useT()
  return (
    <ContextMenuContent className="w-52" finalFocus={finalFocus}>
      <ContextMenuItem onClick={() => onCreate("file")}>
        <FilePlus />
        {t("files.tree.newFile")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onCreate("directory")}>
        <FolderPlus />
        {t("files.tree.newFolder")}
      </ContextMenuItem>
      {onPaste && (
        <ContextMenuItem onClick={onPaste}>
          <ClipboardPaste />
          {t("files.tree.paste")}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => void useFiles.getState().read(path)}>
        <RotateCw />
        {t("common.refresh")}
      </ContextMenuItem>
      {/* Where the header button went. It is about the tree rather than about
          this project's files, but this menu is the one the tree has — and a
          button for it beside the tabs was a button that got used once. */}
      <ContextMenuItem
        disabled={!expanded}
        onClick={() => useFiles.getState().collapseAll()}
      >
        <ChevronDown />
        {t("files.tree.collapseAll")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void navigator.clipboard.writeText(path)}>
        <Link />
        {t("files.copyPath")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void window.desktop.revealPath(path)}>
        <ExternalLink />
        {t("files.reveal")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {/* The workspace's own action, at the end and under a rule: everything
          above is about this project, and this one is about which projects
          there are. */}
      <ContextMenuItem onClick={onAddFolder}>
        <FolderPlus />
        {t("files.tree.addFolder")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onRename}>
        <Pencil />
        {t("files.tree.renameEllipsis")}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onClick={onRemove}>
        <Trash2 />
        {t("files.tree.removeNamed", { name: folder.name })}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function Directory({
  dir,
  depth,
  onMenu,
}: {
  dir: string
  depth: number
  onMenu: (entry: FileEntry) => void
}) {
  const listed = useFiles((state) => state.entries[dir])
  const showHidden = useSettings((state) => state.showHiddenFiles)
  // Dotfiles left out at the drawing, not the listing: the store's entries
  // are also what the palette and the watchers read.
  const entries = useMemo(
    () =>
      showHidden || !listed
        ? listed
        : listed.filter((entry) => !entry.name.startsWith(".")),
    [listed, showHidden]
  )
  const error = useFiles((state) => state.errors[dir])
  const loading = useFiles((state) => state.loading.includes(dir))
  const creating = useFiles((state) =>
    state.creating?.dir === dir ? state.creating.kind : null
  )
  const t = useT()

  if (error) {
    return (
      <p
        style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
        className="py-1 pr-2 text-xs text-destructive"
      >
        {error}
      </p>
    )
  }

  // At the top of the rows, the way the editors do it, and drawn whether or not
  // the listing has landed: the folder may have been opened by this very click.
  if (creating) {
    return (
      <ul>
        <li>
          <CreateRow dir={dir} kind={creating} depth={depth} />
        </li>
        {entries?.map((entry) => (
          <Row key={entry.path} entry={entry} depth={depth} onMenu={onMenu} />
        ))}
      </ul>
    )
  }

  // Nothing at all until the first listing lands, rather than a row that says
  // so: a directory on a local disk is read faster than a placeholder can be
  // read, and one that flickers past is worse than none.
  if (entries === undefined) {
    if (!loading) return null
    return (
      <p
        style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
        className="py-1 pr-2 text-xs text-muted-foreground/70"
      >
        {t("files.reading")}
      </p>
    )
  }

  // An open folder with no rows under it already says it is empty.
  if (entries.length === 0) return null

  return (
    <ul>
      {entries.map((entry) => (
        <Row key={entry.path} entry={entry} depth={depth} onMenu={onMenu} />
      ))}
    </ul>
  )
}

/**
 * A new file or folder being named, as a row in the directory it will land in.
 *
 * It was a dialog, which asked for a name in a box over the tree and said where
 * the thing would go in a line of path — the row says that by where it is. It
 * is `RenameRow` with nothing to start from, so it keeps that row's rules: Enter
 * creates, Escape and an empty field leave nothing behind, and a refused name
 * stays in the field with the reason under it.
 */
function CreateRow({
  dir,
  kind,
  depth,
}: {
  dir: string
  kind: "file" | "directory"
  depth: number
}) {
  const t = useT()
  const directory = kind === "directory"
  return (
    <RenameRow
      name=""
      indent={depth}
      label={directory ? t("files.tree.folderName") : t("files.tree.fileName")}
      lead={
        directory ? (
          <>
            <ChevronRight className="size-3.5 shrink-0" />
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        ) : (
          <>
            <span aria-hidden className="size-3.5 shrink-0" />
            <File className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )
      }
      onRename={async (name) => {
        const { create, createFolder, endCreate } = useFiles.getState()
        try {
          if (directory) await createFolder(dir, name)
          else await create(dir, name)
          endCreate()
          return null
        } catch (error) {
          return failureOf(error, t("files.tree.couldNotCreate"))
        }
      }}
      onCancel={() => useFiles.getState().endCreate()}
    />
  )
}

function Row({
  entry,
  depth,
  onMenu,
}: {
  entry: FileEntry
  depth: number
  onMenu: (entry: FileEntry) => void
}) {
  const open = useFiles((state) => state.expanded.includes(entry.path))
  const active = useFiles((state) => state.selectedId === entry.path)
  const renaming = useFiles((state) => state.renaming === entry.path)
  // Marked on the row as well as on the tab: the tree is where somebody looks
  // to find the file they were editing, and a strip with fifteen tabs in it is
  // not.
  const dirty = useFiles((state) => isDirty(state.docs[entry.path]))
  // A string or null rather than the store's own record, so a row re-renders
  // when *its* file's state changes and not when any file's does.
  const git = useGitStatus((state) => gitStateOf(state, entry.path))
  const t = useT()

  const directory = entry.kind === "directory"
  const dropDir = directory ? entry.path : parentOf(entry.path)
  const dropping = useContext(DropTarget) === entry.path && directory
  const cut = useContext(CutPath) === entry.path
  const Icon = directory
    ? open
      ? FolderOpen
      : Folder
    : isImage(entry.path)
      ? Image
      : File
  // A vendored file-type icon where there is one, and the Lucide glyph above
  // otherwise — so a coloured icon reads as "a kind of file the studio knows"
  // rather than as decoration. Folders keep the glyph either way: they are the
  // tree's structure, and forty coloured folder icons would compete with the
  // files they hold.
  const iconUrl = directory ? null : iconFor(entry.path)
  const Chevron = open ? ChevronDown : ChevronRight

  /* The row's own left-hand side, drawn the same whether the right of it is the
     name or a field being typed into — so the field opens exactly where the name
     was rather than a few pixels off it. */
  const lead = (
    <>
      {/* A file has no chevron but keeps its width, so names line up down a
          mixed listing rather than stepping in and out. */}
      {directory ? (
        <Chevron className="size-3.5 shrink-0" />
      ) : (
        <span aria-hidden className="size-3.5 shrink-0" />
      )}
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          aria-hidden
          // The icon recedes with the name for an ignored row: a full-colour
          // TypeScript logo beside a greyed `dist/bundle.ts` would be the
          // brightest thing in the subtree it is meant to play down.
          className={cn("size-3.5 shrink-0", git === "ignored" && "opacity-40")}
        />
      ) : (
        <Icon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            git === "ignored" && "opacity-60"
          )}
        />
      )}
    </>
  )

  if (renaming) {
    return (
      <li>
        <RenameRow
          name={entry.name}
          indent={depth}
          // A directory's dot is part of its name; a file's is its extension.
          selection={directory ? "all" : "stem"}
          label={
            directory ? t("files.tree.folderName") : t("files.tree.fileName")
          }
          lead={lead}
          onRename={async (name) => {
            try {
              await useFiles.getState().rename(entry.path, name)
              useFiles.getState().endRename()
              return null
            } catch (error) {
              return failureOf(error, t("files.tree.couldNotRename"))
            }
          }}
          onCancel={() => useFiles.getState().endRename()}
        />
        {directory && open && (
          <Directory dir={entry.path} depth={depth + 1} onMenu={onMenu} />
        )}
      </li>
    )
  }

  return (
    <li
      data-drop-dir={dropDir}
      className={cn(
        dropping && "bg-primary/5 ring-1 ring-primary/40 ring-inset"
      )}
    >
      <SideRow
        active={active}
        indent={depth}
        className={cn(cut && "opacity-50")}
        // The state in words as well as in colour: the hover line is the only
        // thing that says what a green name means to somebody who has not
        // learnt the palette, or who cannot see it.
        title={git ? `${entry.path} — ${t(GIT_LABELS[git])}` : entry.path}
        // A single click on a file is a **look**: the tab it opens is the
        // preview one, in italics, and the next look takes its place rather
        // than adding a tab beside it. Reading through a repository was the
        // thing that left fifteen tabs nobody had asked for.
        onClick={() =>
          directory
            ? useFiles.getState().toggle(entry.path)
            : void useFiles.getState().open(entry.path, { preview: true })
        }
        // And a double click keeps it. The first of the two clicks has already
        // opened it, so this only has to promote what is on screen.
        onDoubleClick={
          directory ? undefined : () => useFiles.getState().keep(entry.path)
        }
        onContextMenu={() => onMenu(entry)}
        // Out of the app, as the file itself: Chromium's own drag would carry
        // the row's text, and only main can hand the OS a path.
        onDragStart={(event) => {
          event.preventDefault()
          void window.desktop.startDragPath(entry.path)
        }}
      >
        {lead}
        <span
          className={cn(
            // `truncate` clips to the span's own box, and `text-xs`'s 16px
            // line is shorter than a Windows sans font's descent: the tail of
            // a `g` was cut off. The row is taller than this either way.
            "truncate leading-normal",
            dirty && "italic",
            // Git's colour, and only where git has something to say — a
            // tracked file with no changes is the ordinary row and stays the
            // sidebar's own foreground.
            git && GIT_TONES[git]
          )}
        >
          {entry.name}
        </span>
        {(dirty || (git && GIT_LETTERS[git])) && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            {dirty && (
              <span
                aria-label={t("files.tree.unsavedChanges")}
                className="size-1.5 rounded-full bg-foreground/60"
              />
            )}
            {/* Git's own letter, at the end of the row the way every editor
                draws it. `aria-hidden` because the row's hover line already
                says the state in words, and a bare "M" read out is worse than
                nothing. */}
            {git && GIT_LETTERS[git] && (
              <span
                aria-hidden
                className={cn("text-[0.7rem] leading-none", GIT_TONES[git])}
              >
                {GIT_LETTERS[git]}
              </span>
            )}
          </span>
        )}
      </SideRow>

      {directory && open && (
        <Directory dir={entry.path} depth={depth + 1} onMenu={onMenu} />
      )}
    </li>
  )
}

/** `Changes`' one-file / every-file switch for the pane (`changesStacked`). */
function ChangesAllToggle({ rootId }: { rootId: string }) {
  const t = useT()
  const all = useSettings((state) => state.changesStacked)
  return (
    <IconButton
      label={
        all ? t("files.tree.showOneChange") : t("files.tree.showAllChanges")
      }
      pressed={all}
      // `pressed` is only `aria-pressed`; the lit state is drawn, as the
      // diff's own toggles draw theirs.
      className={cn(
        "ml-auto size-6",
        all && "bg-accent text-accent-foreground"
      )}
      onClick={() => {
        useSettings.getState().setChangesStacked(!all)
        // Onto the pane, so the switch shows what it switched.
        useChanges.getState().open(rootId)
      }}
    >
      <Rows3 />
    </IconButton>
  )
}

/**
 * Both halves of what a row shows read again: what is on disk, and what git
 * says about it. One button, since "this is out of date" is one thought, and
 * the filesystems `fs.watch` is quiet on are why it exists at all. In each
 * tab's own row, where it used to sit once in the header above both.
 */
function RefreshButton({
  disabled,
  onRefresh,
}: {
  disabled: boolean
  onRefresh: () => void
}) {
  const t = useT()
  return (
    <IconButton
      label={t("common.refresh")}
      disabled={disabled}
      onClick={() => {
        onRefresh()
        void useGitStatus.getState().refreshAll()
      }}
    >
      <RotateCw />
    </IconButton>
  )
}

/** The tree's dotfiles shown or left out (`showHiddenFiles`). */
function HiddenFilesToggle() {
  const t = useT()
  const show = useSettings((state) => state.showHiddenFiles)
  return (
    <IconButton
      label={show ? t("files.tree.hideHidden") : t("files.tree.showHidden")}
      pressed={!show}
      onClick={() => useSettings.getState().setShowHiddenFiles(!show)}
    >
      {show ? <Eye /> : <EyeOff />}
    </IconButton>
  )
}
