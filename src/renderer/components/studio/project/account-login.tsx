import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  TriangleAlert,
} from "lucide-react"

import type { ClaudeLoginMethod, ClaudeProfile } from "@shared/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { useClaudeLogin, type PendingLogin } from "@/lib/chat/claude-login"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { TerminalView, type TerminalHandle } from "../terminal-view"
import { ApiForm } from "./account-api"

/** The account kinds, in the order the form offers them — a subscription
 * first, since that is what almost everybody adding a second account has. */
const METHODS: ClaudeLoginMethod[] = ["claudeai", "console", "sso"]

/** What the login dialog is showing: the question before a login, one
 * login under way, or a custom API's form — a new one, or a row's. */
export type LoginView =
  | { kind: "ask"; title: string }
  | { kind: "login"; title: string; login: PendingLogin }
  | { kind: "api"; title: string; profile: ClaudeProfile | null }

function sameView(a: LoginView | null, b: LoginView | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind || a.title !== b.title) return false
  if (a.kind === "login") return b.kind === "login" && a.login === b.login
  if (a.kind === "api") return b.kind === "api" && a.profile === b.profile
  return true
}

function isBusy(login: PendingLogin): boolean {
  return (
    login.status === "starting" ||
    login.status === "waiting" ||
    login.status === "checking"
  )
}

/**
 * One dialog for the whole login: which kind of account, then — in the same
 * window — the browser step, the code the page may show and the CLI's own
 * screen.
 *
 * It was a popover and then a few lines under the row, and that was too small
 * to be followed: the code field was a sliver of the column and the steps were
 * links nobody read as steps. **It is the only place a login is shown**: the
 * list has nothing for it until it has worked, when the dialog closes by
 * itself and the account arrives marked as new. So closing it cancels the
 * login (`onClose`) — a login left waiting with nothing on screen saying so
 * would be a `claude` nobody could find — and a click outside, mid-login, is
 * not taken as closing it.
 */
