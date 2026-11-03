import { create } from "zustand"

import type {
  ClaudeAccount,
  ClaudeLoginMethod,
  TerminalExit,
  TerminalOutput,
} from "@shared/api"
import { t } from "@/lib/i18n"
import { useSettings } from "@/lib/settings"
import { defaultAccountName, useClaudeProfiles } from "./claude-profiles"
import {
  duplicateOf,
  loginErrorIn,
  loginUrlIn,
  profileNameOf,
} from "./claude-login-text"
import { usePlanUsage } from "./plan-usage"

/**
 * The logins in flight, each shown in the Accounts foot's login dialog and
 * nowhere else — the list has nothing for one until it has worked. Closing the
 * dialog cancels it.
 *
 * **A new profile is written down only when its login has worked.** It used
 * to be saved on `+` and signed in after, so a login somebody closed left a
 * `Profile 2 · Not signed in` row for ever. Its directory comes from main with
 * the pty (`ClaudeLoginRequest.configDir: null`), and `add` saves the two
 * together, named after the account that signed in.
 *
 * Here rather than in the foot's state so a login outlives anything that
 * re-mounts the foot: the pty is still waiting on a browser either way.
 */

export type LoginStatus =
  /** Main is starting the pty. */
  | "starting"
  /** The CLI is waiting on the browser, or on a pasted code. */
  | "waiting"
  /** The CLI has exited and its directory is being asked who it is. */
  | "checking"
  /** The CLI exited and the directory is not signed in. */
  | "failed"
  /** Signed in — as an account already on the list. */
  | "duplicate"

export type PendingLogin = {
  /** The row it is drawn on: a profile's id, `""` for the default login, or
   * the id a new profile will be saved under. */
  key: string
  /** Null for the default login. */
  profileId: string | null
  isNew: boolean
  /** What it was asked under — a new profile's provisional name. */
  name: string
  method: ClaudeLoginMethod
  /** Known once main has answered; null before that for a new profile. */
  configDir: string | null
  terminalId: string | null
  /** The pty's output so far, for the dialog's terminal to replay and
   * `loginUrlIn`. */
  output: string
  url: string | null
  status: LoginStatus
  /** The CLI's exit code, or what the check said, for a failed login. */
  error: string | null
  /** For `duplicate`: the name of the account it turned out to be. */
  duplicateOf: string | null
  /** What the pty has printed since the last code was sent; null before
   * one is. Its own buffer rather than an offset into `output`, which is
   * trimmed from the front. */
  sinceCode: string | null
  /** What the CLI said about that code — `Invalid code…` — while it goes on
   * waiting for another. */
  codeError: string | null
}

export type LoginInput = Pick<
  PendingLogin,
  "key" | "profileId" | "isNew" | "name" | "method" | "configDir"
>

type ClaudeLoginState = {
  logins: PendingLogin[]
  /** The profile a login has just added, for the foot to mark it arriving. */
  added: string | null
  start: (input: LoginInput) => void
  /** Kills the pty and forgets it; a new profile was never saved. */
  cancel: (key: string) => void
  /** The same login again, in the same directory. */
  retry: (key: string) => void
  /** A duplicate kept anyway. */
  keep: (key: string) => void
  /** A code the browser showed, typed into the CLI's prompt. */
  sendCode: (key: string, code: string) => void
  clearAdded: () => void
}

/**
 * Wide, so a long OAuth URL is less likely to be broken across lines — the pty
 * is not on screen until the dialog's terminal is opened, which fits it to
 * what it has.
 */
const COLS = 200
const ROWS = 30

/** Output kept for the dialog's terminal; a login prints a screen or two. */
const OUTPUT_CAP = 256 * 1024

/** What is kept after a code to read its answer in — a line or two, and the
 * prompt redrawn. */
const SINCE_CODE_CAP = 8 * 1024

/** Per login: what to call to stop listening to its pty. */
const listening = new Map<string, () => void>()

/** Per login: which attempt is current, so a reply to one started over or
 * cancelled is told from the one now waiting. */
const runs = new Map<string, number>()

