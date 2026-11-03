import { useState, type ReactNode } from "react"
import { AlertCircle, FolderOpen, FolderPlus, FolderX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

import * as repo from "@/lib/workspace"
import { useStudio } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"

/** The directory's own name, which is what the project is called. */
function basename(target: string): string {
  return (
    target
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() ?? target
  )
}

/**
 * Whether a drag in progress is a folder or a file, from what `dragover` is
 * allowed to see — the items' kinds and MIME types, not their entries, which
 * the browser only hands over on drop. A folder has no type; neither does a
 * file of a kind macOS does not know, so an empty type is let through as a
 * folder and checked again on drop. More than one thing dragged is refused:
 * the dialog adds one folder.
 */
function draggedKind(transfer: DataTransfer): "folder" | "file" {
  const items = [...transfer.items].filter((item) => item.kind === "file")
  if (items.length !== 1) return "file"
  return items[0]!.type === "" ? "folder" : "file"
}

/**
 * Adds a project: a folder already on this machine, or a new empty one.
 *
 * Two choices and nothing to fill in. Each goes straight to the system's own
 * panel and adds what comes back, named after its directory — a name is
 * changed afterwards from the project's menu, which is where it is changed
 * for every other project too. The path and name fields this had were a
 * second, typed way to say what the panel already says.
 *
 * The folder is worked on where it is, not copied: that is stated because it
 * is the one thing about this that could surprise someone.
 *
 * A failure — a folder already added, a name already taken — is shown here and
 * leaves the dialog open, so the other choice is still one click away.
 */
export function AddFolderDialog({ onClose }: { onClose: () => void }) {
  const addFolder = useStudio((state) => state.addFolder)
  const t = useT()

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"browse" | "create" | null>(null)
  /** What is being dragged over Browse, as far as can be told. */
  const [dragging, setDragging] = useState<"folder" | "file" | null>(null)

  async function add(
    kind: "browse" | "create",
    pick: () => Promise<string | null>
  ) {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      const chosen = await pick()
      if (!chosen) return
      await addFolder({ path: chosen, name: basename(chosen) })
      onClose()
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure)
      // Electron's own wrapping of a rejected `invoke`, which says which
      // channel failed — nothing somebody adding a folder can act on.
      setError(
        message.replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          ""
        )
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("nav.addFolder.title")}</DialogTitle>
          <DialogDescription>
            {t("nav.addFolder.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {/* A folder dragged in from Finder has a real path, and
              `getPathForFile` gives it — a directory as much as a file. */}
          <Choice
            icon={
              dragging === "file" ? (
                <FolderX className="size-4.5" />
              ) : (
                <FolderOpen className="size-4.5" />
              )
            }
            label={
              dragging === "folder"
                ? t("nav.addFolder.dropToAdd")
                : dragging === "file"
                  ? t("nav.addFolder.onlyFolders")
                  : t("nav.addFolder.browse")
            }
            hint={
              dragging === "file"
                ? t("nav.addFolder.dragParent")
                : t("nav.addFolder.browseHint")
            }
            busy={busy === "browse"}
            disabled={busy !== null}
            onClick={() => void add("browse", repo.pickDirectory)}
            onDragOver={(event) => {
              event.preventDefault()
              const kind = draggedKind(event.dataTransfer)
              // `none` is what puts the no-entry cursor up and keeps the
              // drop from firing at all.
              event.dataTransfer.dropEffect = kind === "file" ? "none" : "copy"
              setDragging(kind)
            }}
            onDragLeave={() => setDragging(null)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(null)
              // Asked again here, where it can be answered for certain: a
              // file with no MIME type passes `draggedKind`.
              const entry = event.dataTransfer.items[0]?.webkitGetAsEntry()
              if (entry && !entry.isDirectory) {
                setError(t("nav.addFolder.onlyFoldersError"))
                return
              }
              const file = event.dataTransfer.files[0]
              const dropped = file ? window.desktop.getPathForFile(file) : ""
              if (dropped) void add("browse", async () => dropped)
            }}
            className={cn(
              dragging === "folder" && "border-primary bg-primary/10",
              dragging === "file" &&
                "cursor-not-allowed border-destructive/60 bg-destructive/5 text-destructive"
            )}
          />
          <Choice
            icon={<FolderPlus className="size-4.5" />}
            label={t("nav.addFolder.newDirectory")}
            hint={t("nav.addFolder.newDirectoryHint")}
            busy={busy === "create"}
            disabled={busy !== null}
            onClick={() => void add("create", repo.createProjectDirectory)}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-[0.7rem] text-muted-foreground">
            {t("nav.addFolder.removeNote")}
          </p>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One of the two ways in: an icon, what it does, and a line on what it is. */
function Choice({
  icon,
  label,
  hint,
  busy,
  className,
  ...button
}: {
  icon: ReactNode
  label: string
  hint: string
  busy: boolean
  className?: string
} & Omit<React.ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      {...button}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
        className
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        {busy ? <Spinner /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  )
}
