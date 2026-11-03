import { useRef, useState } from "react"
import {
  ChevronDown,
  Pencil,
  Plus,
  RotateCw,
  SquareTerminal,
  X,
} from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useDock, DOCK_STRIP_HEIGHT } from "@/lib/dock"
import { shellLabels, useScopedShells, useShells } from "@/lib/shell/store"
import { useStudio } from "@/lib/store"
import { IconButton } from "./icon-button"
import { DockTerminal } from "./dock-terminal"
import { useMenuFocusHandoff } from "./rename-row"

/**
 * The strip under the pane: a tab per shell, and a `+` for another.
 *
 * It spans the pane's whole width, and that is the point of where it sits. It
 * was a panel inside the Explorer column — Conductor's `Setup / Run / Terminal`
 * under its file list — but Conductor's list is on the left and this one is a
 * capped 520px on the right, so the shell got 60-odd columns and the tree lost
 * its height whenever the dock opened. See `studio.tsx`.
 *
 * The chevron collapses it rather than a close button: the dock is one of two
 * halves the pane's column is split into, and collapsing it gives the editor
 * the whole column back.
 *
 * **The strip goes with it.** It used to stay on screen as a 36px row — the
 * chevron pointing the other way, and tabs that each reopened the dock — and
 * that was height the pane gave up for a way back the rail's Terminal button
 * and `⌃\`` already are.
 *
 * There was a `Preview` tab past the `+` — the project's dev server in a
 * `<webview>` — and it is gone (`docs/design.md` § Preview, removed).
 */