export const useClaudeLogin = create<ClaudeLoginState>((set, get) => {
  const find = (key: string) => get().logins.find((login) => login.key === key)

  const update = (key: string, patch: Partial<PendingLogin>) =>
    set({
      logins: get().logins.map((login) =>
        login.key === key ? { ...login, ...patch } : login
      ),
    })

  const drop = (key: string) => {
    listening.get(key)?.()
    listening.delete(key)
    set({ logins: get().logins.filter((login) => login.key !== key) })
  }

  const run = async (key: string) => {
    const login = find(key)
    if (!login) return
    const generation = (runs.get(key) ?? 0) + 1
    runs.set(key, generation)

    // Listening before asking: the pty is spawned before main answers, and a
    // CLI that fails at once can print and exit before the id is known here.
    const early: TerminalOutput[] = []
    const exits: TerminalExit[] = []
    let terminalId: string | null = null
    const onData = (event: TerminalOutput) => {
      if (terminalId === null) early.push(event)
      else if (event.terminalId === terminalId) receive(key, event.chunk)
    }
    const onExit = (event: TerminalExit) => {
      if (terminalId === null) exits.push(event)
      else if (event.terminalId === terminalId) void finish(key, event)
    }
    const offData = window.desktop.onTerminalData(onData)
    const offExit = window.desktop.onTerminalExit(onExit)
    const stop = () => {
      offData()
      offExit()
    }
    listening.set(key, stop)

    try {
      const started = await window.desktop.claudeLogin(
        {
          configDir: login.configDir,
          name: login.name,
          method: login.method,
        },
        COLS,
        ROWS
      )
      // Cancelled, or started over, while main was starting this one.
      if (!find(key) || runs.get(key) !== generation) {
        stop()
        void window.desktop.terminalKill(started.terminalId)
        return
      }
      terminalId = started.terminalId
      update(key, {
        terminalId,
        configDir: started.configDir,
        status: "waiting",
      })
      for (const event of early) {
        if (event.terminalId === terminalId) receive(key, event.chunk)
      }
      const exited = exits.find((event) => event.terminalId === terminalId)
      if (exited) void finish(key, exited)
    } catch (error) {
      stop()
      if (runs.get(key) !== generation) return
      listening.delete(key)
      update(key, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const receive = (key: string, chunk: string) => {
    const login = find(key)
    if (!login) return
    const output = (login.output + chunk).slice(-OUTPUT_CAP)
    const sinceCode =
      login.sinceCode === null
        ? null
        : (login.sinceCode + chunk).slice(-SINCE_CODE_CAP)
    update(key, {
      output,
      url: loginUrlIn(output) ?? login.url,
      sinceCode,
      codeError:
        sinceCode === null
          ? null
          : (loginErrorIn(sinceCode) ?? login.codeError),
    })
  }

  /**
   * The pty has ended: whether it worked is asked of the directory, not read
   * off the exit code — `claude` exits 0 for a login somebody backed out of too.
   */
  const finish = async (key: string, exit: TerminalExit) => {
    listening.get(key)?.()
    listening.delete(key)
    const login = find(key)
    if (!login || login.configDir === null) return
    update(key, { status: "checking", terminalId: null })

    const profiles = useClaudeProfiles.getState()
    await profiles.check(login.configDir)
    const account = useClaudeProfiles.getState().accounts[login.configDir]
    if (!find(key)) return

    if (account?.state !== "signedIn") {
      update(key, {
        status: "failed",
        // The CLI's own sentence first: `Login failed: …` says what the exit
        // code only numbers.
        error:
          loginErrorIn(login.output) ??
          account?.error ??
          (exit.exitCode !== 0
            ? t("projects.login.exitCode", { code: exit.exitCode })
            : null),
      })
      return
    }

    const others = [
      {
        dir: "",
        name: defaultAccountName(
          useClaudeProfiles.getState().accounts[""],
          useSettings.getState().defaultAccountLabel
        ),
      },
      ...useClaudeProfiles.getState().profiles.map((profile) => ({
        dir: profile.configDir.trim(),
        name: profile.name,
      })),
    ]
      .filter(({ dir }) => dir !== login.configDir)
      .map(({ dir, name }) => ({
        name,
        account: useClaudeProfiles.getState().accounts[dir],
      }))
    const duplicate = duplicateOf(account, others)
    if (duplicate) {
      update(key, { status: "duplicate", duplicateOf: duplicate })
      return
    }
    await complete(key, account)
  }

  const complete = async (key: string, account: ClaudeAccount | undefined) => {
    const login = find(key)
    if (!login || login.configDir === null) return
    if (login.isNew) {
      await useClaudeProfiles.getState().add({
        id: login.key,
        name: account ? profileNameOf(account, login.name) : login.name,
        configDir: login.configDir,
      })
      set({ added: login.key })
    }
    drop(key)
    // `fresh`: main holds an answer a minute, and the one it holds is from
    // before the login.
    void usePlanUsage.getState().load(login.profileId, true)
  }

  return {
    logins: [],
    added: null,

    start(input) {
      const existing = find(input.key)
      if (existing) {
        if (existing.terminalId) {
          void window.desktop.terminalKill(existing.terminalId)
        }
        drop(input.key)
      }
      set({
        logins: [
          ...get().logins,
          {
            ...input,
            terminalId: null,
            output: "",
            url: null,
            status: "starting",
            error: null,
            duplicateOf: null,
            sinceCode: null,
            codeError: null,
          },
        ],
      })
      void run(input.key)
    },

    cancel(key) {
      const login = find(key)
      if (login?.terminalId) void window.desktop.terminalKill(login.terminalId)
      drop(key)
    },

    retry(key) {
      const login = find(key)
      if (!login) return
      if (login.terminalId) void window.desktop.terminalKill(login.terminalId)
      listening.get(key)?.()
      listening.delete(key)
      update(key, {
        terminalId: null,
        output: "",
        url: null,
        status: "starting",
        error: null,
        duplicateOf: null,
        sinceCode: null,
        codeError: null,
      })
      void run(key)
    },

    keep(key) {
      const login = find(key)
      if (!login || login.configDir === null) return
      void complete(key, useClaudeProfiles.getState().accounts[login.configDir])
    },

    sendCode(key, code) {
      const terminalId = find(key)?.terminalId
      if (terminalId && code.trim()) {
        // Read from here on: a refusal of an earlier code is not this one's.
        update(key, { sinceCode: "", codeError: null })
        void window.desktop.terminalWrite(terminalId, `${code.trim()}\r`)
      }
    },

    clearAdded() {
      set({ added: null })
    },
  }
})
