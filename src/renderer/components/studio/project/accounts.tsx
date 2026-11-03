import { useEffect, useRef, useState, type PointerEvent } from "react"
import {
  ChevronRight,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react"

import type {
  ClaudeLoginMethod,
  ClaudeProfile,
  PlanUsage,
  PlanWindow,
} from "@shared/api"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useClaudeLogin } from "@/lib/chat/claude-login"
import {
  accountCaption,
  accountKindOf,
  defaultAccountName,
  accountLabel,
  type AccountKind,
  nextProfileName,
  useClaudeProfiles,
} from "@/lib/chat/claude-profiles"
import { type AccountChoice } from "@/lib/chat/column"
import {
  percent,
  resetLabel,
  windowLabel,
  windowShort,
  usageTone,
  usePlanUsage,
} from "@/lib/chat/plan-usage"
import { useChats } from "@/lib/chat/store"
import { useT } from "@/lib/i18n"
import { useSettings } from "@/lib/settings"
import { IconButton } from "../icon-button"
import { ProfileAvatar } from "../profile-avatar"
import { useMenuFocusHandoff } from "../rename-row"
import { LoginDialog, type LoginView } from "./account-login"

/**
 * The accounts a chat can run on, in the order the column lists them: the
 * login the user's own `claude` already has, then their profiles. Each with
 * what the column knows of whether it can take a turn.
 */
export type ColumnAccount = AccountChoice & { name: string }

export function useColumnAccounts(): ColumnAccount[] {
  const profiles = useClaudeProfiles((state) => state.profiles)
  const accounts = useClaudeProfiles((state) => state.accounts)
  const usage = usePlanUsage((state) => state.byProfile)
  const defaultLabel = useSettings((state) => state.defaultAccountLabel)

  // An account nobody has checked is `usable`: not knowing is not the same as
  // signed out, and a turn sent to one that is says so itself.
  const signedIn = (configDir: string) => {
    const state = accounts[configDir.trim()]?.state
    return state === undefined || state === "signedIn"
  }

  return [
    {
      profileId: null,
      name: defaultAccountName(accounts[""], defaultLabel),
      utilization: fiveHour(usage[""]),
      usable: signedIn(""),
    },
    ...profiles.map((profile) => ({
      profileId: profile.id,
      name: profile.name,
      utilization: fiveHour(usage[profile.id]),
      usable: profile.configDir.trim() !== "" && signedIn(profile.configDir),
    })),
  ]
}

/** The five-hour window's percent, or null when there is none to read. */
function fiveHour(usage: PlanUsage | undefined): number | null {
  if (!usage?.available) return null
  return (
    usage.windows.find((window) => window.id === "five_hour")?.utilization ??
    null
  )
}

/** What the column calls an account — the picker's own names. */
export function useAccountName(profileId: string | null): string {
  const profiles = useClaudeProfiles((state) => state.profiles)
  const fallback = defaultAccountName(
    useClaudeProfiles((state) => state.accounts[""]),
    useSettings((state) => state.defaultAccountLabel)
  )
  if (profileId === null) return fallback
  return profiles.find((profile) => profile.id === profileId)?.name ?? fallback
}

/**
 * Which account a chat runs on, as a small round mark on its row.
 *
 * The thing the column never said: this app is for running chats on several
 * accounts, and which one a chat is spending was only in its composer's
 * toolbar. A letter in a hue per profile, and a person for the user's own
 * login — and a profile that has since been deleted
 * reads as that login, which is what `chat.ts` falls back to as well.
 */
export function AccountAvatar({
  profileId,
  className,
}: {
  profileId: string | null
  className?: string
}) {
  const profiles = useClaudeProfiles((state) => state.profiles)
  const name = useAccountName(profileId)

  const profile = profiles.find((entry) => entry.id === profileId)
  if (!profile) {
    return (
      <span
        aria-hidden
        title={name}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          className
        )}
      >
        <UserRound className="size-2.5" />
      </span>
    )
  }
  return <ProfileAvatar profile={profile} className={className} />
}