export function Dock() {
  const open = useDock((state) => state.open)
  const hide = useDock((state) => state.close)
  const show = useDock((state) => state.show)

  // The active project's shells only — another project's keep running out of
  // the strip (`lib/shell/scope.ts`).
  const { scoped: shells, shownId: activeId } = useScopedShells()
  const select = useShells((state) => state.select)
  const close = useShells((state) => state.close)
  const add = useShells((state) => state.add)
  const restart = useShells((state) => state.restart)
  const rename = useShells((state) => state.rename)
  const installed = useShells((state) => state.installed)
  const loadInstalled = useShells((state) => state.loadInstalled)

  const folders = useStudio((state) => state.folders)
  const t = useT()
  const labels = shellLabels(
    shells,
    (folderId) =>
      folders.find((folder) => folder.id === folderId)?.name ??
      t("nav.dock.project")
  )
  const active = shells.find((shell) => shell.id === activeId)
  const shellName = (shellId: string | null) =>
    shellId
      ? installed?.find((candidate) => candidate.id === shellId)?.name
      : undefined

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label={t("nav.dock.terminals")}
        style={{ height: DOCK_STRIP_HEIGHT }}
        // The top border belongs to *this row* rather than to the wrapper, and
        // that is the whole of it: a border on the wrapper is 1px the row does
        // not get, so a shut dock was 37px of content in a 36px box — and the
        // panel's own div scrolls (`overflow: auto`, inline, from
        // react-resizable-panels), so that 1px showed up as a scrollbar.
        className="flex shrink-0 items-center gap-0.5 border-t border-b px-1.5"
      >
        <IconButton
          label={t("nav.dock.hide")}
          onClick={hide}
          className="size-6 shrink-0"
        >
          <ChevronDown className="size-3.5" />
        </IconButton>

        <div className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto">
          {shells.length === 0 && (
            // Nothing started in this project yet: one tab that is the way in,
            // since opening the dock is what starts the first shell — and with
            // the dock already open, opening one is what the click can mean.
            <TabFace
              label={t("nav.rail.terminal")}
              selected={false}
              onSelect={() => (open ? add() : show())}
            />
          )}
          {shells.map((shell) => (
            <TabFace
              key={shell.id}
              label={labels.get(shell.id) ?? t("nav.dock.project")}
              // Named only when picked from the menu: a tab on the default
              // shell is every tab there was before there was a menu.
              kind={shellName(shell.shellId)}
              title={shell.cwd ?? undefined}
              selected={open && shell.id === activeId}
              exited={shell.exited}
              onSelect={() => select(shell.id)}
              onClose={() => close(shell.id)}
              onRestart={() => restart(shell.id)}
              onRename={(name) => rename(shell.id, name)}
            />
          ))}
        </div>

        <IconButton
          label={t("nav.dock.newTerminal")}
          onClick={() => add()}
          className="size-6 shrink-0"
        >
          <Plus className="size-3.5" />
        </IconButton>
        {/* The other shells, as VS Code's `+` has them beside it — PowerShell,
            Command Prompt, Git Bash on Windows; whatever `/etc/shells` lists
            elsewhere. Asked of main the first time it opens. */}
        <DropdownMenu
          onOpenChange={(next) => {
            if (next) loadInstalled()
          }}
        >
          <DropdownMenuTrigger
            render={
              <IconButton
                label={t("nav.dock.newTerminalWith")}
                className="-ml-0.5 h-6 w-4 shrink-0"
              >
                <ChevronDown className="size-3" />
              </IconButton>
            }
          />
          <DropdownMenuContent align="start" className="w-48">
            {/* A label outside a group throws in Base UI. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("nav.dock.newTerminal")}</DropdownMenuLabel>
              {installed === null ? (
                <DropdownMenuItem disabled>
                  {t("nav.dock.lookingForShells")}
                </DropdownMenuItem>
              ) : installed.length === 0 ? (
                <DropdownMenuItem disabled>
                  {t("nav.dock.noShells")}
                </DropdownMenuItem>
              ) : (
                installed.map((profile, index) => (
                  <DropdownMenuItem
                    key={profile.id}
                    onClick={() => add(profile.id)}
                  >
                    <SquareTerminal />
                    {profile.name}
                    {index === 0 && (
                      <span className="ml-auto text-[0.65rem] text-muted-foreground">
                        {t("nav.dock.default")}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {open && active && (
          <IconButton
            label={t("nav.dock.restartShell")}
            onClick={() => restart(active.id)}
            className="ml-auto size-6 shrink-0"
          >
            <RotateCw className="size-3" />
          </IconButton>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <DockTerminal />
      </div>
    </div>
  )
}

/**
 * One tab of the strip. A shell's tab is renamed in place — double-click the
 * name, or `Rename` in its right-click menu — and Enter, Escape and clicking
 * away mean what they do in `RenameRow`. Emptying the field hands the tab back
 * to its automatic name, the cwd.
 */
function TabFace({
  label,
  kind,
  title,
  selected,
  exited = false,
  onSelect,
  onClose,
  onRestart,
  onRename,
}: {
  label: string
  /** The shell it runs, when that is not the default one. */
  kind?: string
  /** The whole path, on hover — the label is only its last segment. */
  title?: string
  selected: boolean
  exited?: boolean
  onSelect: () => void
  onClose?: () => void
  onRestart?: () => void
  onRename?: (name: string) => void
}) {
  const t = useT()
  const [renaming, setRenaming] = useState(false)
  const menuFocus = useMenuFocusHandoff()

  const face = (
    <div
      className={cn(
        "group flex h-7 shrink-0 items-center rounded-md text-xs font-medium transition-colors",
        selected
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {renaming && onRename ? (
        <TabNameField
          name={label}
          onDone={(name) => {
            setRenaming(false)
            if (name !== null) onRename(name)
          }}
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          title={title}
          onClick={onSelect}
          onDoubleClick={() => {
            if (onRename) setRenaming(true)
          }}
          // Middle-click closes, as it does a browser's tab.
          onAuxClick={(event) => {
            if (event.button === 1 && onClose) onClose()
          }}
          className={cn(
            "flex h-full max-w-48 items-center gap-1.5 pl-2",
            onClose ? "pr-1" : "pr-2"
          )}
        >
          <SquareTerminal className="size-3.5 shrink-0" />
          <span className={cn("truncate", exited && "line-through opacity-60")}>
            {label}
          </span>
          {kind && (
            <span className="shrink-0 text-[0.65rem] text-muted-foreground">
              {kind}
            </span>
          )}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          aria-label={t("nav.tabs.closeTab", { label })}
          title={t("nav.dock.closeTerminal")}
          onClick={onClose}
          className={cn(
            "mr-1 grid size-4 shrink-0 place-items-center rounded-sm hover:bg-foreground/10",
            !selected && "invisible group-hover:visible"
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )

  if (!onRename) return face

  return (
    <ContextMenu>
      <ContextMenuTrigger render={face} />
      <ContextMenuContent className="w-40" finalFocus={menuFocus.finalFocus}>
        <ContextMenuItem
          onClick={() => {
            menuFocus.handOff()
            setRenaming(true)
          }}
        >
          <Pencil />
          {t("common.rename")}
        </ContextMenuItem>
        {onRestart && (
          <ContextMenuItem onClick={onRestart}>
            <RotateCw />
            {t("nav.dock.restart")}
          </ContextMenuItem>
        )}
        {onClose && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onClose}>
              <X />
              {t("common.close")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * The tab's name as a field. `onDone` gets the name typed, or null for Escape
 * and for a name left as it was — the second matters, since committing the
 * automatic name would pin it and stop the tab following `cd`.
 */
function TabNameField({
  name,
  onDone,
}: {
  name: string
  onDone: (name: string | null) => void
}) {
  const t = useT()
  // The blur that follows Enter or Escape must not decide a second time.
  const settled = useRef(false)
  const finish = (next: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(next !== null && next.trim() === name ? null : next)
  }

  return (
    <input
      autoFocus
      defaultValue={name}
      spellCheck={false}
      aria-label={t("nav.dock.terminalName")}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          finish(event.currentTarget.value)
        } else if (event.key === "Escape") {
          event.preventDefault()
          finish(null)
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="mx-1 h-5 w-32 min-w-0 rounded-sm border border-ring bg-background px-1 text-xs text-foreground outline-none"
    />
  )
}
