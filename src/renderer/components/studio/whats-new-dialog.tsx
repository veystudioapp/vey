import { useEffect, useState } from "react"
import { ArrowUpRight, PartyPopper } from "lucide-react"

import type { ReleaseNote } from "@shared/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSettings } from "@/lib/settings"
import { whatsNewOf } from "@/lib/whats-new"
import { useT } from "@/lib/i18n"
import { MarkdownView } from "./markdown-view"

/**
 * "Vey is now 1.0.19", once, on the first launch after an update — with
 * the notes of every release since the one last seen.
 *
 * The one thing the updater pops up, and only after the fact: the update was
 * asked for, through the pill, so saying what it brought is the end of that
 * gesture rather than an interruption of something else. A release *being
 * available* still never opens anything (`lib/updates.ts`).
 *
 * `ready` is `Studio` saying the launch screen, the setup screen and the tour
 * are all out of the way. Recorded as seen the moment it opens, not when it is
 * closed: a quit with the dialog up has still shown it. A failed fetch records
 * nothing, so an update installed offline is announced on the next launch that
 * can reach GitHub — with that release's notes and any after it.
 */
export function WhatsNewDialog({ ready }: { ready: boolean }) {
  const loaded = useSettings((state) => state.loaded)
  const seen = useSettings((state) => state.seenVersion)
  const onboarded = useSettings((state) => state.onboarded)
  const setSeenVersion = useSettings((state) => state.setSeenVersion)
  const [shown, setShown] = useState<{
    version: string
    releases: ReleaseNote[]
  } | null>(null)
  const [open, setOpen] = useState(false)
  const t = useT()

  useEffect(() => {
    // Decided as soon as the settings are read rather than at `ready`: a first
    // launch has to be recorded while `onboarded` still says it is one, and the
    // tour that comes before `ready` is what sets it.
    if (!loaded) return
    let cancelled = false
    void (async () => {
      const current = await window.desktop.appVersion()
      const next = whatsNewOf(current, seen, onboarded)
      if (cancelled || next.kind === "nothing") return
      if (next.kind === "record") {
        setSeenVersion(current)
        return
      }
      if (!ready) return
      let releases: ReleaseNote[]
      try {
        releases = await window.desktop.releaseNotes(next.since)
      } catch (error) {
        console.warn("Could not fetch the release notes", error)
        return
      }
      if (cancelled) return
      // Nothing published for this build — one run from a checkout, ahead of
      // the latest release — is recorded and not announced: a dialog with no
      // notes in it says only that a number changed.
      if (releases.length > 0) {
        setShown({ version: current, releases })
        setOpen(true)
      }
      // Last: it changes `seen`, which re-runs this effect and cancels the run
      // still inside it.
      setSeenVersion(current)
    })()
    return () => {
      cancelled = true
    }
  }, [loaded, ready, seen, onboarded, setSeenVersion])

  if (!shown) return null
  const latest = shown.releases[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="relative flex flex-col items-center gap-3 bg-linear-to-b from-primary/12 to-transparent px-6 pt-7 pb-4">
          <span className="relative flex size-12 animate-pop items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <PartyPopper className="size-6" />
          </span>
          <DialogHeader className="items-center gap-1 text-center">
            <DialogTitle className="text-lg font-semibold">
              {t("nav.whatsNew.title", { version: shown.version })}
            </DialogTitle>
            <DialogDescription>
              {t("nav.whatsNew.description", {
                count: shown.releases.length,
              })}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto px-6 pb-4">
          {shown.releases.map((release) => (
            <section key={release.version}>
              {/* A heading per release only when there is more than one —
                  the title already names a lone one. */}
              {shown.releases.length > 1 && (
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                  {release.version}
                </h3>
              )}
              <MarkdownView source={release.notes} className="text-sm" />
            </section>
          ))}
        </div>

        {/* `mx-0 mb-0`: the footer's own negative margins undo the content's
            `p-4`, which this content has set to nothing — left in, they push
            the footer half out of the clipped box. */}
        <DialogFooter className="mx-0 mb-0 items-center px-6 py-3 sm:justify-between">
          {/* An anchor, not an IPC call: main's window-open handler is what
              hands an http(s) link to the browser. */}
          <a
            href={latest?.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("nav.whatsNew.releasePage")}
            <ArrowUpRight className="size-3" />
          </a>
          <Button size="sm" onClick={() => setOpen(false)}>
            {t("nav.whatsNew.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
