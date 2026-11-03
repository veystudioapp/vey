import { execFile } from "node:child_process"
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import type { CookieSite, CookieSource } from "../shared/browser"
import { cookieOf, type ImportedCookie, type Skip } from "./browser-cookies"

/**
 * Cookies straight out of a browser installed on this machine, for the chat's
 * browser — the `Import cookies` dialog (`docs/design.md` § The chat's
 * browser). Two families are read:
 *
 * - **Chromium's** (Chrome, Brave, Edge, Arc, Vivaldi, Chromium): a SQLite
 *   `Cookies` per profile, each value AES-encrypted under a key derived from a
 *   password in the OS keychain — on macOS `security`, which shows the user
 *   the system's own prompt to allow it; on Linux the secret service, or
 *   Chromium's fixed fallback. Not on Windows: Chrome 127 bound its key to
 *   Chrome itself (App-Bound Encryption), and nothing else can unwrap it.
 * - **Firefox's**: `cookies.sqlite`, not encrypted, on every OS.
 *
 * Nothing is read until somebody has picked a profile, the sites come off the
 * hosts alone, and the keychain is asked only for the sites they then picked.
 * Free of `electron` (`test/browser-import.ts`); SQLite is Node's own
 * `node:sqlite`, which Electron 43's Node carries.
 */

type Chromium = {
  key: string
  name: string
  /** Under `~/Library/Application Support` on macOS, `~/.config` on Linux. */
  mac?: string
  linux?: string
  /** The keychain item holding the password the key is derived from. */
  keychain: { service: string; account: string }
  /** `secret-tool`'s `application` on Linux. */
  secretApp: string
  app: string
}

const CHROMIUMS: Chromium[] = [
  {
    key: "chrome",
    name: "Google Chrome",
    mac: "Google/Chrome",
    linux: "google-chrome",
    keychain: { service: "Chrome Safe Storage", account: "Chrome" },
    secretApp: "chrome",
    app: "/Applications/Google Chrome.app",
  },
  {
    key: "brave",
    name: "Brave",
    mac: "BraveSoftware/Brave-Browser",
    linux: "BraveSoftware/Brave-Browser",
    keychain: { service: "Brave Safe Storage", account: "Brave" },
    secretApp: "brave",
    app: "/Applications/Brave Browser.app",
  },
  {
    key: "edge",
    name: "Microsoft Edge",
    mac: "Microsoft Edge",
    linux: "microsoft-edge",
    keychain: {
      service: "Microsoft Edge Safe Storage",
      account: "Microsoft Edge",
    },
    secretApp: "chromium",
    app: "/Applications/Microsoft Edge.app",
  },
  {
    key: "arc",
    name: "Arc",
    mac: "Arc/User Data",
    keychain: { service: "Arc Safe Storage", account: "Arc" },
    secretApp: "arc",
    app: "/Applications/Arc.app",
  },
  {
    key: "vivaldi",
    name: "Vivaldi",
    mac: "Vivaldi",
    linux: "vivaldi",
    keychain: { service: "Vivaldi Safe Storage", account: "Vivaldi" },
    secretApp: "vivaldi",
    app: "/Applications/Vivaldi.app",
  },
  {
    key: "chromium",
    name: "Chromium",
    mac: "Chromium",
    linux: "chromium",
    keychain: { service: "Chromium Safe Storage", account: "Chromium" },
    secretApp: "chromium",
    app: "/Applications/Chromium.app",
  },
]

const FIREFOX_APP = "/Applications/Firefox.app"

/** Where a source's cookies are, beside what the dialog shows of it. */
type Located = CookieSource & {
  database: string
  chromium?: Chromium
}

/** The browsers' own folders, by OS. */
function roots(home: string, platform: NodeJS.Platform) {
  if (platform === "darwin") {
    const support = path.join(home, "Library", "Application Support")
    return {
      chromium: (browser: Chromium) =>
        browser.mac ? path.join(support, browser.mac) : null,
      firefox: path.join(support, "Firefox"),
    }
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming")
    // No Chromium on Windows — see the module comment.
    return {
      chromium: () => null,
      firefox: path.join(appData, "Mozilla", "Firefox"),
    }
  }
  const config = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config")
  return {
    chromium: (browser: Chromium) =>
      browser.linux ? path.join(config, browser.linux) : null,
    firefox: path.join(home, ".mozilla", "firefox"),
  }
}

