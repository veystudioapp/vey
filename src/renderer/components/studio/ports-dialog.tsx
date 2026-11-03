import { useCallback, useEffect, useState } from "react"
import { AlertCircle, RotateCw, Search } from "lucide-react"

import type { ListeningPort } from "@shared/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** How long a SIGTERM is given before the list is read again: long enough
 * for a dev server to close its socket, short enough not to feel like a wait. */
const SETTLE_MS = 700

/**
 * The ports in use, and a Stop for whatever holds one — for the `EADDRINUSE`
 * left behind by a dev server that outlived its terminal, without
 * `lsof -i :3000` and `kill` pasted into a shell.
 *
 * Read when opened and after every stop, not polled: the question is asked at
 * a moment, and a list that reshuffles under the pointer is one where the
 * wrong row gets stopped. Stop is a SIGTERM; a process still listening after
 * it is offered Force quit, which is the SIGKILL nobody should reach for
 * first.
 */
export function PortsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [ports, setPorts] = useState<ListeningPort[] | null>(null)
  // True from the start: the dialog opens on a read already under way.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  /** The pid being stopped right now. */
  const [stopping, setStopping] = useState<number | null>(null)
  /** Pids a SIGTERM did not stop — offered Force quit instead. */
  const [stubborn, setStubborn] = useState<number[]>([])

  /** Takes a read's answer — the list, or why there is none. */
  const settle = useCallback(
    (listed: ListeningPort[] | null, failure?: unknown) => {
      if (listed) setPorts(listed)
      setError(listed ? null : messageOf(failure))
      setLoading(false)
      return listed
    },
    []
  )

  // The opening read, answered in callbacks: an unmounted dialog takes none.
  useEffect(() => {
    let alive = true
    void window.desktop.listPorts().then(
      (listed) => alive && settle(listed),
      (failure: unknown) => alive && settle(null, failure)
    )
    return () => {
      alive = false
    }
  }, [settle])

  /** A Refresh, and the re-read after a Stop. */
  async function load() {
    setLoading(true)
    try {
      return settle(await window.desktop.listPorts())
    } catch (failure) {
      return settle(null, failure)
    }
  }

  async function stop(pid: number, force: boolean) {
    setStopping(pid)
    setError(null)
    try {
      await window.desktop.stopPortProcess(pid, force)
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      const listed = await load()
      const alive = listed?.some((entry) => entry.pid === pid) ?? false
      setStubborn((state) =>
        alive
          ? [...new Set([...state, pid])]
          : state.filter((entry) => entry !== pid)
      )
    } catch (failure) {
      setError(messageOf(failure))
      void load()
    } finally {
      setStopping(null)
    }
  }

  const query = filter.trim().toLowerCase()
  const shown = (ports ?? []).filter(
    (entry) =>
      !query ||
      String(entry.port).includes(query) ||
      entry.command.toLowerCase().includes(query) ||
      String(entry.pid) === query ||
      (entry.args ?? "").toLowerCase().includes(query)
  )

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("nav.ports.title")}</DialogTitle>
          <DialogDescription>{t("nav.ports.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="flex h-8 flex-1 items-center gap-1.5 rounded-md border px-2 focus-within:ring-1 focus-within:ring-ring">
            <Search
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <input
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("nav.ports.filter")}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? <Spinner /> : <RotateCw />}
            {t("nav.ports.refresh")}
          </Button>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="max-h-[55vh] min-h-24 overflow-y-auto rounded-md border">
          {ports === null ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("nav.ports.reading")}
            </p>
          ) : shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {query
                ? t("nav.ports.noMatch", { query: filter.trim() })
                : t("nav.ports.none")}
            </p>
          ) : (
            <ul className="divide-y">
              {shown.map((entry) => (
                <PortRow
                  key={`${entry.pid}:${entry.port}`}
                  entry={entry}
                  stopping={stopping === entry.pid}
                  busy={stopping !== null}
                  stubborn={stubborn.includes(entry.pid)}
                  onStop={(force) => void stop(entry.pid, force)}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PortRow({
  entry,
  stopping,
  busy,
  stubborn,
  onStop,
}: {
  entry: ListeningPort
  stopping: boolean
  busy: boolean
  stubborn: boolean
  onStop: (force: boolean) => void
}) {
  const t = useT()
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="w-14 shrink-0 font-mono text-sm font-medium tabular-nums">
        {entry.port}
      </span>
      <span className="min-w-0 flex-1" title={entry.args}>
        <span className="flex items-baseline gap-2 text-xs">
          <span className="truncate font-medium">
            {entry.command || t("nav.ports.unknown")}
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {t("nav.ports.pid", { pid: entry.pid })}
          </span>
          <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
            {entry.address}
          </span>
        </span>
        {entry.args && (
          <span className="block truncate font-mono text-[0.65rem] text-muted-foreground">
            {entry.args}
          </span>
        )}
      </span>
      {entry.self ? (
        <span className="shrink-0 text-[0.65rem] text-muted-foreground">
          {t("nav.ports.self")}
        </span>
      ) : (
        <Button
          variant={stubborn ? "destructive" : "outline"}
          size="sm"
          disabled={busy}
          title={
            stubborn ? t("nav.ports.forceTitle") : t("nav.ports.stopTitle")
          }
          onClick={() => onStop(stubborn)}
          className={cn("shrink-0", stopping && "pointer-events-none")}
        >
          {stopping && <Spinner />}
          {stubborn ? t("nav.ports.force") : t("nav.ports.stop")}
        </Button>
      )}
    </li>
  )
}

/** A rejected `invoke` without Electron's wrapping, which names the channel. */
function messageOf(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : String(failure)
  return message.replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ""
  )
}
