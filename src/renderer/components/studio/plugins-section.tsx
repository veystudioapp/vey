import { useEffect, useState } from "react"
import {
  FileArchive,
  FolderOpen,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n"
import { isOn, usePlugins, type PluginStatus } from "@/lib/plugins/store"
import { cn } from "@/lib/utils"

import { IconButton } from "./icon-button"
import { OfficialBadge } from "./official-badge"
import { PanelHeader } from "./panel-header"
import { PluginIcon } from "./plugin-icon"

/**
 * Off for now: the install buttons are hidden rather than deleted, so the
 * install path in the store and main still compiles and tests the same.
 */
const SHOW_PLUGIN_INSTALL = false

/**
 * The left column's Plugins — the rail's puzzle piece, a view of the column the
 * way Search is (`SidebarView`). It was a page of Settings; a plugin is
 * something the studio *does* rather than a preference about how it looks, and
 * the switch that turns the editor's ESLint off belongs one click from the
 * editor, not three.
 *
 * The built-in plugins, then the ones installed from a folder or a `.zip`.
 * An installed plugin arrives **off** — picking a folder is not the decision
 * to run it. There is no warning line: with installing hidden
 * (`SHOW_PLUGIN_INSTALL`) every plugin listed is one the app ships, and a
 * caution about code of unknown origin had nothing in the list to be about.
 * It comes back with the install buttons.
 */
export function PluginsSection() {
  const plugins = usePlugins((state) => state.plugins)
  const enabled = usePlugins((state) => state.enabled)
  const disabled = usePlugins((state) => state.disabled)
  const status = usePlugins((state) => state.status)
  const refresh = usePlugins((state) => state.refresh)
  const setEnabled = usePlugins((state) => state.setEnabled)
  const reload = usePlugins((state) => state.reload)
  const install = usePlugins((state) => state.install)
  const remove = usePlugins((state) => state.remove)
  const t = useT()
  /** What the last install or removal said: which plugin, or why not. */
  const [outcome, setOutcome] = useState<{
    text: string
    failed: boolean
  } | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const installFrom = async (source: "folder" | "zip") => {
    setInstalling(true)
    try {
      const installed = await install(source)
      if (installed) {
        setOutcome({
          text: installed.replaced
            ? t("nav.plugins.updated", { name: installed.name })
            : t("nav.plugins.installed", { name: installed.name }),
          failed: false,
        })
      }
    } catch (error) {
      setOutcome({ text: messageOfError(error), failed: true })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={t("nav.plugins.title")}>
        <IconButton label={t("common.refresh")} onClick={() => void refresh()}>
          <RotateCw />
        </IconButton>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {SHOW_PLUGIN_INSTALL && (
          <div className="space-y-2 border-b p-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={installing}
                onClick={() => void installFrom("folder")}
              >
                <FolderOpen className="size-3.5" />
                {t("nav.plugins.installFolder")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={installing}
                onClick={() => void installFrom("zip")}
              >
                <FileArchive className="size-3.5" />
                {t("nav.plugins.installZip")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("nav.plugins.installHint")}
            </p>
          </div>
        )}

        {/* `polite` so a screen reader hears how an install or a removal went,
            which is otherwise a dialog closing and nothing else. */}
        {outcome && (
          <p
            aria-live="polite"
            className={cn(
              "border-b px-3 py-2 text-xs",
              outcome.failed ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {outcome.text}
          </p>
        )}

        {plugins.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {t("nav.plugins.empty")}
          </p>
        ) : (
          <ul className="divide-y border-b">
            {plugins.map((plugin) => {
              const on = isOn(plugin, { enabled, disabled })
              const state = status[plugin.id]
              const problem = plugin.error ?? failureOf(state)
              return (
                <li key={plugin.id} className="group space-y-1 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <PluginIcon plugin={plugin} />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {plugin.manifest?.name ?? plugin.id}
                      </span>
                      {plugin.manifest && (
                        <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                          {plugin.manifest.version}
                        </span>
                      )}
                      {plugin.bundled && <OfficialBadge />}
                    </span>
                    {/* Reload and Remove only on hover or focus: the row's one
                        standing control is the switch, and three per row down a
                        narrow column read as a toolbar. */}
                    <div className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      {on && (
                        <IconButton
                          label={t("common.reload")}
                          onClick={() => void reload(plugin.id)}
                        >
                          <RefreshCw />
                        </IconButton>
                      )}
                      {/* A built-in plugin is switched off, never removed: it
                          is part of the app, and the next update would bring
                          it back. */}
                      {!plugin.bundled && (
                        <IconButton
                          label={t("common.remove")}
                          className="hover:text-destructive"
                          onClick={() =>
                            void remove(plugin.id).catch((error: unknown) =>
                              setOutcome({
                                text: messageOfError(error),
                                failed: true,
                              })
                            )
                          }
                        >
                          <Trash2 />
                        </IconButton>
                      )}
                    </div>
                    <Switch
                      aria-label={plugin.manifest?.name ?? plugin.id}
                      checked={on}
                      disabled={
                        (!on && plugin.error !== null) ||
                        state?.state === "loading"
                      }
                      onCheckedChange={(next) =>
                        void setEnabled(plugin.id, next)
                      }
                    />
                  </div>
                  {/* Under the name rather than under the icon: `pl-6` is the
                      icon's 16px and the row's gap. */}
                  <p
                    className={cn(
                      "pl-6 text-xs leading-relaxed",
                      problem ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {problem ?? plugin.manifest?.description ?? plugin.id}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function failureOf(status: PluginStatus | undefined): string | null {
  return status?.state === "failed" ? status.error : null
}

/** What crossed the bridge as an error, without Electron's `Error invoking
 * remote method '…':` in front of the sentence main wrote. */
function messageOfError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
}
