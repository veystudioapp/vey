import type { WorkspaceFolder } from "@shared/api"

/**
 * A worktree is drawn **inside** its project, not beside it: the rail has one
 * icon per project, and the column lists the project's chats and its
 * worktrees' together, the quiet ones grouped under a heading per checkout —
 * the project's own directory first, then each worktree (`byCheckout`).
 *
 * Read off `worktreeOf` on the folder, which only `IPC.addWorktree` writes. A
 * checkout whose project has left the workspace is a project again: hiding it
 * under an icon that does not exist would lose it.
 */

/** The project a folder is drawn under: its `worktreeOf` while that is still
 * in the workspace, else itself. */
export function projectOf(
  folders: WorkspaceFolder[],
  folder: WorkspaceFolder
): WorkspaceFolder {
  if (!folder.worktreeOf) return folder
  return folders.find((entry) => entry.id === folder.worktreeOf) ?? folder
}

/** Whether a folder is drawn inside another project rather than as one. */
export function isCheckout(
  folders: WorkspaceFolder[],
  folder: WorkspaceFolder
): boolean {
  return projectOf(folders, folder) !== folder
}

/** The rail's icons: every folder that is not filed under another, in
 * workspace order. */
export function projectsIn(folders: WorkspaceFolder[]): WorkspaceFolder[] {
  return folders.filter((folder) => !isCheckout(folders, folder))
}

/**
 * `chats` split by the checkout each runs in, in `checkouts`' order, keeping
 * each one's own order. Every checkout gets a group, empty or not: the group's
 * heading is where a chat in that worktree is started, so a worktree nobody
 * has spoken in yet still needs one. A chat in none of them is dropped — the
 * caller only hands over chats of these checkouts.
 */
export function byCheckout<T extends { folderId?: string }>(
  chats: T[],
  checkouts: WorkspaceFolder[]
): { folder: WorkspaceFolder; chats: T[] }[] {
  return checkouts.map((folder) => ({
    folder,
    chats: chats.filter((chat) => chat.folderId === folder.id),
  }))
}

/** A project and its worktrees, the project first, the rest in the order they
 * were made. */
export function checkoutsOf(
  folders: WorkspaceFolder[],
  project: WorkspaceFolder
): WorkspaceFolder[] {
  return [
    project,
    ...folders.filter(
      (folder) =>
        folder.worktreeOf === project.id && isCheckout(folders, folder)
    ),
  ]
}
