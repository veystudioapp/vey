/**
 * Cookies out of a file somebody exported them to, for the chat's browser —
 * `Import cookies…` in its menu (`docs/design.md` § The chat's browser).
 *
 * The other way in beside reading a browser's own store
 * (`browser-import.ts`): a file somebody exported, which works for a browser
 * that store cannot be read from — Chrome on Windows, Safari. Three shapes are
 * read, because they are the three a browser extension or a test tool writes:
 *
 * - a JSON array, as Cookie-Editor and EditThisCookie export it;
 * - a JSON object with `cookies`, Playwright's `storageState` (and Puppeteer's);
 * - Netscape's `cookies.txt`, as `curl`, `yt-dlp` and "Get cookies.txt" write it.
 *
 * Pure, so `test/browser-cookies.ts` reads them without Electron; setting them
 * is `setBrowserCookies` on the host.
 */

/** One cookie in the shape Electron's `cookies.set` takes. */
export type ImportedCookie = {
  /** What Chromium checks the cookie against: the scheme a secure cookie
   * needs, the host and the path. */
  url: string
  name: string
  value: string
  /** Absent for a host-only cookie, which a `domain` would widen to the
   * subdomains. */
  domain?: string
  path: string
  secure: boolean
  httpOnly: boolean
  /** Seconds since the epoch; absent for a session cookie. */
  expirationDate?: number
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict"
}

export type CookieFile = {
  cookies: ImportedCookie[]
  /** Already past their expiry, as the browser would have dropped them. */
  expired: number
  /** Entries that were not cookies, or not ones to bring over — see
   * `Skip`. */
  skipped: number
}

/**
 * Why an entry is not imported. `partitioned` is a CHIPS cookie, which only
 * exists under one top-level site: Electron's `cookies.set` cannot partition
 * one, and set unpartitioned it would be a third-party cookie sent from every
 * site — what partitioning was invented to stop. They belong to embedded
 * widgets, not to anybody's sign-in.
 */
export type Skip = "expired" | "partitioned" | "invalid"

/** Chromium's own ceiling on a cookie's lifetime (RFC 6265bis): 400 days. */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60

/**
 * The cookies as `Keep me signed in between sessions` says.
 *
 * On, a **session** cookie is given the longest life Chromium allows. That is
 * what Chrome itself does with one when it reopens where it left off — which
 * is why the user is signed in there — and the cookies that hold a sign-in
 * are as often session cookies (`JSESSIONID`, `PHPSESSID`) as dated ones.
 * Imported as session cookies they went at the first quit, which read as an
 * import that had not worked. Off, every one is a session cookie.
 */
export function keptAs(
  cookies: ImportedCookie[],
  keep: boolean,
  nowSeconds = Date.now() / 1000
): ImportedCookie[] {
  return cookies.map((cookie) => {
    if (!keep) {
      const copy = { ...cookie }
      delete copy.expirationDate
      return copy
    }
    return cookie.expirationDate === undefined
      ? { ...cookie, expirationDate: nowSeconds + MAX_AGE_SECONDS }
      : cookie
  })
}

/** Bigger than any export of a real browser profile's cookies; a file past it
 * is not one. */
export const MAX_COOKIE_FILE_BYTES = 10 * 1024 * 1024

export function cookiesIn(
  text: string,
  nowSeconds = Date.now() / 1000
): CookieFile {
  const body = text.replace(/^\uFEFF/, "")
  const trimmed = body.trim()
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return fromJson(trimmed, nowSeconds)
  }
  return fromNetscape(body, nowSeconds)
}

function fromJson(text: string, now: number): CookieFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("The file is not valid JSON.")
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.cookies)
      ? parsed.cookies
      : null
  if (!entries) {
    throw new Error("The JSON has no list of cookies.")
  }

  const cookies: ImportedCookie[] = []
  let expired = 0
  let skipped = 0
  for (const entry of entries) {
    const cookie = isRecord(entry) ? fromJsonEntry(entry, now) : "invalid"
    if (cookie === "expired") expired += 1
    else if (typeof cookie === "string") skipped += 1
    else cookies.push(cookie)
  }
  return { cookies, expired, skipped }
}

