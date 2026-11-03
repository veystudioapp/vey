import { useEffect, useState, type ReactNode } from "react"
import { ExternalLink, Plug, RefreshCw, Search, Trash2 } from "lucide-react"

import type { McpListing, McpServerInfo } from "@shared/api"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import {
  isRemovable,
  isServerOff,
  isToolOff,
  orderedServers,
  serverCaption,
  serverPromptTokens,
  signIn,
  stateLabel,
  withServerOff,
  withToolOff,
} from "@/lib/chat/mcp-servers"
import { compact } from "@/lib/chat/usage"
import { IconButton } from "../icon-button"
import { serverMark } from "./chat-marks"
import { ToolbarButton } from "./chat-composer"

/**
 * The MCP servers the user's own `claude` has in this chat's project — what
 * `/mcp` in the CLI lists — and which of their tools **this chat** may call.
 *
 * It was Settings › MCP, with one list of switched-off tools for the whole
 * workspace, then a popover off a button in the composer's toolbar. The switches
 * are the chat's (`ChatOptions.disabledTools`): the chat reading a Figma file
 * wants Figma, the one refactoring a module wants its forty tools out of the
 * prompt. A popover was the wrong size for that — a connector's forty tools
 * folded under a 26rem card nobody could read — and a button for something set
 * once a chat sat beside the model and permission, which are reached for every
 * few messages. So it is a dialog, opened from the composer's `+` menu, with the
 * servers down the left and the chosen one's tools on the right, Settings'
 * shape. The toolbar keeps a chip only while something is switched off, since
 * that is a property of the next message worth seeing without opening anything.
 *
 * **The list is the CLI's; what a chat may call is this app's.** Which servers
 * exist belongs to the user's own `claude` — `~/.claude.json`, the repository's
 * `.mcp.json`, plugins, claude.ai connectors — so installing one is still
 * `claude mcp add` and signing a connector in is still claude.ai. Three things
 * here do more than list, and the line between them is the one worth keeping
 * straight:
 *
 * - **The switches** are this chat's own refusal, handed to its turns as
 *   `disallowedTools`. Nothing about the user's config changes, and their
 *   terminal still has every tool.
 * - **Remove** is the opposite: `claude mcp remove` against their config, so it
 *   goes from every chat and the terminal too. It confirms first and cannot be
 *   undone, and it is only offered for the scopes the CLI can remove from
 *   (`isRemovable`).
 * - **Authorize on claude.ai** is a link, for the one state where the fix is a
 *   page rather than a setting — see `signIn`.
 *
 * **Asked when opened, not when drawn.** The listing is a `claude` process and
 * several seconds (`main/mcp-servers.ts`), and a composer is mounted for every
 * chat somebody switches to — asking on mount would start one per click. Not
 * cached either, for the reason on `installedMcpServers`: somebody looking at
 * this list has often just installed something. What was last answered stays
 * on screen while the next ask runs.
 */
