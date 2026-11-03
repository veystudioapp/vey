import type { ClaudeAccount } from "@shared/api"

/**
 * What a login's pty said, read for what the login dialog draws: the sign-in
 * page's address, what went wrong, and — once it is over — whose account it
 * turned out to be. The pure half of `claude-login.ts` (`test/claude-login.ts`).
 *
 * **Read, never relied on.** The CLI owns its screen and may print it any way
 * it likes next release; a URL this cannot find costs the dialog its `Open
 * page` and `Copy link`, an error it cannot find costs the line under the code
 * field, and the CLI's own screen in the dialog still has its words.
 */

/** OSC 8 hyperlinks, whose target is the whole URL however the text wraps. */
// eslint-disable-next-line no-control-regex -- escapes are what is matched
const OSC8 = /\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]+)(?:\x07|\x1b\\)/g

/** Every other escape: CSI (colours, cursor moves), the rest of OSC, and the
 * two-byte ones. */
const ESCAPES =
  // eslint-disable-next-line no-control-regex -- escapes are what is matched
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

/** A line that is nothing but URL characters — the tail of an address the
 * CLI's renderer broke at the terminal's width. */
const URL_TAIL = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/

/**
 * The sign-in page the CLI printed, or null — the **last** one, because the
 * CLI redraws its screen and an earlier copy may be a stale frame.
 *
 * A hyperlink's target first, since that is the address whole. Otherwise the
 * text, with an address that ran to the end of its line joined to the lines
 * after it while they are nothing but URL characters: a renderer that wraps by
 * breaking the line leaves the rest of a long OAuth URL on the next one.
 */
export function loginUrlIn(output: string): string | null {
  const linked = [...output.matchAll(OSC8)]
    .map((match) => match[1] ?? "")
    .filter(isLoginUrl)
  const last = linked.at(-1)
  if (last) return last

  const lines = output.replace(ESCAPES, "").split(/\r?\n|\r/)
  let found: string | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trimEnd()
    const at = line.search(/https:\/\/\S/)
    if (at < 0) continue

    let url = line.slice(at).split(/\s/)[0] ?? ""
    const ranToEnd = at + url.length === line.length
    if (ranToEnd) {
      while (index + 1 < lines.length) {
        const next = (lines[index + 1] ?? "").trim()
        if (!next || !URL_TAIL.test(next) || next.startsWith("https://")) {
          break
        }
        url += next
        index += 1
      }
    }
    if (isLoginUrl(url)) found = url
  }
  return found
}

/** The CLI's own words for a login going wrong, as `claude auth login` prints
 * them. */
const LOGIN_ERROR =
  /(?:Invalid code\b|Login failed\b|OAuth error\b|Authentication failed\b|Input ended before a code).*/

/**
 * What the CLI last said went wrong, or null: a pasted code it refused (`Invalid
 * code…`, after which it goes on waiting for another) or the line it exits on
 * (`Login failed: …`, `OAuth error: …`). The dialog says it beside the field
 * the code went into, where it used to be only in the CLI's own screen.
 *
 * The **last**, for the reason `loginUrlIn` takes the last URL — and because a
 * second code refused is news only if it is read as the latest.
 */
export function loginErrorIn(output: string): string | null {
  const lines = output.replace(ESCAPES, "").split(/\r?\n|\r/)
  let found: string | null = null
  for (const line of lines) {
    const match = LOGIN_ERROR.exec(line)
    if (match) found = match[0].trim()
  }
  return found
}

/** Anthropic's own pages only: the CLI may print a link to its docs too, and
 * `Open page` must not open that. */
function isLoginUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return (
      protocol === "https:" &&
      /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/.test(hostname)
    )
  } catch {
    return false
  }
}

/**
 * What a profile is called once it has signed in: who it is, rather than the
 * `Profile 2` it was asked under — the address, which is what tells two
 * accounts apart, then the organisation, then the name it was asked under.
 */
export function profileNameOf(account: ClaudeAccount, asked: string): string {
  return account.email ?? account.organization ?? asked
}

/**
 * The account already on the list that a login turned out to be, or null.
 *
 * **The failure this is written against is the browser's**, not the user's:
 * claude.ai still signed in as the first account approves the second login as
 * that account too, in one click nobody reads, and the row that comes back is
 * a second name for the same login. The same address in another organisation
 * is a different account — one email can belong to a team and a personal plan.
 */
export function duplicateOf(
  account: ClaudeAccount,
  others: { name: string; account: ClaudeAccount | undefined }[]
): string | null {
  if (account.state !== "signedIn" || !account.email) return null
  const email = account.email.toLowerCase()
  const match = others.find(
    ({ account: other }) =>
      other?.state === "signedIn" &&
      other.email?.toLowerCase() === email &&
      (other.organization ?? null) === (account.organization ?? null)
  )
  return match?.name ?? null
}
