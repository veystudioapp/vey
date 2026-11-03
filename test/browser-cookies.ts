/**
 * Cookies out of an exported file, for the chat's browser
 * (`main/browser-cookies.ts`): the three shapes, and what Chromium would
 * refuse turned into the form it accepts.
 *
 *   bun test/browser-cookies.ts
 */
import { cookiesIn, keptAs, schemeOf } from "../src/main/browser-cookies"
import { check, finish, section } from "./harness"

const NOW = 1_800_000_000
const LATER = NOW + 86_400

section("Cookie-Editor / EditThisCookie JSON")
{
  const { cookies, skipped } = cookiesIn(
    JSON.stringify([
      {
        domain: ".github.com",
        hostOnly: false,
        name: "logged_in",
        value: "yes",
        path: "/",
        secure: true,
        httpOnly: true,
        expirationDate: LATER,
        sameSite: "lax",
      },
      {
        domain: "github.com",
        hostOnly: true,
        name: "_gh_sess",
        value: "abc",
        path: "/",
        secure: true,
        httpOnly: true,
        session: true,
        sameSite: "no_restriction",
      },
      { domain: "old.example", name: "gone", value: "x", expirationDate: 1 },
      { name: "no-domain", value: "x" },
      "not a cookie",
    ]),
    NOW
  )
  check("two cookies read", cookies.length === 2, cookies)
  check("two entries skipped, one expired", skipped === 2, skipped)
  const [shared, session] = cookies
  check(
    "a domain cookie keeps its domain",
    shared?.domain === ".github.com" && shared.url === "https://github.com/"
  )
  check("its expiry is kept", shared?.expirationDate === LATER)
  check("Chrome's sameSite names pass through", shared?.sameSite === "lax")
  check("a host-only cookie names no domain", session?.domain === undefined)
  check("a session cookie has no expiry", session?.expirationDate === undefined)
  check(
    "no_restriction is SameSite=None",
    session?.sameSite === "no_restriction"
  )
}

section("Playwright storageState")
{
  const { cookies } = cookiesIn(
    JSON.stringify({
      cookies: [
        {
          name: "sid",
          value: "1",
          domain: "localhost",
          path: "/app",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "None",
        },
        {
          name: "__Host-token",
          value: "2",
          domain: ".example.com",
          path: "/",
          expires: LATER,
          httpOnly: true,
          secure: true,
          sameSite: "Strict",
        },
      ],
      origins: [],
    }),
    NOW
  )
  check("both read", cookies.length === 2, cookies)
  check(
    "an insecure cookie gets an http URL with its path",
    cookies[0]?.url === "http://localhost/app"
  )
  check("expires -1 is a session cookie", !("expirationDate" in cookies[0]!))
  check(
    "None maps to no_restriction",
    cookies[0]?.sameSite === "no_restriction"
  )
  check(
    "a __Host- cookie is sent without a domain",
    cookies[1]?.domain === undefined
  )
  check("Strict maps to strict", cookies[1]?.sameSite === "strict")
}

section("cookies.txt")
{
  const text = [
    "# Netscape HTTP Cookie File",
    "# https://curl.se/docs/http-cookies.html",
    "",
    `.example.com\tTRUE\t/\tTRUE\t${LATER}\tpref\tdark`,
    `#HttpOnly_app.example.com\tFALSE\t/api\tFALSE\t0\tsid\t`,
    `.example.com\tTRUE\t/\tFALSE\t5\told\tx`,
    "broken line",
  ].join("\r\n")
  const { cookies, expired, skipped } = cookiesIn(text, NOW)
  check("two cookies read", cookies.length === 2, cookies)
  check(
    "an expired line and a broken one, told apart",
    expired === 1 && skipped === 1,
    { expired, skipped }
  )
  check(
    "subdomains TRUE keeps the domain",
    cookies[0]?.domain === ".example.com" && cookies[0].secure
  )
  check(
    "#HttpOnly_ marks it HttpOnly and host-only",
    cookies[1]?.httpOnly === true && cookies[1].domain === undefined
  )
  check("an empty value survives its trailing tab", cookies[1]?.value === "")
  check("expiry 0 is a session cookie", !("expirationDate" in cookies[1]!))
}

section("expired is counted apart from skipped")
{
  const { expired, skipped } = cookiesIn(
    JSON.stringify([
      { domain: "a.example", name: "old", value: "x", expirationDate: 1 },
      { domain: "a.example", name: "p", value: "x", partitionKey: "https://b" },
      { name: "no-domain", value: "x" },
    ]),
    NOW
  )
  check("one expired", expired === 1, expired)
  check("a partitioned one and a broken one skipped", skipped === 2, skipped)
}

section("keep me signed in")
{
  const [dated, session] = cookiesIn(
    JSON.stringify([
      { domain: "a.example", name: "d", value: "1", expirationDate: LATER },
      { domain: "a.example", name: "s", value: "2", session: true },
    ]),
    NOW
  ).cookies
  const kept = keptAs([dated!, session!], true, NOW)
  check("a dated cookie keeps its date", kept[0]?.expirationDate === LATER)
  check(
    "a session cookie is kept 400 days, as Chrome restoring a session does",
    kept[1]?.expirationDate === NOW + 400 * 86_400
  )
  const dropped = keptAs([dated!, session!], false, NOW)
  check(
    "off, every one is a session cookie",
    dropped.every((cookie) => cookie.expirationDate === undefined)
  )
}

section("the scheme a cookie is set through")
{
  check("Secure is https", schemeOf("example.com", true) === "https")
  check(
    "not Secure on the web is still https — scheme-bound cookies",
    schemeOf("example.com", false) === "https"
  )
  check("localhost is http", schemeOf("localhost", false) === "http")
  check(
    "a .localhost name is http",
    schemeOf("app.localhost", false) === "http"
  )
  check("127.0.0.1 is http", schemeOf("127.0.0.1", false) === "http")
}

section("not a cookie file")
{
  const threw = (text: string) => {
    try {
      cookiesIn(text, NOW)
      return false
    } catch (error) {
      return error instanceof Error
    }
  }
  check("broken JSON says so", threw("[{"))
  check("JSON without a list says so", threw('{"a":1}'))
  check("text with no cookie lines says so", threw("# only a comment\n"))
}

finish()
