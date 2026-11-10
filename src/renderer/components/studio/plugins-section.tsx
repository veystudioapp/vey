import { useEffect, useState } from "react"
import {
  ExternalLink,
  FileArchive,
  FolderOpen,
  Puzzle,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react"

import {
  marketplaceActionOf,
  matchesPlugin,
  type MarketplacePlugin,
} from "@shared/marketplace"
import type { PluginInfo, PluginSource } from "@shared/plugins"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import {
  isOn,
  messageOfBridge,
  usePlugins,
  type PluginStatus,
} from "@/lib/plugins/store"
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
 * Two tabs under one search box: `Installed` — the built-in plugins, then the
 * user's — and `Marketplace`, the catalog main reads (`main/marketplace.ts`),
 * each entry with its Install or Update. An installed plugin arrives **off**,
 * from the marketplace as from a folder: Install fetches the code, the switch
 * is the decision to run it. The caution about code of somebody else's sits
 * over the marketplace's list, which is where that code comes from.
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
  const loadCatalog = usePlugins((state) => state.loadCatalog)
  const t = useT()
  const [tab, setTab] = useState<"installed" | "marketplace">("installed")
  const [query, setQuery] = useState("")
  /** The marketplace entry being downloaded, so its button says so. */
  const [busyId, setBusyId] = useState<string | null>(null)
  /** What the last install or removal said: which plugin, or why not. */
  const [outcome, setOutcome] = useState<{
    text: string
    failed: boolean
  } | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Read the first time the tab is opened, not at launch: most launches never
  // look at it, and it is a request to GitHub.
  useEffect(() => {
    if (tab === "marketplace") void loadCatalog()
  }, [tab, loadCatalog])

  const installFrom = async (source: PluginSource) => {
    setInstalling(true)
    if (typeof source === "object") setBusyId(source.marketplace)
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
      setOutcome({ text: messageOfBridge(error), failed: true })
    } finally {
      setInstalling(false)
      setBusyId(null)
    }
  }

  const shown = plugins.filter((plugin) =>
    matchesPlugin(
      {
        id: plugin.id,
        name: plugin.manifest?.name ?? plugin.id,
        description: plugin.manifest?.description,
        author: plugin.manifest?.author,
      },
      query
    )
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={t("nav.plugins.title")}>
        <IconButton
          label={t("common.refresh")}
          onClick={() =>
            void (tab === "marketplace" ? loadCatalog(true) : refresh())
          }
        >
          <RotateCw />
        </IconButton>
      </PanelHeader>

      <div className="space-y-2 border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("nav.plugins.search")}
            aria-label={t("nav.plugins.search")}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value === "marketplace" ? "marketplace" : "installed")
          }
        >
          <TabsList className="h-7 w-full">
            <TabsTrigger value="installed" className="text-xs">
              {t("nav.plugins.installedTab")}
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="text-xs">
              {t("nav.plugins.marketplaceTab")}
            </TabsTrigger>
          </TabsList>
          {/* No panels: the lists are drawn below, so the outcome line and
              the scroll area are one for both tabs. */}
        </Tabs>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {SHOW_PLUGIN_INSTALL && tab === "installed" && (
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

        {tab === "marketplace" ? (
          <MarketplaceList
            query={query}
            plugins={plugins}
            busyId={busyId}
            disabled={installing}
            onInstall={(id) => void installFrom({ marketplace: id })}
          />
        ) : shown.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {query ? t("nav.plugins.noMatch") : t("nav.plugins.empty")}
          </p>
        ) : (
          <ul className="divide-y border-b">
            {shown.map((plugin) => {
              const on = isOn(plugin, { enabled, disabled })
              const state = status[plugin.id]
              const problem = plugin.error ?? failureOf(state)
              return (
                <li key={plugin.id} className="group space-y-1 px-3 py-2.5">
                  {/* `h-6` is the icon buttons' height: without it the row
                      shrinks by 4px whenever Reload leaves with the switch. */}
                  <div className="flex h-6 items-center gap-2">
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
                                text: messageOfBridge(error),
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

/**
 * The marketplace's tab: the catalog, searched, each entry with what can be
 * done about it given what is installed under its id. No icons here — an
 * entry's would be a picture off somebody's server, fetched by merely opening
 * the tab; the plugin's own icon shows once it is installed.
 */
function MarketplaceList({
  query,
  plugins,
  busyId,
  disabled,
  onInstall,
}: {
  query: string
  plugins: PluginInfo[]
  busyId: string | null
  disabled: boolean
  onInstall: (id: string) => void
}) {
  const catalog = usePlugins((state) => state.catalog)
  const error = usePlugins((state) => state.catalogError)
  const loading = usePlugins((state) => state.catalogLoading)
  const loadCatalog = usePlugins((state) => state.loadCatalog)
  const t = useT()

  if (!catalog) {
    if (error) {
      return (
        <div className="space-y-2 p-3 text-xs">
          <p className="text-destructive">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadCatalog(true)}
          >
            {t("common.retry")}
          </Button>
        </div>
      )
    }
    return (
      <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        {loading && <Spinner className="size-3.5" />}
        {t("common.loading")}
      </p>
    )
  }

  const shown = catalog.filter((entry) => matchesPlugin(entry, query))
  return (
    <>
      <p className="border-b px-3 py-2 text-xs text-muted-foreground">
        {t("nav.plugins.marketplaceWarning")}
      </p>
      {error && (
        <p className="border-b px-3 py-2 text-xs text-destructive">{error}</p>
      )}
      {shown.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          {catalog.length === 0
            ? t("nav.plugins.marketplaceEmpty")
            : t("nav.plugins.noMatch")}
        </p>
      ) : (
        <ul className="divide-y border-b">
          {shown.map((entry) => (
            <MarketplaceRow
              key={entry.id}
              entry={entry}
              installed={plugins.find((plugin) => plugin.id === entry.id)}
              busy={busyId === entry.id}
              disabled={disabled}
              onInstall={() => onInstall(entry.id)}
            />
          ))}
        </ul>
      )}
    </>
  )
}

function MarketplaceRow({
  entry,
  installed,
  busy,
  disabled,
  onInstall,
}: {
  entry: MarketplacePlugin
  installed: PluginInfo | undefined
  busy: boolean
  disabled: boolean
  onInstall: () => void
}) {
  const t = useT()
  const action = marketplaceActionOf(entry, installed)
  return (
    <li className="group space-y-1 px-3 py-2.5">
      <div className="flex h-6 items-center gap-2">
        <Puzzle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{entry.name}</span>
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">
            {entry.version}
          </span>
        </span>
        {entry.repo && (
          <a
            href={entry.repo}
            target="_blank"
            rel="noreferrer"
            aria-label={t("nav.plugins.source")}
            title={t("nav.plugins.source")}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
        {action === "install" || action === "update" ? (
          <Button
            size="xs"
            variant={action === "update" ? "default" : "outline"}
            disabled={disabled}
            onClick={onInstall}
          >
            {busy && <Spinner className="size-3" />}
            {busy
              ? t("nav.plugins.installing")
              : action === "update"
                ? t("nav.plugins.update")
                : t("nav.plugins.install")}
          </Button>
        ) : (
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">
            {action === "builtin"
              ? t("nav.plugins.builtin")
              : t("nav.plugins.isInstalled")}
          </span>
        )}
      </div>
      <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
        {entry.description || entry.id}
        {entry.author && (
          <span className="text-muted-foreground/70">
            {" · "}
            {entry.author}
          </span>
        )}
      </p>
    </li>
  )
}

function failureOf(status: PluginStatus | undefined): string | null {
  return status?.state === "failed" ? status.error : null
}