function fromJsonEntry(
  entry: Record<string, unknown>,
  now: number
): ImportedCookie | Skip {
  const name = entry.name
  const value = entry.value
  if (typeof name !== "string" || !name || typeof value !== "string") {
    return "invalid"
  }
  // Chrome's extension API and Playwright both write the key; an empty one is
  // an ordinary cookie.
  if (entry.partitionKey) return "partitioned"
  const domain =
    typeof entry.domain === "string" && entry.domain
      ? entry.domain
      : typeof entry.url === "string"
        ? hostOf(entry.url)
        : null
  if (!domain) return "invalid"

  // `expirationDate` is the extensions', `expires` Playwright's — where -1 is
  // a session cookie, as is a `session: true` from the extensions.
  const expires =
    entry.session === true
      ? undefined
      : (numberOr(entry.expirationDate) ?? numberOr(entry.expires))
  const expirationDate = expires !== undefined && expires > 0 ? expires : null
  if (expirationDate !== null && expirationDate < now) return "expired"

  return cookieOf({
    name,
    value,
    domain,
    hostOnly: entry.hostOnly === true,
    path: typeof entry.path === "string" && entry.path ? entry.path : "/",
    secure: entry.secure === true,
    httpOnly: entry.httpOnly === true,
    expirationDate,
    sameSite: sameSiteOf(entry.sameSite),
  })
}

function fromNetscape(text: string, now: number): CookieFile {
  const cookies: ImportedCookie[] = []
  let expired = 0
  let skipped = 0
  let lines = 0
  for (const raw of text.split(/\r?\n/)) {
    // Not trimmed: an empty value is a trailing tab, and trimming it would
    // leave the line a column short.
    let line = raw.replace(/^[ ]+/, "")
    if (!line.trim()) continue
    // `#HttpOnly_` is how curl marks an HttpOnly cookie in a format with no
    // column for it; every other `#` line is a comment.
    let httpOnly = false
    if (line.startsWith("#HttpOnly_")) {
      httpOnly = true
      line = line.slice("#HttpOnly_".length)
    } else if (line.startsWith("#")) {
      continue
    }
    lines += 1

    const fields = line.split("\t")
    if (fields.length < 7) {
      skipped += 1
      continue
    }
    const [domain, subdomains, path, secure, expiry, name, ...rest] = fields
    const value = rest.join("\t")
    const expires = Number(expiry)
    if (!domain || !name || !Number.isFinite(expires)) {
      skipped += 1
      continue
    }
    if (expires > 0 && expires < now) {
      expired += 1
      continue
    }
    cookies.push(
      cookieOf({
        name,
        value,
        domain,
        hostOnly: subdomains?.toUpperCase() !== "TRUE",
        path: path || "/",
        secure: secure?.toUpperCase() === "TRUE",
        httpOnly,
        expirationDate: expires > 0 ? expires : null,
        sameSite: "unspecified",
      })
    )
  }
  if (lines === 0) {
    throw new Error(
      "No cookies found. Export them as JSON (Cookie-Editor, EditThisCookie, Playwright) or as cookies.txt."
    )
  }
  return { cookies, expired, skipped }
}

export function cookieOf(input: {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  expirationDate: number | null
  sameSite: ImportedCookie["sameSite"]
  /** Where the cookie was set from, where the browser recorded it — see
   * `schemeOf`. */
  scheme?: "http" | "https"
}): ImportedCookie {
  const host = input.domain.replace(/^\./, "")
  // A `__Host-` cookie is refused by Chromium when it names a domain at all.
  const hostOnly = input.hostOnly || input.name.startsWith("__Host-")
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`
  return {
    url: `${input.scheme ?? schemeOf(host, input.secure)}://${host}${path}`,
    name: input.name,
    value: input.value,
    ...(hostOnly ? {} : { domain: input.domain }),
    path,
    secure: input.secure,
    httpOnly: input.httpOnly,
    ...(input.expirationDate !== null
      ? { expirationDate: input.expirationDate }
      : {}),
    sameSite: input.sameSite,
  }
}

/**
 * The scheme a cookie is set through, which Chromium now **binds it to**
 * (scheme-bound cookies): one set through `http://` is not sent to the
 * `https://` page of the same site. Most cookies without `Secure` were still
 * set by an HTTPS page — 649 of 1,905 in one real Chrome profile — and setting
 * them through `http://` is what left sites signed out after an import. So
 * HTTPS, except on this machine, where a dev server is plain HTTP.
 */
export function schemeOf(host: string, secure: boolean): "http" | "https" {
  if (secure) return "https"
  return /^(localhost|.*\.localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0)$/i.test(
    host
  )
    ? "http"
    : "https"
}

/** The extensions write Chrome's own names; Playwright writes the header's. */
function sameSiteOf(value: unknown): ImportedCookie["sameSite"] {
  switch (typeof value === "string" ? value.toLowerCase() : "") {
    case "no_restriction":
    case "none":
      return "no_restriction"
    case "lax":
      return "lax"
    case "strict":
      return "strict"
    default:
      return "unspecified"
  }
}

function numberOr(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
