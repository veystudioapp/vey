import { useState } from "react"
import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { useFiles } from "@/lib/files/store"
import { nameOf } from "@/lib/files/paths"
import { useT } from "@/lib/i18n"

/**
 * Save / Don't Save / Cancel, for a file tab closed with unsaved edits.
 *
 * Mounted once by the studio and driven by `unsaved` in the files store, so
 * every way a tab is closed — its ×, a middle click, ⌘W, `Close all` — is
 * asked the same question. Several dirty files closed together are one
 * dialog, answered for all of them.
 *
 * Plain buttons rather than `AlertDialogAction`, which closes the dialog as it
 * is pressed: a Save is awaited, and one that fails stays here to say why.
 */
export function UnsavedDialog() {
  const t = useT()
  const unsaved = useFiles((state) => state.unsaved)
  const openIds = useFiles((state) => state.openIds)
  const error = useFiles((state) => state.unsavedError)
  const settle = useFiles((state) => state.settleUnsaved)
  const [saving, setSaving] = useState(false)

  const paths = unsaved.filter((entry) => openIds.includes(entry))
  const many = paths.length > 1

  return (
    <AlertDialog
      open={paths.length > 0}
      onOpenChange={(next) => {
        if (!next && !saving) void settle("cancel")
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {many
              ? t("files.unsaved.titleMany", { count: paths.length })
              : t("files.unsaved.title", { name: nameOf(paths[0] ?? "") })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("files.unsaved.description")}
          </AlertDialogDescription>
          {many && (
            <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
              {paths.map((entry) => (
                <li key={entry} title={entry} className="truncate">
                  {nameOf(entry)}
                </li>
              ))}
            </ul>
          )}
        </AlertDialogHeader>

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <AlertDialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => void settle("discard")}
          >
            {t("files.unsaved.discard")}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void settle("cancel")}
            >
              {t("common.cancel")}
            </Button>
            <Button
              autoFocus
              disabled={saving}
              onClick={() => {
                setSaving(true)
                void settle("save").finally(() => setSaving(false))
              }}
            >
              {saving && <Spinner />}
              {many ? t("files.unsaved.saveMany") : t("files.unsaved.save")}
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