/** Every browser profile on this machine with cookies to read. */
export async function cookieSources(
  home: string,
  platform: NodeJS.Platform = process.platform
): Promise<CookieSource[]> {
  return (await located(home, platform)).map(
    ({ id, browser, profile, app }) => ({ id, browser, profile, app })
  )
}

async function located(
  home: string,
  platform: NodeJS.Platform
): Promise<Located[]> {
  const where = roots(home, platform)
  const found: Located[] = []

  for (const browser of CHROMIUMS) {
    const root = where.chromium(browser)
    if (!root || !existsSync(root)) continue
    let localState: unknown = null
    try {
      localState = JSON.parse(
        await readFile(path.join(root, "Local State"), "utf8")
      )
    } catch {
      // A profile folder with no `Local State` still has `Default`.
    }
    const profiles = chromiumProfiles(localState)
    if (profiles.length === 0) profiles.push({ dir: "Default", name: "" })
    for (const profile of profiles) {
      const database = [
        path.join(root, profile.dir, "Network", "Cookies"),
        path.join(root, profile.dir, "Cookies"),
      ].find((file) => existsSync(file))
      if (!database) continue
      found.push({
        id: `${browser.key}:${profile.dir}`,
        browser: browser.name,
        profile: profile.name || profile.dir,
        app: platform === "darwin" ? browser.app : null,
        database,
        chromium: browser,
      })
    }
  }

  try {
    const ini = await readFile(path.join(where.firefox, "profiles.ini"), "utf8")
    for (const profile of firefoxProfiles(ini)) {
      const dir = profile.relative
        ? path.join(where.firefox, profile.path)
        : profile.path
      const database = path.join(dir, "cookies.sqlite")
      if (!existsSync(database)) continue
      found.push({
        id: `firefox:${profile.path}`,
        browser: "Firefox",
        profile: profile.name,
        app: platform === "darwin" ? FIREFOX_APP : null,
        database,
      })
    }
  } catch {
    // No Firefox.
  }
  return found
}

/**
 * The profiles `Local State` names, in the order the browser's own menu shows
 * them — `profiles_order` where it is kept — with the name the user gave each.
 */
export function chromiumProfiles(
  localState: unknown
): { dir: string; name: string }[] {
  const profile = isRecord(localState) ? localState.profile : null
  const cache = isRecord(profile) ? profile.info_cache : null
  if (!isRecord(cache)) return []
  const order =
    isRecord(profile) && Array.isArray(profile.profiles_order)
      ? profile.profiles_order.filter(
          (dir): dir is string => typeof dir === "string" && dir in cache
        )
      : []
  const dirs = [
    ...order,
    ...Object.keys(cache).filter((d) => !order.includes(d)),
  ]
  return dirs.map((dir) => {
    const info = cache[dir]
    const name =
      isRecord(info) && typeof info.name === "string" ? info.name : ""
    return { dir, name }
  })
}

/** `profiles.ini`'s `[Profile…]` sections. */
export function firefoxProfiles(
  ini: string
): { name: string; path: string; relative: boolean }[] {
  const profiles: { name: string; path: string; relative: boolean }[] = []
  let current: Record<string, string> | null = null
  const flush = () => {
    if (current?.Path) {
      profiles.push({
        name: current.Name ?? current.Path,
        path: current.Path,
        relative: current.IsRelative !== "0",
      })
    }
  }
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim()
    const section = /^\[(.+)\]$/.exec(line)
    if (section) {
      flush()
      current = section[1]!.startsWith("Profile") ? {} : null
      continue
    }
    const pair = /^([^=]+)=(.*)$/.exec(line)
    if (current && pair) current[pair[1]!.trim()] = pair[2]!.trim()
  }
  flush()
  return profiles
}

