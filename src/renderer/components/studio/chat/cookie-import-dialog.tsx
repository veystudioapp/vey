import { useEffect, useMemo, useState } from "react"
import { Check, FileText, Globe, Search, TriangleAlert } from "lucide-react"

import type { CookieImport, CookieSite, CookieSource } from "@shared/browser"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { IS_MAC } from "../title-bar"

/** The `From` entry that is not a browser: an exported file. */
const FILE = "file"

type Step =
  | { kind: "source" }
  | { kind: "loading" }
  | { kind: "sites"; sites: CookieSite[] }
  | { kind: "importing" }
  | { kind: "done"; result: CookieImport }

/**
 * `Import cookies…`: a browser on this machine and one of its profiles, then
 * the sites to bring over — or an exported file. Into the chat browser's one
 * profile, which every chat shares (`docs/design.md` § The chat's browser).
 *
 * Two steps because the second is the one that costs something: the sites are
 * read off the cookie database's hosts, and only the ones ticked are
 * decrypted, which is when macOS asks for the keychain. So the dialog says the
 * prompt is coming before it does.
 */
export function CookieImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [sources, setSources] = useState<CookieSource[] | null>(null)
  const [sourceId, setSourceId] = useState<string>(FILE)
  const [keep, setKeep] = useState(true)
  const [step, setStep] = useState<Step>({ kind: "source" })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.desktop.browserCookieSources().then((found) => {
      setSources(found)
      setSourceId(found[0]?.id ?? FILE)
    })
  }, [])

  const source = sources?.find((each) => each.id === sourceId) ?? null

  const next = async () => {
    setError(null)
    if (sourceId === FILE) {
      setStep({ kind: "importing" })
      const result = await window.desktop.browserImportCookies(keep)
      setStep(result.cancelled ? { kind: "source" } : { kind: "done", result })
      return
    }
    setStep({ kind: "loading" })
    const { sites, error: failed } =
      await window.desktop.browserCookieSites(sourceId)
    if (failed) {
      setError(failed)
      setStep({ kind: "source" })
      return
    }
    setStep({ kind: "sites", sites })
  }

  const importPicked = async () => {
    setStep({ kind: "importing" })
    const result = await window.desktop.browserImportFrom(
      sourceId,
      [...picked],
      keep
    )
    setStep({ kind: "done", result })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {step.kind === "sites" ? (
          <SitesStep
            sites={step.sites}
            picked={picked}
            filter={filter}
            onFilter={setFilter}
            onPicked={setPicked}
            title={t("transcript.cookies.sitesTitle")}
            description={t("transcript.cookies.sitesHint", {
              count: String(step.sites.length),
            })}
            cancel={t("transcript.cookies.back")}
            onCancel={() => setStep({ kind: "source" })}
            action={t("transcript.cookies.importSites", {
              count: String(picked.size),
            })}
            onAction={() => void importPicked()}
          />
        ) : step.kind === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("transcript.cookies.title")}</DialogTitle>
            </DialogHeader>
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-3 text-sm",
                step.result.error && "text-destructive"
              )}
            >
              {step.result.error ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              ) : (
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              )}
              <p>
                {step.result.error
                  ? t("transcript.cookies.failed", {
                      error: step.result.error,
                    })
                  : t("transcript.cookies.imported", {
                      count: String(step.result.imported),
                    })}
                {/* Said apart, because "skipped" alone read as an import
                  that had failed: most of these are cookies the browser
                  itself had already let go of. */}
                {!step.result.error &&
                  (step.result.expired ?? 0) + step.result.skipped > 0 && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("transcript.cookies.importedDetail", {
                        expired: String(step.result.expired ?? 0),
                        skipped: String(step.result.skipped),
                      })}
                    </span>
                  )}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t("transcript.cookies.done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("transcript.cookies.title")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("transcript.cookies.title")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-sm">
                {t("transcript.cookies.from")}
              </span>
              <Select
                value={sourceId}
                onValueChange={(value) => {
                  if (typeof value === "string") setSourceId(value)
                }}
                disabled={sources === null || step.kind !== "source"}
              >
                <SelectTrigger className="h-10 min-w-0 flex-1">
                  <SelectValue>
                    {() =>
                      source ? (
                        <SourceLabel source={source} />
                      ) : (
                        <FileLabel label={t("transcript.cookies.file")} />
                      )
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(sources ?? []).map((each) => (
                    <SelectItem key={each.id} value={each.id}>
                      <SourceLabel source={each} />
                    </SelectItem>
                  ))}
                  <SelectItem value={FILE}>
                    <FileLabel label={t("transcript.cookies.file")} />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-4 rounded-xl bg-muted/60 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  {t("transcript.cookies.keep")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("transcript.cookies.keepHint")}
                </span>
              </span>
              <Switch checked={keep} onCheckedChange={setKeep} />
            </label>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {sourceId === FILE
                ? t("transcript.cookies.fileHint")
                : source && IS_MAC && !source.id.startsWith("firefox:")
                  ? t("transcript.cookies.hintKeychain", {
                      browser: source.browser,
                    })
                  : t("transcript.cookies.hint")}
            </p>
            {sources !== null && sources.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("transcript.cookies.noBrowsers")}
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="secondary" onClick={onClose}>
                {t("transcript.cookies.cancel")}
              </Button>
              <Button
                disabled={step.kind !== "source" || sources === null}
                onClick={() => void next()}
              >
                {step.kind !== "source" && (
                  <Spinner className="size-3.5" aria-label="" />
                )}
                {step.kind === "importing" && source
                  ? t("transcript.cookies.waiting", { browser: source.browser })
                  : sourceId === FILE
                    ? t("transcript.cookies.chooseFile")
                    : t("transcript.cookies.import")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A list of sites to tick, filtered — what to import, or what to clear
 * (`cookie-clear-dialog.tsx`). */
export function SitesStep({
  sites,
  picked,
  filter,
  onFilter,
  onPicked,
  title,
  description,
  cancel,
  onCancel,
  action,
  onAction,
  destructive = false,
  busy = false,
}: {
  sites: CookieSite[]
  picked: Set<string>
  filter: string
  onFilter: (filter: string) => void
  onPicked: (picked: Set<string>) => void
  title: string
  description: string
  cancel: string
  onCancel: () => void
  action: string
  onAction: () => void
  destructive?: boolean
  busy?: boolean
}) {
  const t = useT()
  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return query ? sites.filter((each) => each.site.includes(query)) : sites
  }, [sites, filter])
  const allShown =
    shown.length > 0 && shown.every((each) => picked.has(each.site))

  const toggle = (site: string) => {
    const next = new Set(picked)
    if (next.has(site)) next.delete(site)
    else next.add(site)
    onPicked(next)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          placeholder={t("transcript.cookies.filter")}
          className="pl-8"
        />
      </div>
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={allShown}
            onCheckedChange={() => {
              const next = new Set(picked)
              for (const each of shown) {
                if (allShown) next.delete(each.site)
                else next.add(each.site)
              }
              onPicked(next)
            }}
          />
          {t("transcript.cookies.selectShown")}
        </label>
        <span>
          {t("transcript.cookies.picked", { count: String(picked.size) })}
        </span>
      </div>
      <ul className="-mx-1 max-h-72 overflow-y-auto">
        {shown.map((each) => (
          <li key={each.site}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox
                checked={picked.has(each.site)}
                onCheckedChange={() => toggle(each.site)}
              />
              <Globe className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{each.site}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {each.count}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("transcript.cookies.noSites")}
          </li>
        )}
      </ul>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {cancel}
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          disabled={picked.size === 0 || busy}
          onClick={onAction}
        >
          {busy && <Spinner className="size-3.5" aria-label="" />}
          {action}
        </Button>
      </DialogFooter>
    </>
  )
}

function SourceLabel({ source }: { source: CookieSource }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {source.icon ? (
        <img src={source.icon} alt="" className="size-5 shrink-0" />
      ) : (
        <Globe className="size-4 shrink-0" />
      )}
      <span className="truncate">{source.browser}</span>
      <span className="truncate text-muted-foreground">{source.profile}</span>
    </span>
  )
}

function FileLabel({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <FileText className="size-4 shrink-0" />
      {label}
    </span>
  )
}
