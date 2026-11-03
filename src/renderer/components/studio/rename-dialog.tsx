import { useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n"

/**
 * Renames something that has a name and a call behind it, from wherever the
 * rename was asked for.
 *
 * It lived under `components/studio/db/` while a table and a column were its
 * two callers; the Explorer's tree is the one left, and it moved up here rather
 * than into `files/` because nothing about it is a file's.
 *
 * Mount it only while renaming (`{renaming && <RenameDialog …>}`): the current
 * name seeds the field once, on mount, rather than being kept in sync with a
 * value the user is in the middle of editing.
 *
 * It can also ask for a new thing's name, with `currentName=""` and its own
 * verb. The Explorer's New file and New folder did, and name a row in the tree
 * instead now (`CreateRow` in `files/file-tree.tsx`).
 *
 * The name opens **selected**, so the first keystroke replaces it: this is asking
 * for a different name, and a caret at one end of the old one leaves it to be
 * selected by hand before that can be typed. All of it, since nothing this
 * dialog renames has an extension — a file does, and a file is renamed in its
 * row in the tree rather than here (`files/file-tree.tsx`).
 */
export function RenameDialog({
  title,
  description,
  label,
  currentName,
  submitLabel,
  pendingLabel,
  onRename,
  onClose,
}: {
  title: string
  /** For a rename whose reach is not obvious — a workspace folder's name is
   * the studio's own label and not the directory on disk, and the dialog is
   * where that has to be said. */
  description?: ReactNode
  /** The accessible name for the field, e.g. "Table name". */
  label: string
  currentName: string
  /** What the confirm button says, and what it says while it is working. */
  submitLabel?: string
  pendingLabel?: string
  /** Resolves to an error message on failure, which is shown in the dialog so
   * the name can be fixed instead of retyped. */
  onRename: (name: string) => Promise<string | null>
  onClose: () => void
}) {
  const t = useT()
  const [name, setName] = useState(currentName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = useRef<HTMLInputElement>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !name.trim() || name === currentName) return
    setBusy(true)
    setError(null)
    const failure = await onRename(name)
    setBusy(false)
    if (failure) setError(failure)
    else onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {/* The field is named here rather than focused in an effect: the popup
       * is portalled, so the field is not in the DOM yet when this mounts, and
       * the dialog's own focus would land on the popup instead. */}
      <DialogContent initialFocus={field}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            ref={field}
            value={name}
            // Selected when the dialog takes focus, so the old name is what the
            // first keystroke replaces. Focus happens once on open, so typing
            // after that is not swallowed.
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
            aria-label={label}
            className="font-mono"
          />
          {error && (
            <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy
                ? (pendingLabel ?? t("nav.rename.renaming"))
                : (submitLabel ?? t("common.rename"))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
