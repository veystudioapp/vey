import type { ClaudeAccount } from "../src/shared/api"
import {
  duplicateOf,
  loginErrorIn,
  loginUrlIn,
  profileNameOf,
} from "../src/renderer/lib/chat/claude-login-text"
import { check, finish, section } from "./harness"

/**
 * The Accounts foot's login, read off a pty it does not own.
 *
 * Tested because the CLI's screen is the one input here this app did not
 * write: a URL it cannot find is a row with no `Open page`, and a duplicate it
 * misses is a second name for an account already on the list — the failure
 * the browser produces in one click nobody reads.
 */

const URL =
  "https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A54545%2Fcallback&scope=org%3Acreate_api_key+user%3Aprofile&state=abc123"

section("loginUrlIn: the sign-in page")

check(
  "a plain line",
  loginUrlIn(
    `Browser didn't open? Use the url below to sign in\n\n${URL}\n\nPaste code here if prompted > `
  ) === URL
)

check(
  "through colours and cursor moves",
  loginUrlIn(`\x1b[2K\x1b[1A\x1b[38;5;246m${URL}\x1b[39m\r\n`) === URL
)

const wrapped = `  ${URL.slice(0, 80)}\n  ${URL.slice(80, 160)}\n  ${URL.slice(160)}\n\n  Paste code here if prompted >`
check(
  "hard-wrapped at the width",
  loginUrlIn(wrapped) === URL,
  loginUrlIn(wrapped)
)

check(
  "a hyperlink's target, whole",
  loginUrlIn(`\x1b]8;;${URL}\x07Sign in\x1b]8;;\x07`) === URL
)

check(
  "the last frame wins",
  loginUrlIn(`${URL}&first\n\x1b[2K${URL}\n`) === URL
)

check(
  "a docs link is not the sign-in page",
  loginUrlIn("See https://example.com/docs for help\n") === null
)

check(
  "text after it on the line does not join the next line",
  loginUrlIn(`${URL} (c to copy)\nabc\n`) === URL
)

check("nothing printed yet", loginUrlIn("") === null)

const signedIn = (patch: Partial<ClaudeAccount> = {}): ClaudeAccount => ({
  configDir: "/tmp/x",
  state: "signedIn",
  email: "hung@example.com",
  organization: "AZoom",
  method: "claude.ai",
  plan: "max",
  error: null,
  ...patch,
})

section("profileNameOf: named after who signed in")

check(
  "the address",
  profileNameOf(signedIn(), "Profile 2") === "hung@example.com"
)
check(
  "the organisation without one",
  profileNameOf(signedIn({ email: null }), "Profile 2") === "AZoom"
)
check(
  "the name asked under, failing both",
  profileNameOf(signedIn({ email: null, organization: null }), "Profile 2") ===
    "Profile 2"
)

section("duplicateOf: the browser's second click")

check(
  "the same address and organisation",
  duplicateOf(signedIn(), [
    { name: "Default account", account: signedIn({ configDir: "" }) },
  ]) === "Default account"
)
check(
  "case does not make it another account",
  duplicateOf(signedIn({ email: "Hung@Example.com" }), [
    { name: "Work", account: signedIn() },
  ]) === "Work"
)
check(
  "another organisation is another account",
  duplicateOf(signedIn(), [
    { name: "Personal", account: signedIn({ organization: "Hung's org" }) },
  ]) === null
)
check(
  "a signed-out row is nobody",
  duplicateOf(signedIn(), [
    { name: "Old", account: signedIn({ state: "signedOut" }) },
  ]) === null
)
check(
  "an unchecked row is nobody",
  duplicateOf(signedIn(), [{ name: "New", account: undefined }]) === null
)

section("loginErrorIn: what the CLI said went wrong")

check(
  "a code without its state, refused while the CLI waits on",
  loginErrorIn(
    `Paste code here if prompted > abc123\r\n\x1b[31mInvalid code. Please make sure the full code was copied\x1b[39m\r\nPaste code here if prompted > `
  ) === "Invalid code. Please make sure the full code was copied"
)

check(
  "the line it exits on",
  loginErrorIn(
    "Paste code here if prompted > abc#def\nLogin failed: Authentication failed: Invalid authorization code\n"
  ) === "Login failed: Authentication failed: Invalid authorization code"
)

check(
  "the last of several",
  loginErrorIn(
    "Invalid code. Please make sure the full code was copied\nLogin failed: OAuth error: invalid_grant\n"
  ) === "Login failed: OAuth error: invalid_grant"
)

check(
  "nothing wrong is nothing",
  loginErrorIn(
    `Opening browser to sign in…\n${URL}\nPaste code here if prompted > `
  ) === null
)

finish()