/**
 * The site a cookie's host belongs to, which is what the dialog lists: the
 * last two labels, or three under a two-letter country's `co.`/`com.`-style
 * second level — `accounts.google.com` and `.google.com` are one row, and
 * `shop.example.co.jp` is `example.co.jp`. A heuristic rather than the public
 * suffix list, which is a 250 KB table for the grouping of a checkbox list.
 */
export function siteOf(host: string): string {
  const labels = host.replace(/^\./, "").toLowerCase().split(".")
  if (labels.length <= 2 || /^\d+$/.test(labels.at(-1) ?? "")) {
    return labels.join(".")
  }
  const tld = labels.at(-1)!
  const second = labels.at(-2)!
  const keep =
    tld.length === 2 &&
    /^(co|com|net|org|gov|edu|ac|or|ne|go|gr|lg|ed)$/.test(second)
      ? 3
      : 2
  return labels.slice(-keep).join(".")
}

/** The sites a source has cookies for, and how many each — off the hosts
 * alone, so nothing has been decrypted and the keychain not asked. */
export async function cookieSites(
  home: string,
  sourceId: string,
  platform: NodeJS.Platform = process.platform
): Promise<CookieSite[]> {
  const source = await find(home, sourceId, platform)
  const table = source.chromium ? "cookies" : "moz_cookies"
  const column = source.chromium ? "host_key" : "host"
  const rows = await query(
    source.database,
    `SELECT ${column} AS host, COUNT(*) AS count FROM ${table} GROUP BY ${column}`
  )
  const counts = new Map<string, number>()
  for (const row of rows) {
    const site = siteOf(String(row.host ?? ""))
    if (!site) continue
    counts.set(site, (counts.get(site) ?? 0) + Number(row.count ?? 0))
  }
  return [...counts]
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => a.site.localeCompare(b.site))
}

/**
 * The cookies of the picked sites, decrypted and in the shape Electron sets.
 * `keep` false makes every one a session cookie, gone when the app quits.
 */
export async function sourceCookies(
  home: string,
  sourceId: string,
  sites: string[],
  platform: NodeJS.Platform = process.platform,
  now = Date.now() / 1000
): Promise<{ cookies: ImportedCookie[]; expired: number; skipped: number }> {
  const source = await find(home, sourceId, platform)
  const wanted = new Set(sites)
  const cookies: ImportedCookie[] = []
  let expired = 0
  let skipped = 0
  const take = (cookie: ImportedCookie | Skip) => {
    if (cookie === "expired") expired += 1
    else if (typeof cookie === "string") skipped += 1
    else cookies.push(cookie)
  }

  if (!source.chromium) {
    // Every column, because `schemeMap` and `originAttributes` are not in
    // every Firefox's schema and naming a missing one fails the whole read.
    const rows = await query(source.database, "SELECT * FROM moz_cookies")
    for (const row of rows) {
      if (!wanted.has(siteOf(String(row.host ?? "")))) continue
      take(firefoxCookie(row, now))
    }
    return { cookies, expired, skipped }
  }

  const [meta] = await query(
    source.database,
    "SELECT value FROM meta WHERE key = 'version'"
  )
  const version = Number(meta?.value ?? 0)
  const rows = (
    await query(
      source.database,
      "SELECT * , hex(encrypted_value) AS encrypted FROM cookies"
    )
  ).filter((row) => wanted.has(siteOf(String(row.host_key ?? ""))))
  if (rows.length === 0) return { cookies, expired, skipped }

  // Asked only now, for sites somebody picked: this is the keychain prompt.
  const key = await chromiumKeyFor(source.chromium, platform)
  let undecrypted = 0
  for (const row of rows) {
    const encrypted = Buffer.from(String(row.encrypted ?? ""), "hex")
    const plain = String(row.value ?? "")
    const value =
      plain || encrypted.length === 0
        ? plain
        : decryptChromium(encrypted, key, String(row.host_key), version)
    if (value === null) {
      undecrypted += 1
      skipped += 1
      continue
    }
    take(chromiumCookie(row, value, now))
  }
  if (undecrypted === rows.length) {
    throw new Error(
      `Could not decrypt ${source.browser}'s cookies with the key the keychain gave.`
    )
  }
  return { cookies, expired, skipped }
}

