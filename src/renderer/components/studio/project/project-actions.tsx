import type { ComponentType, ReactNode } from "react"
import { create } from "zustand"
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  ExternalLink,
  GitBranchPlus,
  Image as ImageIcon,
  ImageOff,
  MessageSquare,
  Pencil,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react"

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
import { useT } from "@/lib/i18n"
import { chooseProjectIcon, resetProjectIcon } from "@/lib/project-icon"
import { isCheckout, projectsIn } from "@/lib/project-checkouts"
import { useProjects } from "@/lib/projects"
import { useStudio } from "@/lib/store"
import { useShells } from "@/lib/shell/store"
import { useChats } from "@/lib/chat/store"
import type { WorkspaceFolder } from "@shared/api"
import { IconButton } from "../icon-button"
import { RenameDialog } from "../rename-dialog"
import { NewWorktreeDialog } from "./new-worktree-dialog"

/**
 * Which project a confirmation is up for, and the last refusal.
 *
 * A store rather than state on the component that asks, because two places ask
 * — a project's icon in the rail and the `…` on the column's header — and a
 * dialog owned by either is unmounted by the very removal it is confirming. One
 * `ProjectDialogs`, mounted once by the studio, draws whichever is up.
 */
type ProjectDialogsState = {
  removing: WorkspaceFolder | null
  renaming: WorkspaceFolder | null
  worktreeOf: WorkspaceFolder | null
  removingWorktree: WorkspaceFolder | null
  /** A failed worktree removal or icon change. Shown under the projects column, since
   * the confirmation that asked is gone by the time main answers. */
  failure: string | null
  set: (patch: Partial<Omit<ProjectDialogsState, "set">>) => void
}

export const useProjectDialogs = create<ProjectDialogsState>((set) => ({
  removing: null,
  renaming: null,
  worktreeOf: null,
  removingWorktree: null,
  failure: null,
  set: (patch) => set(patch),
}))

/** What a menu item is, for both menus that list a project's actions. */
type ItemProps = {
  onClick: () => void
  disabled?: boolean
  variant?: "default" | "destructive"
  children: ReactNode
}

/**
 * A project's actions, as items of whichever menu is drawing them.
 *
 * The rail's icon right-clicks to a `ContextMenu` and the header's `…` drops a
 * `DropdownMenu`; the two take the same item and separator props, so the list
 * is written once and handed the two components rather than kept twice. The
 * order is the one the old project row carried, and its destructive item says
 * "Remove", not "Delete", because the directory is the user's own and stays.
 */
export function ProjectMenuItems({
  folder,
  Item,
  Separator,
}: {
  folder: WorkspaceFolder
  Item: ComponentType<ItemProps>
  Separator: ComponentType
}) {
  const dialogs = useProjectDialogs.getState()
  const t = useT()
  // Read when the menu opens rather than subscribed to: a menu is up for one
  // decision, and the list does not move under it.
  const all = useStudio.getState().folders
  // A worktree's menu is its checkout chip's: it has no icon to move or
  // change, and its way out is `Remove worktree…` rather than a forget that
  // would leave a checkout under the app's data folder nobody can reach.
  const checkout = isCheckout(all, folder)
  // A worktree is git's, so a folder that is not a repository has none to
  // offer. Only a branch read as null hides it: one not read yet keeps the
  // item, and the dialog's own failure says so if it turns out to be wrong.
  const repository = useStudio.getState().branches[folder.id] !== null
  const folders = projectsIn(all)
  const index = folders.findIndex((entry) => entry.id === folder.id)
  // `to` is an index among the rail's icons, and the manifest's list also
  // holds the worktrees: land beside the icon that is there now.
  const move = (to: number) =>
    void useStudio.getState().moveFolder(
      folder.id,
      all.findIndex((entry) => entry.id === folders[to]?.id)
    )
  return (
    <>
      <Item
        onClick={() => void useChats.getState().create({ folderId: folder.id })}
      >
        <MessageSquare className="text-muted-foreground" />
        {t("projects.actions.newChatHere")}
      </Item>
      <Item
        onClick={() => {
          // Pointing the dock first is what makes `add` open the shell here
          // rather than in whichever project was clicked last.
          const shells = useShells.getState()
          shells.showFor(folder.id)
          shells.add()
        }}
      >
        <SquareTerminal className="text-muted-foreground" />
        {t("projects.actions.newTerminalHere")}
      </Item>
      {repository && (
        <Item onClick={() => dialogs.set({ worktreeOf: folder })}>
          <GitBranchPlus className="text-muted-foreground" />
          {t("projects.actions.newWorktree")}
        </Item>
      )}
      {!checkout && (
        <>
          <Item onClick={() => dialogs.set({ renaming: folder })}>
            <Pencil className="text-muted-foreground" />
            {t("projects.actions.rename")}
          </Item>
          <Separator />
          {/* The rail's drag, for somebody not holding a mouse. */}
          <Item disabled={index <= 0} onClick={() => move(index - 1)}>
            <ArrowUp className="text-muted-foreground" />
            {t("projects.actions.moveUp")}
          </Item>
          <Item
            disabled={index === -1 || index >= folders.length - 1}
            onClick={() => move(index + 1)}
          >
            <ArrowDown className="text-muted-foreground" />
            {t("projects.actions.moveDown")}
          </Item>
        </>
      )}
      <Separator />
      <Item onClick={() => void navigator.clipboard.writeText(folder.path)}>
        <ClipboardCopy className="text-muted-foreground" />
        {t("projects.actions.copyPath")}
      </Item>
      <Item onClick={() => void window.desktop.revealPath(folder.path)}>
        <ExternalLink className="text-muted-foreground" />
        {t("projects.actions.reveal")}
      </Item>
      <Separator />
      {checkout ? (
        <Item
          variant="destructive"
          onClick={() => dialogs.set({ removingWorktree: folder })}
        >
          <Trash2 />
          {t("projects.actions.removeWorktree")}
        </Item>
      ) : (
        <>
          <Item
            onClick={() => {
              dialogs.set({ failure: null })
              void chooseProjectIcon(folder.id).catch((error: unknown) =>
                dialogs.set({ failure: messageOf(error) })
              )
            }}
          >
            <ImageIcon className="text-muted-foreground" />
            {t("projects.actions.changeIcon")}
          </Item>
          <Item onClick={() => void resetProjectIcon(folder.id)}>
            <ImageOff className="text-muted-foreground" />
            {t("projects.actions.resetIcon")}
          </Item>
          <Separator />
          <Item
            variant="destructive"
            onClick={() => dialogs.set({ removing: folder })}
          >
            <Trash2 />
            {t("projects.actions.removeProject")}
          </Item>
        </>
      )}
    </>
  )
}