export function McpDialog({
  open,
  onOpenChange,
  folderId,
  disabled,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The chat's project, whose directory the CLI is asked in — an MCP config
   * is per directory, so a repository's own `.mcp.json` is in the answer. */
  folderId: string | null
  disabled: string[]
  onPick: (disabled: string[]) => void
}) {
  const t = useT()
  const [listing, setListing] = useState<McpListing | null>(null)
  const [loading, setLoading] = useState(false)
  /**
   * Bumped by opening the dialog and by **Refresh**, which is the whole of
   * what either does to the listing.
   *
   * The ask lives in the effect and nowhere else, so there is one path to it —
   * and nothing calls `setState` in the effect's own body, which is a
   * cascading render the lint is right to refuse. `setLoading(true)` belongs to
   * the event for the same reason.
   */
  const [asks, setAsks] = useState(0)
  /** Which server's tools the right side shows, by name. Held as a name rather
   * than an index so a re-ask that reorders the list keeps the same server. */
  const [chosen, setChosen] = useState<string | null>(null)
  /** The server the confirmation is about, and what the CLI said if it
   * refused. Removal is not undoable, so nothing happens without the dialog. */
  const [pendingRemove, setPendingRemove] = useState<McpServerInfo | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const ask = () => {
    setLoading(true)
    setAsks((count) => count + 1)
  }

  // Opening is the parent's state, so the ask is started off the change in it
  // rather than off a click this component never sees. Adjusted during render,
  // React's documented way, rather than in an effect that would set state.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) ask()
  }

  useEffect(() => {
    if (asks === 0) return
    let live = true
    void window.desktop
      .installedMcpServers(folderId)
      .then((next) => {
        if (!live) return
        setListing(next)
        setLoading(false)
      })
      .catch(() => {
        // The call itself answers with an `error` field rather than rejecting,
        // so this is the bridge failing — nothing to say about a server.
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [folderId, asks])

  const servers = orderedServers(listing?.servers ?? [])
  // Falls back to the first row — which `orderedServers` makes the one in
  // trouble, if any is — when nothing is chosen or the chosen one has gone.
  const current =
    servers.find((server) => server.name === chosen) ?? servers[0] ?? null

  const remove = (server: McpServerInfo) => {
    setRemoveError(null)
    void window.desktop
      .removeMcpServer({ name: server.name, scope: server.scope, folderId })
      .then(() => {
        setPendingRemove(null)
        // Re-asked rather than spliced out of the list held here: a server can
        // be configured in two scopes, and what is left after a removal is the
        // CLI's answer rather than this app's arithmetic.
        ask()
      })
      .catch((error: unknown) => {
        setRemoveError(error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="grid h-[36rem] max-h-[85vh] w-full grid-cols-[15rem_1fr] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <nav
            aria-label={t("chat.mcp.servers")}
            className="flex min-h-0 flex-col border-r bg-muted/30"
          >
            <div className="flex shrink-0 items-center gap-2 px-2 pt-2 pb-1">
              <p className="flex-1 px-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                {t("chat.mcp.serversHeading")}
              </p>
              <IconButton
                label={t("common.refresh")}
                side="bottom"
                disabled={loading}
                onClick={ask}
                className="size-6 shrink-0"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
              </IconButton>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-0">
              {servers.map((server) => (
                <ServerItem
                  key={`${server.scope}/${server.name}`}
                  server={server}
                  current={server === current}
                  disabled={disabled}
                  onChoose={() => setChosen(server.name)}
                  onPick={onPick}
                />
              ))}
            </div>
          </nav>

          <div className="flex min-h-0 min-w-0 flex-col">
            {loading && !listing ? (
              <Blank title={t("chat.mcp.servers")}>
                {rich(t("chat.mcp.asking"))}
              </Blank>
            ) : listing?.error ? (
              <Blank title={t("chat.mcp.servers")} tone="bad">
                {listing.error}
              </Blank>
            ) : !current ? (
              <Blank title={t("chat.mcp.noneTitle")}>
                {rich(t("chat.mcp.noneBody"))}
              </Blank>
            ) : (
              <ServerDetail
                // Keyed so the tool filter starts empty for each server.
                key={`${current.scope}/${current.name}`}
                server={current}
                disabled={disabled}
                onPick={onPick}
                onRemove={() => {
                  setRemoveError(null)
                  setPendingRemove(current)
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("chat.mcp.removeTitle", { name: pendingRemove?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rich(
                pendingRemove?.scope
                  ? t("chat.mcp.removeBodyScoped", {
                      scope: pendingRemove.scope,
                    })
                  : t("chat.mcp.removeBody")
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && (
            <p className="text-xs leading-relaxed text-destructive">
              {removeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                // Held open on purpose: the CLI can refuse, and its message has
                // to land somewhere the user is still looking.
                event.preventDefault()
                if (pendingRemove) remove(pendingRemove)
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * The composer's reminder that this chat has tools switched off — drawn only
 * then, because a chip saying everything is on is a chip saying nothing. The
 * count is of entries rather than tools: it is drawn before anything has been
 * asked, and an entry is what the chat's record holds — a server's prefix
 * counts once, as the one switch it is.
 */
export function McpChip({
  disabled,
  onClick,
}: {
  disabled: string[]
  onClick: () => void
}) {
  const t = useT()
  if (disabled.length === 0) return null
  return (
    <ToolbarButton
      icon={<Plug />}
      label={t("chat.mcp.chip", { count: disabled.length })}
      title={t("chat.mcp.chipTitle")}
      on
      onClick={onClick}
    />
  )
}

/** The right side before there is a server to show. */
function Blank({
  title,
  tone,
  children,
}: {
  title: string
  tone?: "bad"
  children: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Plug className="size-6 text-muted-foreground/60" />
      <DialogTitle className="text-sm">{title}</DialogTitle>
      <DialogDescription
        className={cn(
          "max-w-xs text-xs leading-relaxed",
          tone === "bad" && "text-destructive"
        )}
      >
        {children}
      </DialogDescription>
    </div>
  )
}

/**
 * One server in the left column. The switch sits beside the row's button
 * rather than inside it — a control inside a button is a click that does two
 * things — and turns the whole server off for this chat without opening it.
 */
function ServerItem({
  server,
  current,
  disabled,
  onChoose,
  onPick,
}: {
  server: McpServerInfo
  current: boolean
  disabled: string[]
  onChoose: () => void
  onPick: (disabled: string[]) => void
}) {
  const t = useT()
  const { tone } = stateLabel(server.state)
  const off = isServerOff(disabled, server.name)
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md pr-1.5 transition-colors",
        current ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        onClick={onChoose}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          current ? "font-medium text-accent-foreground" : "text-foreground",
          off && "text-muted-foreground"
        )}
      >
        <span className="relative shrink-0 text-muted-foreground">
          {serverMark(server.name, "size-4")}
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-2 ring-background",
              tone === "good" && "bg-emerald-500",
              tone === "bad" && "bg-destructive",
              tone === "waiting" && "bg-amber-500",
              tone === "off" && "bg-muted-foreground/50"
            )}
          />
        </span>
        <span className="truncate">{server.name}</span>
      </button>
      <Switch
        checked={!off}
        aria-label={t("chat.mcp.allow", { name: server.name })}
        onCheckedChange={(next) =>
          onPick(withServerOff(disabled, server.name, !next))
        }
        className="shrink-0 scale-90"
      />
    </div>
  )
}

/**
 * The chosen server: what it is, whether it works, and every tool it offers,
 * each with its own switch. A filter over the tools because a connector carries
 * forty of them and the one somebody wants out is usually known by name.
 */
function ServerDetail({
  server,
  disabled,
  onPick,
  onRemove,
}: {
  server: McpServerInfo
  disabled: string[]
  onPick: (disabled: string[]) => void
  onRemove: () => void
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const { label, tone } = stateLabel(server.state)
  const caption = serverCaption(server)
  const auth = signIn(server)
  const off = isServerOff(disabled, server.name)
  const offTools = offCount(disabled, server)
  const tokens = serverPromptTokens(server)

  const needle = query.trim().toLowerCase()
  const tools = needle
    ? server.tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(needle) ||
          (tool.description ?? "").toLowerCase().includes(needle)
      )
    : server.tools

  return (
    <>
      {/* `pr-12` clears the close button, which the dialog draws in the
          corner over whatever is there. */}
      <header className="shrink-0 space-y-2 border-b px-5 py-4 pr-12">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-muted-foreground">
            {serverMark(server.name, "size-5")}
          </span>
          <DialogTitle className="truncate">{server.name}</DialogTitle>
          <StateBadge label={label} tone={tone} />
        </div>
        <DialogDescription className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {caption && <span>{caption}</span>}
          <span>
            {t("chat.mcp.tools", { count: server.tools.length })}
            {offTools > 0 &&
              ` · ${off ? t("chat.mcp.allOff") : t("chat.mcp.someOff", { count: offTools })}`}
          </span>
          {/* What the server costs a turn when it is on — the number that
              decides whether its switch is worth flipping. A floor (see
              `serverPromptTokens`), and struck through while the server is
              off, since an off server costs nothing. */}
          {tokens > 0 && (
            <span
              title={t("chat.mcp.tokensTitle")}
              className={cn(off && "line-through opacity-60")}
            >
              {t("chat.mcp.tokensPerTurn", { tokens: compact(tokens) })}
            </span>
          )}
        </DialogDescription>
        {server.address && (
          <p
            title={server.address}
            className="truncate font-mono text-[0.7rem] text-muted-foreground"
          >
            {server.address}
          </p>
        )}
        {server.error && (
          <p className="text-xs leading-relaxed text-destructive">
            {server.error}
          </p>
        )}
        {/*
          A plain anchor, which is all it takes: `main.ts` catches the
          navigation in `will-navigate` and hands an `https:` URL to the user's
          browser — a link opened in this window would leave the studio with no
          chrome and no way back. The CLI case is a sentence rather than a link
          on purpose; see `signIn`.
        */}
        {auth?.kind === "connector" && (
          <a
            href={auth.url}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("chat.mcp.authorize")}
            <ExternalLink className="size-3" />
          </a>
        )}
        {auth?.kind === "cli" && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {rich(t("chat.mcp.signInCli"))}
          </p>
        )}
      </header>

      {server.tools.length === 0 ? (
        <p className="flex-1 p-5 text-xs text-muted-foreground">
          {server.state === "connected"
            ? t("chat.mcp.noTools")
            : t("chat.mcp.noToolsYet")}
        </p>
      ) : (
        <>
          {server.tools.length > 6 && (
            <div className="relative shrink-0 border-b px-5 py-2">
              <Search className="pointer-events-none absolute top-1/2 left-7.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("chat.mcp.filterPlaceholder", {
                  count: server.tools.length,
                })}
                aria-label={t("chat.mcp.filterLabel")}
                className="h-7 pl-7 text-xs md:text-xs"
              />
            </div>
          )}
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {tools.map((tool) => {
              const toolOff = isToolOff(disabled, server.name, tool.name)
              return (
                <li
                  key={tool.name}
                  className="flex items-start gap-3 px-5 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p
                      className={cn(
                        "truncate font-mono text-xs",
                        toolOff && "text-muted-foreground line-through"
                      )}
                    >
                      {tool.name}
                    </p>
                    {tool.description && (
                      // Two lines: a tool's own description is a paragraph in
                      // some servers, and this list is scanned, not read. The
                      // whole of it is the title.
                      <p
                        title={tool.description}
                        className="line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground"
                      >
                        {tool.description}
                      </p>
                    )}
                  </div>
                  {/*
                    Disabled while the whole server is off, and drawn off with
                    it: turning one tool back on from there would mean expanding
                    the server's single entry into every other tool it stood for
                    and guessing which ones were meant to stay — see
                    `withToolOff`.
                  */}
                  <Switch
                    checked={!toolOff}
                    disabled={off}
                    aria-label={t("chat.mcp.allow", { name: tool.name })}
                    onCheckedChange={(next) =>
                      onPick(
                        withToolOff(disabled, server.name, tool.name, !next)
                      )
                    }
                    className="mt-0.5 shrink-0 scale-90"
                  />
                </li>
              )
            })}
            {tools.length === 0 && (
              <li className="px-5 py-4 text-xs text-muted-foreground">
                {t("chat.mcp.noMatch", { query: query.trim() })}
              </li>
            )}
          </ul>
        </>
      )}

      {/*
        At the foot, with the sentence saying how far it reaches, rather than a
        bare bin beside the title: it was the one control in the header, a
        hair from the dialog's close button, and the switches beside every row
        are the gesture somebody almost always means instead.
      */}
      {isRemovable(server) && (
        <footer className="flex shrink-0 items-center gap-3 border-t bg-muted/30 px-5 py-2.5">
          <p className="min-w-0 flex-1 text-[0.7rem] leading-relaxed text-muted-foreground">
            {rich(t("chat.mcp.configNote", { scope: server.scope ?? "" }))}
          </p>
          <Button variant="destructive" size="sm" onClick={onRemove}>
            <Trash2 />
            {t("chat.mcp.removeServer")}
          </Button>
        </footer>
      )}
    </>
  )
}

/**
 * A translated sentence with its commands still drawn as code: `` `x` `` is
 * mono and `*x*` is weighted. Marks in the dictionary rather than JSX split
 * around the words, because the word order around a command is the
 * translation's to choose.
 */
function rich(text: string): ReactNode {
  return text.split(/(`[^`]+`|\*[^*]+\*)/).map((part, index) =>
    part.length > 1 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={index} className="font-mono">
        {part.slice(1, -1)}
      </code>
    ) : part.length > 1 && part.startsWith("*") && part.endsWith("*") ? (
      <span key={index} className="font-medium">
        {part.slice(1, -1)}
      </span>
    ) : (
      part
    )
  )
}

/** How many of a server's tools are switched off, for the header's count. */
function offCount(disabled: string[], server: McpServerInfo): number {
  if (isServerOff(disabled, server.name)) return server.tools.length
  return server.tools.filter((tool) =>
    isToolOff(disabled, server.name, tool.name)
  ).length
}

/** A state in two words, coloured only where the colour means something. */
function StateBadge({
  label,
  tone,
}: {
  label: string
  tone: "good" | "bad" | "waiting" | "off"
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-px text-[0.65rem] font-normal",
        tone === "good" && "border-emerald-500/30 text-emerald-600",
        tone === "bad" && "border-destructive/30 text-destructive",
        tone === "waiting" && "border-amber-500/30 text-amber-600",
        tone === "off" && "text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}