async function find(
  home: string,
  sourceId: string,
  platform: NodeJS.Platform
): Promise<Located> {
  const source = (await located(home, platform)).find(
    (entry) => entry.id === sourceId
  )
  if (!source) throw new Error("That browser profile is not there any more.")
  return source
}

/** Chromium's per-OS key: PBKDF2 over the keychain's password, as Chromium's
 * own `os_crypt` derives it. */
export function chromiumKey(password: string, iterations: number): Buffer {
  return pbkdf2Sync(password, "saltysalt", iterations, 16, "sha1")
}

async function chromiumKeyFor(
  browser: Chromium,
  platform: NodeJS.Platform
): Promise<Buffer> {
  if (platform === "darwin") {
    const password = await run(
      "security",
      [
        "find-generic-password",
        "-w",
        "-s",
        browser.keychain.service,
        "-a",
        browser.keychain.account,
      ],
      // Long enough for somebody to read the prompt and type a password.
      120_000
    ).catch(() => {
      throw new Error(
        `macOS did not allow access to ${browser.name}'s cookies. Choose Allow when it asks.`
      )
    })
    return chromiumKey(password.trim(), 1003)
  }
  // Linux: the secret service's password where the browser stored one (`v11`),
  // else the fixed one Chromium uses without a keyring (`v10`).
  const secret = await run(
    "secret-tool",
    ["lookup", "application", browser.secretApp],
    10_000
  ).catch(() => "")
  return chromiumKey(secret.trim() || "peanuts", 1)
}

/**
 * One `encrypted_value`, or null for one this key does not open.
 *
 * `v10`/`v11` and AES-128-CBC with an IV of sixteen spaces. From database
 * version 24 Chromium puts the SHA-256 of the cookie's host ahead of the
 * value, to stop a value being moved to another host; it is checked and
 * dropped.
 */
export function decryptChromium(
  blob: Buffer,
  key: Buffer,
  host: string,
  version: number
): string | null {
  const prefix = blob.subarray(0, 3).toString("latin1")
  if (prefix !== "v10" && prefix !== "v11") return null
  let plain: Buffer
  try {
    const decipher = createDecipheriv(
      "aes-128-cbc",
      key,
      Buffer.alloc(16, 0x20)
    )
    plain = Buffer.concat([decipher.update(blob.subarray(3)), decipher.final()])
  } catch {
    return null
  }
  const hash = createHash("sha256").update(host).digest()
  if (plain.length >= 32 && plain.subarray(0, 32).equals(hash)) {
    plain = plain.subarray(32)
  } else if (version >= 24) {
    return null
  }
  return plain.toString("utf8")
}

/** Microseconds since 1601, Chromium's (and Windows') epoch. */
const CHROMIUM_EPOCH_SECONDS = 11_644_473_600

export function chromiumCookie(
  row: Record<string, unknown>,
  value: string,
  now: number
): ImportedCookie | Skip {
  const host = String(row.host_key ?? "")
  const name = String(row.name ?? "")
  if (!host || !name) return "invalid"
  // CHIPS: a cookie kept for one top-level site alone — see `Skip`.
  if (String(row.top_frame_site_key ?? "")) return "partitioned"
  const persistent = Number(row.is_persistent ?? 1) === 1
  const expires = persistent
    ? Number(row.expires_utc ?? 0) / 1e6 - CHROMIUM_EPOCH_SECONDS
    : null
  if (expires !== null && expires > 0 && expires < now) return "expired"
  const secure = Number(row.is_secure ?? 0) === 1
  // Chromium's own record of where it was set: 1 is HTTP, 2 HTTPS, 0 unset.
  const source = Number(row.source_scheme ?? 0)
  return cookieOf({
    name,
    value,
    domain: host,
    // A leading dot is a domain cookie; without one, host-only.
    hostOnly: !host.startsWith("."),
    path: String(row.path ?? "/") || "/",
    secure,
    httpOnly: Number(row.is_httponly ?? 0) === 1,
    expirationDate: expires !== null && expires > 0 ? expires : null,
    sameSite: sameSiteOf(Number(row.samesite ?? -1), secure),
    ...(source === 2 || secure
      ? { scheme: "https" as const }
      : source === 1
        ? { scheme: "http" as const }
        : {}),
  })
}

