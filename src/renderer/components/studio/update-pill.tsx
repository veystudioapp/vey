import { useState } from "react"
import { ArrowUpCircle } from "lucide-react"

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
import { installLabel, pendingUpdate, useUpdates } from "@/lib/updates"
import { useT } from "@/lib/i18n"
import { UpdateProgressBar } from "./update-progress"

/**
 * "Update to 1.0.20", in the status bar, and the sheet that explains what
 * pressing it does.
 *
 * In the footer beside the machine's meters rather than as a banner over the
 * workbench, and for the same reason those are there: this is a thing to
 * glance at. A release is not an event in whatever the user is in the middle
 * of, and an app that says so by covering the composer has misjudged whose
 * time is whose. The pill is gone entirely when there is nothing to install —
 * "you are up to date" is not news, and Settings › Updates is where somebody
 * who wants to hear it anyway can ask.
 *
 * The confirmation is not ceremony: the install quits the app. Anything
 * unsaved in a terminal or a running process goes with it, and a one-click
 * pill that did that without saying so would be a trap.
 */
export function UpdatePill() {
  const update = useUpdates((state) => pendingUpdate(state))
  const installing = useUpdates((state) => state.installing)
  const progress = useUpdates((state) => state.progress)
  const error = useUpdates((state) => state.error)
  const install = useUpdates((state) => state.install)
  const dismiss = useUpdates((state) => state.dismiss)
  const [open, setOpen] = useState(false)
  const t = useT()

  if (!update) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("nav.update.pillTitle", {
          version: update.version,
          current: update.current,
        })}
        className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-medium text-primary outline-none hover:bg-primary/20 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowUpCircle className="size-3 shrink-0" />
        {/* The percentage reaches the pill too, not only the sheet: the sheet
            can be closed while the download runs, and this is then the one
            thing on screen saying it still is. */}
        {installing
          ? installLabel(installing, progress)
          : t("nav.update.pill", { version: update.version })}
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("nav.update.confirmTitle", { version: update.version })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {!update.installable ? (
                t("nav.update.notInstallable")
              ) : window.desktop.platform === "win32" ? (
                t("nav.update.windows", { version: update.version })
              ) : (
                <>
                  {t("nav.update.macBefore", { version: update.version })}{" "}
                  <code className="font-mono">/Applications</code>{" "}
                  {t("nav.update.macMiddle")}{" "}
                  <code className="font-mono">install.sh</code>{" "}
                  {t("nav.update.macAfter")}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* An anchor, not an IPC call: main's window-open handler is what
              hands an http(s) link to the browser. */}
          <p className="text-xs text-muted-foreground">
            {t("nav.update.youAreOn", { current: update.current })}{" "}
            <a
              href={update.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t("nav.update.whatsNewIn", { version: update.version })}
            </a>
          </p>

          {installing && (
            <div className="space-y-1.5">
              <UpdateProgressBar progress={progress} />
              <p className="text-xs text-muted-foreground">
                {progress?.stage === "installing"
                  ? t("nav.update.quitting")
                  : t("nav.update.downloading", { version: update.version })}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs leading-relaxed text-destructive">{error}</p>
          )}

          <AlertDialogFooter>
            {/* Dismissing is per version, and says so — the pill comes back
                for the next release rather than never again. */}
            <AlertDialogCancel onClick={() => dismiss()}>
              {t("nav.update.skip", { version: update.version })}
            </AlertDialogCancel>
            {update.installable ? (
              <AlertDialogAction
                disabled={installing}
                onClick={(event) => {
                  // Held open: if the installer will not start, its message is
                  // the only thing that says why, and this dialog is where it
                  // is drawn.
                  event.preventDefault()
                  void install()
                }}
              >
                {installLabel(installing, progress)}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                render={
                  <a href={update.url} target="_blank" rel="noreferrer" />
                }
              >
                {t("nav.update.openRelease")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