export function LoginDialog({
  view,
  onStart,
  onCustomApi,
  onClose,
}: {
  /** Null is closed. */
  view: LoginView | null
  onStart: (method: ClaudeLoginMethod) => void
  /** The fourth kind, which is not a login: its form. */
  onCustomApi: () => void
  onClose: () => void
}) {
  // What was showing, kept through the close: a login that has just worked is
  // gone from the store the moment it closes, and the dialog fading out empty
  // shrank to its padding first.
  const [last, setLast] = useState(view)
  if (view !== null && !sameView(view, last)) setLast(view)
  const shown = view ?? last

  return (
    <Dialog
      open={view !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      disablePointerDismissal={view?.kind === "login"}
    >
      {/* `minmax(0, 1fr)`: the popup is a grid, whose one implicit column is
          as wide as its widest unbreakable line — the sign-in URL, which
          pushed the fields and the footer's buttons out past its edge. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-5 sm:max-w-md">
        {shown?.kind === "login" ? (
          <LoginSteps title={shown.title} login={shown.login} />
        ) : shown?.kind === "api" ? (
          <ApiForm
            key={shown.profile?.id ?? "new"}
            title={shown.title}
            profile={shown.profile}
            onDone={onClose}
            onCancel={onClose}
          />
        ) : shown?.kind === "ask" ? (
          <LoginForm
            title={shown.title}
            onStart={onStart}
            onCustomApi={onCustomApi}
            onCancel={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** The login kinds and, last, the custom API, which is not one. */
type Choice = ClaudeLoginMethod | "customApi"

function LoginForm({
  title,
  onStart,
  onCustomApi,
  onCancel,
}: {
  title: string
  onStart: (method: ClaudeLoginMethod) => void
  onCustomApi: () => void
  onCancel: () => void
}) {
  const t = useT()
  const [method, setMethod] = useState<Choice>("claudeai")

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (method === "customApi") onCustomApi()
    else onStart(method)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="truncate pr-6">{title}</DialogTitle>
        <DialogDescription>{t("projects.login.kind")}</DialogDescription>
      </DialogHeader>

      <RadioGroup
        value={method}
        onValueChange={(value) => setMethod(value as Choice)}
        className="gap-1.5"
      >
        {[...METHODS, "customApi" as const].map((value) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/50",
              method === value && "border-primary/60 bg-accent/40"
            )}
          >
            <RadioGroupItem value={value} className="mt-0.5" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {t(`projects.login.${value}`)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(`projects.login.${value}Hint`)}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {/* Said before the browser opens, because after is too late: the
          browser approves whoever claude.ai is signed in as, in one click. */}
      {method !== "customApi" && (
        <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("projects.login.browserNote")}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit">
          {method !== "customApi"
            ? t("projects.login.open")
            : t("projects.login.customApiNext")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * A login under way, as the two things somebody can do from this side —
 * finish in the browser (the page again, or its link, for a tab closed by
 * mistake), and paste the code a page shows when its redirect cannot reach the
 * CLI — then what went wrong if it did, and the CLI's own screen for anything
 * else it asks.
 */
function LoginSteps({ title, login }: { title: string; login: PendingLogin }) {
  const t = useT()
  const cancel = useClaudeLogin((state) => state.cancel)
  const retry = useClaudeLogin((state) => state.retry)
  const keep = useClaudeLogin((state) => state.keep)
  const [details, setDetails] = useState(false)

  const busy = isBusy(login)
  const ended = login.status === "failed" || login.status === "duplicate"

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate pr-6">{title}</DialogTitle>
        <DialogDescription
          className={cn(
            "flex items-center gap-2",
            login.status === "failed" && "text-destructive",
            login.status === "duplicate" &&
              "font-medium text-amber-600 dark:text-amber-500"
          )}
        >
          {busy ? (
            <Spinner className="size-3.5" aria-label="" />
          ) : (
            <TriangleAlert className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">
            {login.status === "duplicate"
              ? t("projects.login.duplicate", { name: login.duplicateOf ?? "" })
              : t(`projects.login.${login.status}`)}
          </span>
        </DialogDescription>
      </DialogHeader>

      {ended ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          {login.status === "duplicate"
            ? t("projects.login.duplicateHint")
            : login.error || t("projects.login.failedHint")}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          <Step number={1} title={t("projects.login.stepBrowser")}>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("projects.login.stepBrowserHint")}
            </p>
            <LinkField url={login.url} />
          </Step>
          <Step number={2} title={t("projects.login.stepCode")}>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("projects.login.stepCodeHint")}
            </p>
            <CodeField login={login} />
          </Step>
        </ol>
      )}

      {login.output && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
            className="flex items-center gap-1 self-start rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                details && "rotate-90"
              )}
            />
            {t("projects.login.detailsTitle")}
          </button>
          {details && (
            <div className="h-56 rounded-lg border bg-background p-1.5">
              {/* Keyed by the pty, so a retry starts the screen over. */}
              <LoginTerminal
                key={login.terminalId ?? "ended"}
                loginKey={login.key}
              />
            </div>
          )}
        </div>
      )}

      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={() => cancel(login.key)}>
          {t("projects.login.cancelLogin")}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {login.status === "duplicate" && (
            <Button variant="outline" onClick={() => keep(login.key)}>
              {t("projects.login.keep")}
            </Button>
          )}
          {ended && (
            <Button onClick={() => retry(login.key)}>
              {t("projects.login.retry")}
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[0.6875rem] font-medium text-muted-foreground">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-sm leading-5 font-medium">{title}</span>
        {children}
      </div>
    </li>
  )
}

/** The sign-in page's address, readable, with the two ways to use it again. */
function LinkField({ url }: { url: string | null }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="flex items-center gap-1.5">
      <span
        title={url ?? undefined}
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center rounded-lg border bg-muted/40 px-2.5 text-xs",
          url ? "font-mono" : "text-muted-foreground"
        )}
      >
        <span className="truncate">
          {url ?? t("projects.login.linkPending")}
        </span>
      </span>
      <Button
        variant="outline"
        size="icon"
        disabled={!url}
        title={
          copied ? t("projects.login.copied") : t("projects.login.copyLink")
        }
        aria-label={t("projects.login.copyLink")}
        onClick={() => {
          if (!url) return
          void navigator.clipboard.writeText(url)
          setCopied(true)
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <Button
        variant="outline"
        disabled={!url}
        onClick={() => {
          if (url) window.open(url, "_blank", "noreferrer")
        }}
      >
        <ExternalLink />
        {t("projects.login.openPage")}
      </Button>
    </div>
  )
}

/**
 * Where the page's code goes. On screen whenever the CLI is waiting, not
 * behind a link: a page showing a code is the browser's own way of saying it
 * could not hand the login back by itself, and somebody holding that code
 * needs to see where it goes without looking for it.
 */
function CodeField({ login }: { login: PendingLogin }) {
  const t = useT()
  const sendCode = useClaudeLogin((state) => state.sendCode)
  const [code, setCode] = useState("")
  // Sent and not yet answered: the CLI either exits signed in, which moves
  // the whole dialog on, or says the code was wrong.
  const pending =
    login.status === "waiting" && login.sinceCode !== null && !login.codeError

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          sendCode(login.key, code)
          setCode("")
        }}
      >
        <Input
          aria-label={t("projects.login.code")}
          aria-invalid={login.codeError ? true : undefined}
          value={code}
          disabled={login.status !== "waiting"}
          placeholder={t("projects.login.codePlaceholder")}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 font-mono text-xs placeholder:font-sans"
        />
        <Button type="submit" disabled={!code.trim()}>
          {t("projects.login.send")}
        </Button>
      </form>
      {/* The CLI's own sentence, not a translation of it: it is the one
          thing here that says *why*, and it changes with the CLI. */}
      {login.codeError ? (
        <p
          role="alert"
          className="flex gap-1.5 text-xs leading-5 text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {login.codeError}
        </p>
      ) : (
        pending && (
          <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
            <Spinner className="size-3" aria-label="" />
            {t("projects.login.codeSent")}
          </p>
        )
      )}
    </div>
  )
}

/** The login as it is now — read when called rather than subscribed to, since
 * a terminal is fed by the pty's own events. */
function currentLogin(key: string): PendingLogin | undefined {
  return useClaudeLogin.getState().logins.find((login) => login.key === key)
}

/** The CLI's own screen. Typing goes to the pty while it is still running. */
function LoginTerminal({ loginKey }: { loginKey: string }) {
  const onReady = useCallback(
    (terminal: TerminalHandle) => {
      const login = currentLogin(loginKey)
      // What it has printed so far, then what it prints next.
      terminal.write(login?.output ?? "")
      const terminalId = login?.terminalId
      if (!terminalId) return undefined

      const off = window.desktop.onTerminalData((event) => {
        if (event.terminalId === terminalId) terminal.write(event.chunk)
      })
      terminal.onData((data) => {
        void window.desktop.terminalWrite(terminalId, data)
      })
      return off
    },
    [loginKey]
  )

  const onResize = useCallback(
    (size: { cols: number; rows: number }) => {
      const terminalId = currentLogin(loginKey)?.terminalId
      if (terminalId) {
        void window.desktop.terminalResize(terminalId, size.cols, size.rows)
      }
    },
    [loginKey]
  )

  return <TerminalView onReady={onReady} onResize={onResize} />
}