export function firefoxCookie(
  row: Record<string, unknown>,
  now: number
): ImportedCookie | Skip {
  const host = String(row.host ?? "")
  const name = String(row.name ?? "")
  if (!host || !name) return "invalid"
  // Firefox keeps a partitioned cookie's top-level site in its origin
  // attributes — the same CHIPS cookie, the same reason.
  if (/partitionKey=/.test(String(row.originAttributes ?? ""))) {
    return "partitioned"
  }
  // Seconds until Firefox 137, milliseconds since.
  let expires = Number(row.expiry ?? 0)
  if (expires > 1e11) expires /= 1000
  if (expires > 0 && expires < now) return "expired"
  const secure = Number(row.isSecure ?? 0) === 1
  // A bit per scheme it was set over: 1 HTTP, 2 HTTPS.
  const schemes = Number(row.schemeMap ?? 0)
  return cookieOf({
    name,
    value: String(row.value ?? ""),
    domain: host,
    hostOnly: !host.startsWith("."),
    path: String(row.path ?? "/") || "/",
    secure,
    httpOnly: Number(row.isHttpOnly ?? 0) === 1,
    expirationDate: expires > 0 ? expires : null,
    sameSite: sameSiteOf(Number(row.sameSite ?? -1), secure),
    ...(schemes & 2 || secure
      ? { scheme: "https" as const }
      : schemes & 1
        ? { scheme: "http" as const }
        : {}),
  })
}

/** Both browsers store `None` as 0, `Lax` 1, `Strict` 2. Chromium refuses
 * `None` without `Secure`, so an insecure one is left unspecified. */
function sameSiteOf(
  value: number,
  secure: boolean
): ImportedCookie["sameSite"] {
  if (value === 0) return secure ? "no_restriction" : "unspecified"
  if (value === 1) return "lax"
  if (value === 2) return "strict"
  return "unspecified"
}

type Sqlite = {
  DatabaseSync: new (
    file: string,
    options?: { readOnly?: boolean }
  ) => {
    prepare: (sql: string) => {
      setReadBigInts: (on: boolean) => void
      all: () => Record<string, unknown>[]
    }
    close: () => void
  }
}

/**
 * Rows out of a copy of the database: the browser holds the file open and
 * locked while it runs, and a copy (with its journal) is a snapshot no lock
 * stands in front of.
 */
async function query(
  database: string,
  sql: string
): Promise<Record<string, unknown>[]> {
  const sqlite = process.getBuiltinModule?.("node:sqlite") as Sqlite | undefined
  if (!sqlite) throw new Error("This build cannot read SQLite.")
  const dir = await mkdtemp(path.join(tmpdir(), "vey-cookies-"))
  try {
    const copy = path.join(dir, "cookies.db")
    await copyFile(database, copy)
    for (const suffix of ["-wal", "-journal"]) {
      if (existsSync(database + suffix)) {
        await copyFile(database + suffix, copy + suffix).catch(() => {})
      }
    }
    const db = new sqlite.DatabaseSync(copy)
    try {
      const statement = db.prepare(sql)
      // Chromium's times are microseconds since 1601 — 13472287763856637 is a
      // date in 2027 — past `Number.MAX_SAFE_INTEGER`, and `node:sqlite`
      // throws on reading one as a number. Every integer comes back a
      // `bigint`, which each reader turns into a `Number` itself: losing the
      // last microsecond of an expiry is nothing.
      statement.setReadBigInts(true)
      return statement.all()
    } finally {
      db.close()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function run(
  command: string,
  args: string[],
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