/** The confirmations and the rename, for whichever project asked. Mounted
 * once, by the studio. */
export function ProjectDialogs() {
  const { removing, renaming, worktreeOf, removingWorktree, set } =
    useProjectDialogs()
  const t = useT()

  return (
    <>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) set({ removing: null })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projects.actions.removeProjectTitle")}
            </AlertDialogTitle>
            {/* The same sentence Explorer's own dialog says: this is the same
                call, and a second wording would leave somebody comparing the
                two to work out whether their repository is at stake. */}
            <AlertDialogDescription>
              {t("projects.actions.folderStays")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing)
                  void useStudio.getState().removeFolder(removing.id)
                set({ removing: null })
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removingWorktree !== null}
        onOpenChange={(next) => {
          if (!next) set({ removingWorktree: null })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projects.actions.removeWorktreeTitle", {
                name: removingWorktree?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("projects.actions.removeWorktreeDescription")}
            </AlertDialogDescription>
            <p className="max-w-full font-mono text-xs break-all text-muted-foreground">
              {removingWorktree?.path}
            </p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removingWorktree
                set({ removingWorktree: null, failure: null })
                if (!target) return
                // Back to the project first, so the column is not left on a
                // checkout that is about to stop existing.
                if (useProjects.getState().activeFolderId === target.id) {
                  const parent = target.worktreeOf ?? null
                  if (parent) {
                    useProjects.getState().setActive(parent)
                    useShells.getState().showFor(parent)
                  }
                }
                // A shell whose cwd is inside it holds the directory open, and
                // Windows refuses to delete it. Main retries while the ptys end.
                const shells = useShells.getState()
                for (const shell of shells.shells) {
                  if (shell.folderId === target.id) shells.close(shell.id)
                }
                void useStudio
                  .getState()
                  .removeWorktree(target.id)
                  .then(() => useChats.getState().refresh())
                  .catch((error: unknown) =>
                    set({
                      failure: messageOf(error).replace(
                        /^Error invoking remote method '[^']+': (?:Error: )?/,
                        ""
                      ),
                    })
                  )
              }}
            >
              {t("projects.actions.removeWorktreeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renaming && (
        <RenameDialog
          title={t("projects.actions.renameProject")}
          label={t("projects.actions.projectName")}
          currentName={renaming.name}
          onRename={async (name) => {
            try {
              await useStudio.getState().renameFolder(renaming.id, name)
              return null
            } catch (error) {
              return error instanceof Error
                ? error.message
                : t("projects.actions.renameFailed")
            }
          }}
          onClose={() => set({ renaming: null })}
        />
      )}

      {worktreeOf && (
        <NewWorktreeDialog
          folder={worktreeOf}
          onClose={() => set({ worktreeOf: null })}
        />
      )}
    </>
  )
}

/** The last refusal, under the column it was about. It stays until the next
 * attempt or until it is shut. */
export function ProjectFailure() {
  const failure = useProjectDialogs((state) => state.failure)
  const set = useProjectDialogs((state) => state.set)
  const t = useT()
  if (!failure) return null
  return (
    <div className="flex shrink-0 items-start gap-1 border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      <p className="min-w-0 flex-1">{failure}</p>
      <IconButton
        label={t("projects.actions.dismiss")}
        onClick={() => set({ failure: null })}
        className="size-5 shrink-0"
      >
        <X className="size-3" />
      </IconButton>
    </div>
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