/** An account on the list a login is asked for (`profileId` null being the
 * default login). */
type LoginTarget = { profileId: string | null; configDir: string; name: string }

/** What the login dialog is open on: the question, for an account on the list
 * or (null) a new one, or a login under way, by its key. */
type LoginDialogState =
  | { kind: "ask"; target: LoginTarget | null }
  | { kind: "login"; key: string }
  | { kind: "api"; profile: ClaudeProfile | null }

/**
 * The foot of the projects column: every account and how much of its
 * five-hour window is gone — and where accounts are **managed**.
 *
 * The question the product exists to answer — which account can still take a
 * turn — asked of every account at once, where it used to be asked of one at a
 * time in each chat's composer. Main holds a minute per account, so asking on
 * mount and again whenever a turn ends anywhere is cheap; an account with no
 * plan window (an API key) is listed without a bar rather than with an empty
 * one, which would be claiming a measurement nobody made.
 *
 * It replaced Settings › Claude. That section held the same list, and the one
 * thing anybody did there — sign a profile in after seeing it was not — was a
 * dialog away from where `Not signed in` was being read. So the row is the
 * control: `Sign in` on the line that says it is not, the rest (check again,
 * rename, remove) on a click or a right-click, and `+` beside the heading.
 *
 * Both open the same dialog (`LoginDialog`): which kind of account, then the
 * login's steps in the same window, and **nothing on the list until it has
 * worked** — a new account arrives as its row, named after whoever signed in
 * (`lib/chat/claude-login.ts`). Closing the dialog cancels the login, since
 * nothing else on screen would say it was still waiting.
 */
