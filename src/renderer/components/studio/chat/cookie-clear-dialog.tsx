import { useEffect, useState } from "react"
import { Check } from "lucide-react"

import type { CookieSite } from "@shared/browser"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/lib/i18n"
import { SitesStep } from "./cookie-import-dialog"

/**
 * `Clear cookies…`: the sites the chat browser has cookies for, to sign out
 * of — some, or all of them. The profile is every chat's, so this signs every
 * chat's browser out at once (`docs/design.md` § The chat's browser).
 *
 * Every site ticked is sent as "all", which clears the profile's storage too:
 * a site that keeps its session in `localStorage` is not signed out by its
 * cookies going.
 */
export function CookieClearDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [sites, setSites] = useState<CookieSite[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [busy, setBusy] = useState(false)
  const [removed, setRemoved] = useState<number | null>(null)

  useEffect(() => {
    void window.desktop.browserOwnCookieSites().then(setSites)
  }, [])

  const every =
    sites !== null && sites.length > 0 && picked.size === sites.length

  const clearPicked = async () => {
    setBusy(true)
    try {
      setRemoved(
        await window.desktop.browserClearCookies(every ? null : [...picked])
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {removed !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("transcript.cookies.clearTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex items-start gap-2.5 rounded-lg border px-3 py-3 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                {t("transcript.cookies.cleared", { count: String(removed) })}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t("transcript.cookies.done")}</Button>
            </DialogFooter>
          </>
        ) : sites === null ? (
          <div className="grid h-40 place-items-center">
            <Spinner className="size-4" aria-label="" />
          </div>
        ) : sites.length === 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("transcript.cookies.clearTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("transcript.cookies.nothingToClear")}
            </p>
            <DialogFooter>
              <Button onClick={onClose}>{t("transcript.cookies.done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <SitesStep
            sites={sites}
            picked={picked}
            filter={filter}
            onFilter={setFilter}
            onPicked={setPicked}
            title={t("transcript.cookies.clearTitle")}
            description={t("transcript.cookies.clearHint", {
              count: String(sites.length),
            })}
            cancel={t("transcript.cookies.cancel")}
            onCancel={onClose}
            action={
              every
                ? t("transcript.cookies.clearAll")
                : t("transcript.cookies.clearSites", {
                    count: String(picked.size),
                  })
            }
            onAction={() => void clearPicked()}
            destructive
            busy={busy}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