export function AccountsFooter() {
  const accounts = useColumnAccounts()
  const usage = usePlanUsage((state) => state.byProfile)
  const load = usePlanUsage((state) => state.load)
  const profiles = useClaudeProfiles((state) => state.profiles)
  const checkUnknown = useClaudeProfiles((state) => state.checkUnknown)
  const remove = useClaudeProfiles((state) => state.remove)
  const logins = useClaudeLogin((state) => state.logins)
  const startLogin = useClaudeLogin((state) => state.start)
  const cancelLogin = useClaudeLogin((state) => state.cancel)
  const added = useClaudeLogin((state) => state.added)
  const clearAdded = useClaudeLogin((state) => state.clearAdded)
  const busy = useChats((state) => state.sending.length)
  const t = useT()

  const [renaming, setRenaming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ClaudeProfile | null>(null)
  const [loginDialog, setLoginDialog] = useState<LoginDialogState | null>(null)
  const newLogins = logins.filter((login) => login.isNew)
  const shownLogin =
    loginDialog?.kind === "login"
      ? logins.find((login) => login.key === loginDialog.key)
      : undefined
  // A login that has worked, or was cancelled, takes its dialog with it — and
  // must not leave it waiting to reopen on the next login under the same key.
  if (loginDialog?.kind === "login" && !shownLogin) setLoginDialog(null)

  const loginView: LoginView | null =
    loginDialog?.kind === "api"
      ? {
          kind: "api",
          title: loginDialog.profile
            ? t("projects.api.editTitle", { name: loginDialog.profile.name })
            : t("projects.api.addTitle"),
          profile: loginDialog.profile,
        }
      : loginDialog?.kind === "ask"
        ? {
            kind: "ask",
            title: loginDialog.target
              ? t("projects.login.title", { name: loginDialog.target.name })
              : t("projects.login.addTitle"),
          }
        : shownLogin
          ? {
              kind: "login",
              title: shownLogin.isNew
                ? t("projects.login.addTitle")
                : t("projects.login.title", { name: shownLogin.name }),
              login: shownLogin,
            }
          : null

  // The mark on an account that has just arrived, for as long as it takes to
  // be seen.
  useEffect(() => {
    if (!added) return
    const timer = window.setTimeout(clearAdded, 2400)
    return () => window.clearTimeout(timer)
  }, [added, clearAdded])

  const collapsed = useSettings((state) => state.accountsCollapsed)
  const setCollapsed = useSettings((state) => state.setAccountsCollapsed)
  const {
    foot,
    height: footHeight,
    dragging,
    start: startResize,
    move: moveResize,
    end: endResize,
    reset: resetResize,
  } = useFootResize()

  const begin = (method: ClaudeLoginMethod) => {
    const target = loginDialog?.kind === "ask" ? loginDialog.target : null
    // Where the account arrives has to be seen when the dialog closes on it.
    if (collapsed) setCollapsed(false)

    if (target) {
      const key = target.profileId ?? ""
      setLoginDialog({ kind: "login", key })
      startLogin({
        key,
        profileId: target.profileId,
        isNew: false,
        name: target.name,
        method,
        configDir: target.configDir,
      })
      return
    }
    const id = crypto.randomUUID()
    setLoginDialog({ kind: "login", key: id })
    startLogin({
      key: id,
      profileId: id,
      isNew: true,
      // Provisional: the row is renamed after whoever signs in.
      name: nextProfileName(profiles.length + newLogins.length),
      method,
      configDir: null,
    })
  }

  /** A custom API profile's form — a new one, or the row's. */
  const openApi = (profile: ClaudeProfile | null) =>
    setLoginDialog({ kind: "api", profile })

  const plansKey = accounts.map((account) => account.profileId).join("|")

  useEffect(() => {
    checkUnknown(["", ...profiles.map((profile) => profile.configDir)])
  }, [checkUnknown, profiles])

  // `plansKey` rather than `plans`, which is a new array every render.
  useEffect(() => {
    for (const id of plansKey.split("|")) void load(id === "" ? null : id)
  }, [load, plansKey])

  // And again each time a turn ends anywhere — the moment a number moved.
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (busy < wasBusy.current) {
      for (const id of plansKey.split("|")) void load(id === "" ? null : id)
    }
    wasBusy.current = busy
  }, [busy, load, plansKey])

  const now = new Date()

  return (
    // Capped at a share of the column, the list scrolling under its heading:
    // eight profiles drawn whole pushed the chats — what the column is for —
    // into a strip at the top. The heading stays put so `+` is always there.
    // Dragged to a height of its own it may take more, never all of it.
    <div
      ref={foot}
      data-tour="accounts"
      // A height, not a ceiling: capped at the rows' own height, a foot with
      // two accounts could not be dragged at all — the edge was already at
      // its limit. The room under the rows is what was asked for.
      style={
        collapsed || footHeight === null
          ? undefined
          : { height: `min(${footHeight}px, ${FOOT_MAX_SHARE * 100}%)` }
      }
      className={cn(
        "relative flex shrink-0 flex-col border-t px-2 pt-1.5",
        collapsed ? "pb-1.5" : "pb-2",
        !collapsed && footHeight === null && "max-h-[70%]"
      )}
    >
      {!collapsed && (
        // Straddling the top border, the composer's handle: found by aiming
        // at the edge, and a double-click gives the foot back its own height.
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("projects.accounts.resize")}
          title={t("projects.accounts.resizeHint")}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={resetResize}
          className="group absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-ns-resize items-center"
        >
          <span
            className={cn(
              "h-0.5 w-full transition-colors group-hover:bg-ring/60",
              dragging && "bg-ring/60"
            )}
          />
        </div>
      )}
      <div
        className={cn(
          "flex shrink-0 items-center justify-between pr-0.5",
          !collapsed && "mb-0.5"
        )}
      >
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 rounded-sm py-0.5 pr-1 pl-0.5 text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronRight
            className={cn(
              "size-3 transition-transform",
              !collapsed && "rotate-90"
            )}
          />
          {t("projects.accounts.heading")}
          {/* There when the foot is folded too — which is when the rows
              cannot say it. */}
          {accounts.length > 0 && (
            <span className="tabular-nums opacity-70">({accounts.length})</span>
          )}
        </button>
        <IconButton
          label={t("projects.accounts.add")}
          className="size-6"
          onClick={() => setLoginDialog({ kind: "ask", target: null })}
        >
          <Plus />
        </IconButton>
      </div>
      <ul
        className={cn("min-h-0 flex-1 overflow-y-auto", collapsed && "hidden")}
      >
        {accounts.map((account) => {
          const key = account.profileId ?? ""
          const plan = usage[key]
          const windows = plan?.available
            ? METER_WINDOWS.flatMap(
                (id) => plan.windows.find((entry) => entry.id === id) ?? []
              )
            : []

          const profile = profiles.find(
            (entry) => entry.id === account.profileId
          )
          return (
            <PlanRow
              key={key}
              account={account}
              configDir={profile?.configDir ?? ""}
              renaming={renaming === key}
              windows={windows}
              now={now}
              arrived={added === key}
              api={profile?.api !== undefined}
              onLogin={() =>
                profile?.api
                  ? openApi(profile)
                  : setLoginDialog({
                      kind: "ask",
                      target: {
                        profileId: account.profileId,
                        configDir: profile?.configDir ?? "",
                        name: account.name,
                      },
                    })
              }
              onRename={() => setRenaming(key)}
              onRenamed={() => setRenaming(null)}
              onRemove={profile ? () => setRemoving(profile) : undefined}
            />
          )
        })}
      </ul>
      <LoginDialog
        view={loginView}
        onStart={begin}
        onCustomApi={() => openApi(null)}
        onClose={() => {
          if (shownLogin) cancelLogin(shownLogin.key)
          setLoginDialog(null)
        }}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projects.accounts.removeTitle", {
                name: removing?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("projects.accounts.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) remove(removing.id)
                setRemoving(null)
              }}
            >
              {t("common.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The foot's own floor: its heading and one row, so a drag never leaves a
 * heading over nothing — folding it is what that is for. */
const FOOT_MIN = 72

/** How much of the column a dragged foot may take: the chats keep the rest. */
const FOOT_MAX_SHARE = 0.6

/**
 * Dragging the foot's top edge, the composer's way: held here while dragging
 * and written once on release, since every write is the whole settings bag.
 */
function useFootResize() {
  const saved = useSettings((state) => state.accountsHeight)
  const save = useSettings((state) => state.setAccountsHeight)
  const foot = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; height: number; max: number } | null>(null)
  const [dragHeight, setDragHeight] = useState<number | null>(null)

  return {
    foot,
    height: dragHeight ?? saved,
    dragging: dragHeight !== null,
    start(event: PointerEvent<HTMLDivElement>) {
      const element = foot.current
      if (event.button !== 0 || !element) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const column = element.parentElement?.clientHeight ?? window.innerHeight
      drag.current = {
        y: event.clientY,
        height: element.offsetHeight,
        max: Math.max(FOOT_MIN, column * FOOT_MAX_SHARE),
      }
    },
    move(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current
      if (!current) return
      const next = current.height + current.y - event.clientY
      setDragHeight(Math.round(Math.min(current.max, Math.max(FOOT_MIN, next))))
    },
    end() {
      if (!drag.current) return
      drag.current = null
      if (dragHeight !== null) save(dragHeight)
      setDragHeight(null)
    },
    reset() {
      save(null)
    },
  }
}

/** Tailwind for an account row — a button the width of the column, with the
 * hover every row in the column has. */
const ROW =
  "flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-accent/60"

/**
 * One login — the user's own or a profile: its name, its five-hour and weekly
 * windows, and a menu on a click or a right-click.
 *
 * `Sign in` stands on the row itself rather than in the menu when the account
 * is not signed in, since that line is the one place the problem is read and
 * there is nothing else to do with such a row. It is a sibling of the row's
 * button, not inside it: a button in a button is neither valid nor clickable.
 */
function PlanRow({
  account,
  api,
  configDir,
  renaming,
  windows,
  now,
  arrived,
  onLogin,
  onRename,
  onRenamed,
  onRemove,
}: {
  account: ColumnAccount
  /** A custom API profile — no login: its menu edits the endpoint. */
  api: boolean
  configDir: string
  renaming: boolean
  /** The windows to draw, in `METER_WINDOWS` order — none for an account
   * with no plan to read (an API key), which is a row without meters rather
   * than with empty ones. */
  windows: PlanWindow[]
  now: Date
  /** Just added by a login — marked while it is new. */
  arrived: boolean
  /** Opens the login dialog for this account. */
  /** Absent for the Free account, which has no login or endpoint to fix. */
  onLogin?: () => void
  /** Absent for the Free account, which is main's to name. */
  onRename?: () => void
  onRenamed: () => void
  /** Absent for the user's own login, which is `~/.claude` and not ours. */
  onRemove?: () => void
}) {
  const key = configDir.trim()
  const known = useClaudeProfiles((state) => state.accounts[key])
  const checking = useClaudeProfiles((state) => state.checking.includes(key))
  const check = useClaudeProfiles((state) => state.check)
  const rename = useClaudeProfiles((state) => state.rename)
  const setDefaultLabel = useSettings((state) => state.setDefaultAccountLabel)
  const load = usePlanUsage((state) => state.load)
  const [open, setOpen] = useState(false)
  const menuFocus = useMenuFocusHandoff()
  const t = useT()

  const caption = accountCaption(known)
  const kind = accountKindOf(known)
  const signedIn = known?.state === "signedIn"

  return (
    <li
      className={cn(
        "rounded-md transition-colors duration-700",
        arrived && "animate-rise bg-accent/70"
      )}
    >
      <div className="flex items-center gap-1">
        {renaming ? (
          <div className={cn(ROW, "hover:bg-transparent")}>
            <AccountAvatar profileId={account.profileId} />
            <InlineName
              name={account.name}
              onDone={(name) => {
                if (account.profileId === null) {
                  // Cleared, it goes back to its address rather than being
                  // refused: the default login has a name without one.
                  if (name !== null && name !== account.name) {
                    setDefaultLabel(name)
                  }
                } else if (name && name !== account.name) {
                  rename(account.profileId, name)
                }
                onRenamed()
              }}
            />
          </div>
        ) : (
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title={caption || undefined}
                  className={cn(ROW, "items-start")}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setOpen(true)
                  }}
                />
              }
            >
              <AccountAvatar profileId={account.profileId} />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="min-w-0 truncate leading-4">
                  {account.name}
                </span>
                {kind && <KindBadge kind={kind} />}
              </span>
              {account.usable &&
                (checking ? (
                  <span className="shrink-0 text-[0.6875rem] leading-4 text-muted-foreground">
                    {t("common.checking")}
                  </span>
                ) : (
                  windows.length > 0 && (
                    <span className="flex shrink-0 flex-col gap-0.5">
                      {windows.map((window) => (
                        <Meter key={window.id} window={window} now={now} />
                      ))}
                    </span>
                  )
                ))}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-60"
              // Rename hands focus to the field it opens — see
              // `useMenuFocusHandoff`.
              finalFocus={menuFocus.finalFocus}
            >
              <p className="truncate px-1.5 py-1 text-xs text-muted-foreground">
                {caption || (api && known?.error) || accountLabel(known).label}
              </p>
              <DropdownMenuSeparator />
              {onLogin && (
                <DropdownMenuItem onClick={onLogin}>
                  <KeyRound />
                  {api
                    ? t("projects.accounts.editEndpoint")
                    : signedIn
                      ? t("projects.accounts.signInAsAnother")
                      : t("projects.accounts.signInMenu")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={checking}
                onClick={() => {
                  void check(key)
                  void load(account.profileId, true)
                }}
              >
                <RefreshCw />
                {t("projects.accounts.checkAgain")}
              </DropdownMenuItem>
              {(onRename || onRemove) && <DropdownMenuSeparator />}
              {onRename && (
                <DropdownMenuItem
                  onClick={() => {
                    menuFocus.handOff()
                    onRename()
                  }}
                >
                  <Pencil />
                  {t("common.rename")}
                </DropdownMenuItem>
              )}
              {onRemove && (
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  <Trash2 />
                  {t("projects.accounts.remove")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!account.usable && !renaming && onLogin && (
          <Button
            size="xs"
            variant="ghost"
            className="shrink-0 text-destructive hover:text-destructive"
            title={known?.error ?? t("projects.accounts.notSignedIn")}
            onClick={onLogin}
          >
            {api
              ? t("projects.accounts.fixEndpoint")
              : t("projects.accounts.signIn")}
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * The windows an account row draws, five-hour over weekly: the one that stops
 * an afternoon and the one that stops a week. The per-model weekly windows
 * the CLI may add are the composer's meter's to list; two lines is what a row
 * beside a name has room for.
 */
const METER_WINDOWS = ["five_hour", "seven_day"]

/** What a meter calls its window, after the percent — short enough to sit in
 * a column of them. */
function meterLabel(id: string): string {
  return id === "five_hour" ? "5h" : id === "seven_day" ? "w" : windowShort(id)
}

/**
 * What an account bills against, beside its name — see `accountKindOf`.
 *
 * A subscription's plan is quiet, since it is what most rows are; a Console
 * login is tinted, because it reads differently — no meters, every turn paid
 * for — and a row without meters otherwise looks like one not read yet.
 */
function KindBadge({ kind }: { kind: AccountKind }) {
  const t = useT()
  return (
    <span
      title={
        kind.kind === "plan"
          ? t("projects.accounts.kindPlan", { plan: kind.label })
          : t(`projects.accounts.kind${KIND_KEY[kind.kind]}`)
      }
      className={cn(
        "shrink-0 rounded-sm border px-1 text-[0.5625rem] leading-3.5 font-medium tracking-wide uppercase",
        kind.kind === "api"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : kind.kind === "custom"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
            : "border-border text-muted-foreground"
      )}
    >
      {kind.label}
    </span>
  )
}

const KIND_KEY = {
  api: "Api",
  token: "Token",
  cloud: "Cloud",
  custom: "Custom",
} as const

/**
 * One window as a short bar, its percent and its name, on one line — stacked
 * in a column at the row's end so the bars, the figures and the names each
 * line up down the list. When it resets is the tooltip: spelled out on the
 * row, it left the name a few letters wide.
 */
function Meter({ window, now }: { window: PlanWindow; now: Date }) {
  const tone = usageTone(window.utilization)
  const reset = resetLabel(window.resetsAt, now)
  const t = useT()
  const vars = {
    window: windowLabel(window.id),
    percent: percent(window.utilization),
  }
  return (
    <span
      title={
        reset
          ? t("projects.accounts.meterWithReset", { ...vars, reset })
          : t("projects.accounts.meter", vars)
      }
      className="flex h-4 items-center gap-1.5 text-[0.625rem] tabular-nums"
    >
      <span
        aria-hidden
        className="h-1 w-8 overflow-hidden rounded-full bg-border"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width]",
            tone === "high"
              ? "bg-destructive"
              : tone === "warn"
                ? "bg-amber-500"
                : "bg-foreground/50"
          )}
          style={{ width: `${window.utilization}%` }}
        />
      </span>
      <span
        className={cn(
          "w-7 text-right",
          tone === "high"
            ? "font-medium text-destructive"
            : tone === "warn"
              ? "font-medium text-amber-600 dark:text-amber-500"
              : "text-muted-foreground"
        )}
      >
        {percent(window.utilization)}
      </span>
      <span className="w-3.5 text-muted-foreground/70">
        {meterLabel(window.id)}
      </span>
    </span>
  )
}

/** An account's name as a field, in place: Enter or a click away keeps it,
 * Escape leaves it as it was — the column's other renames. What is kept may be
 * empty, which the default login reads as "back to its address". */
function InlineName({
  name,
  onDone,
}: {
  name: string
  onDone: (name: string | null) => void
}) {
  const [value, setValue] = useState(name)
  const settled = useRef(false)
  const t = useT()
  const finish = (next: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(next)
  }

  return (
    <input
      autoFocus
      aria-label={t("projects.accounts.accountName")}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => finish(value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(value.trim())
        if (event.key === "Escape") finish(null)
      }}
      className="h-5 min-w-0 flex-1 rounded-sm border bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
  )
}
