/**
 * Cookies straight out of an installed browser (`main/browser-import.ts`):
 * Chromium's encryption, its rows and Firefox's, the profile lists, and the
 * grouping into sites the dialog lists. The keychain and the databases
 * themselves are not touched — an encrypted value is made here the way
 * Chromium makes one.
 *
 *   bun test/browser-import.ts
 */
import { createCipheriv, createHash } from "node:crypto"

import {
  chromiumCookie,
  chromiumKey,
  chromiumProfiles,
  decryptChromium,
  firefoxCookie,
  firefoxProfiles,
  siteOf,
} from "../src/main/browser-import"
import type { ImportedCookie, Skip } from "../src/main/browser-cookies"
import { check, finish, section } from "./harness"

const NOW = 1_800_000_000
const EPOCH = 11_644_473_600

/** A value encrypted as Chromium does: `v10`, AES-128-CBC, sixteen spaces,
 * and — from database version 24 — the host's SHA-256 ahead of the value. */
function encrypt(value: string, key: Buffer, host: string | null): Buffer {
  const plain = Buffer.concat([
    host ? createHash("sha256").update(host).digest() : Buffer.alloc(0),
    Buffer.from(value, "utf8"),
  ])
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20))
  return Buffer.concat([
    Buffer.from("v10"),
    cipher.update(plain),
    cipher.final(),
  ])
}

section("Chromium's encryption")
{
  const key = chromiumKey("secret-from-keychain", 1003)
  check("the key is sixteen bytes", key.length === 16)
  check(
    "derived as Chromium derives it",
    key.equals(chromiumKey("secret-from-keychain", 1003)) &&
      !key.equals(chromiumKey("secret-from-keychain", 1))
  )

  const host = ".github.com"
  check(
    "a version-24 value, its host hash dropped",
    decryptChromium(encrypt("abc=123", key, host), key, host, 24) === "abc=123"
  )
  check(
    "an older value with no hash",
    decryptChromium(encrypt("plain old", key, null), key, host, 18) ===
      "plain old"
  )
  check(
    "a hash for another host is refused at version 24",
    decryptChromium(encrypt("moved", key, ".evil.com"), key, host, 24) === null
  )
  check(
    "a wrong key opens nothing",
    decryptChromium(
      encrypt("x", key, host),
      chromiumKey("wrong", 1003),
      host,
      24
    ) === null
  )
  check(
    "an unknown prefix (Windows' v20) is not attempted",
    decryptChromium(Buffer.from("v20abcdef"), key, host, 24) === null
  )
  check(
    "UTF-8 survives",
    decryptChromium(encrypt("Dương ✓", key, host), key, host, 24) === "Dương ✓"
  )
}

/** A row read back as a cookie, or a failed check naming the skip. */
function cookieOrFail(result: ImportedCookie | Skip): ImportedCookie | null {
  return typeof result === "string" ? null : result
}

section("Chromium rows")
{
  const row = {
    host_key: ".github.com",
    top_frame_site_key: "",
    name: "logged_in",
    path: "/",
    expires_utc: (NOW + 3600 + EPOCH) * 1e6,
    is_secure: 1,
    is_httponly: 1,
    samesite: 1,
    is_persistent: 1,
    source_scheme: 2,
  }
  const kept = cookieOrFail(chromiumCookie(row, "yes", NOW))
  check("a domain cookie keeps its domain", kept?.domain === ".github.com")
  check(
    "its expiry, from Chromium's 1601 microseconds",
    Math.round(kept?.expirationDate ?? 0) === NOW + 3600
  )
  check("SameSite=Lax", kept?.sameSite === "lax")
  check(
    "an expired one is said to be expired, not invalid",
    chromiumCookie(
      { ...row, expires_utc: (NOW - 10 + EPOCH) * 1e6 },
      "",
      NOW
    ) === "expired"
  )
  check(
    "a partitioned (CHIPS) cookie is not brought over",
    chromiumCookie(
      { ...row, top_frame_site_key: "https://news.example" },
      "v",
      NOW
    ) === "partitioned"
  )
  check(
    "a nameless row is invalid",
    chromiumCookie({ ...row, name: "" }, "v", NOW) === "invalid"
  )

  // The cookie that left sites signed out: no `Secure`, but set by an HTTPS
  // page. Chromium binds a cookie to the scheme it was set through, so it has
  // to go in through https:// or the https:// page never receives it.
  const insecureFromHttps = cookieOrFail(
    chromiumCookie(
      { ...row, is_secure: 0, samesite: -1, source_scheme: 2 },
      "v",
      NOW
    )
  )
  check(
    "a non-Secure cookie an HTTPS page set goes in through https://",
    insecureFromHttps?.url === "https://github.com/" &&
      insecureFromHttps.secure === false,
    insecureFromHttps
  )
  const fromHttp = cookieOrFail(
    chromiumCookie(
      { ...row, host_key: "intranet.example", is_secure: 0, source_scheme: 1 },
      "v",
      NOW
    )
  )
  check(
    "one an HTTP page set stays on http://",
    fromHttp?.url === "http://intranet.example/"
  )
  const local = cookieOrFail(
    chromiumCookie(
      { ...row, host_key: "localhost", is_secure: 0, source_scheme: 0 },
      "v",
      NOW
    )
  )
  check(
    "with no record, a dev server on this machine is http://",
    local?.url === "http://localhost/"
  )

  const session = cookieOrFail(
    chromiumCookie({ ...row, is_persistent: 0 }, "v", NOW)
  )
  check(
    "a session cookie is read as one",
    session !== null && session.expirationDate === undefined
  )

  // What `node:sqlite` hands back once integers are read as `bigint`, which
  // they have to be: this expiry is past `Number.MAX_SAFE_INTEGER`.
  const big = cookieOrFail(
    chromiumCookie(
      {
        host_key: ".github.com",
        top_frame_site_key: "",
        name: "big",
        path: "/",
        expires_utc: 13472287763856637n,
        is_secure: 1n,
        is_httponly: 0n,
        samesite: 2n,
        is_persistent: 1n,
        source_scheme: 2n,
      },
      "v",
      NOW
    )
  )
  check(
    "bigint columns are read",
    big?.secure === true &&
      big.sameSite === "strict" &&
      Math.round(big.expirationDate ?? 0) === 1827814164,
    big
  )
  const insecureNone = cookieOrFail(
    chromiumCookie(
      { ...row, host_key: "github.com", samesite: 0, is_secure: 0 },
      "v",
      NOW
    )
  )
  check("a host without a dot is host-only", insecureNone?.domain === undefined)
  check(
    "None without Secure is left unspecified, which Chromium accepts",
    insecureNone?.sameSite === "unspecified"
  )
}

section("Firefox rows")
{
  const row = {
    host: ".mozilla.org",
    name: "a",
    value: "b",
    path: "/",
    expiry: (NOW + 60) * 1000,
    isSecure: 0,
    isHttpOnly: 0,
    sameSite: 2,
    schemeMap: 2,
    originAttributes: "",
  }
  const cookie = cookieOrFail(firefoxCookie(row, NOW))
  check(
    "a millisecond expiry is read as one",
    cookie?.expirationDate === NOW + 60
  )
  check("Strict", cookie?.sameSite === "strict")
  check(
    "set over HTTPS (schemeMap), it goes in through https://",
    cookie?.url === "https://mozilla.org/"
  )
  check(
    "a second expiry too",
    cookieOrFail(firefoxCookie({ ...row, expiry: NOW + 60 }, NOW))
      ?.expirationDate ===
      NOW + 60
  )
  check(
    "a partitioned one is not brought over",
    firefoxCookie(
      { ...row, originAttributes: "^partitionKey=%28https%2Cexample.com%29" },
      NOW
    ) === "partitioned"
  )
  check(
    "an expired one is expired",
    firefoxCookie({ ...row, expiry: NOW - 1 }, NOW) === "expired"
  )
}

section("profiles")
{
  const chrome = chromiumProfiles({
    profile: {
      info_cache: {
        Default: { name: "azoom.jp" },
        "Profile 3": { name: "Dương" },
        "Profile 4": { name: "NT" },
      },
      profiles_order: ["Profile 3", "Default"],
    },
  })
  check(
    "Chromium's, in the menu's order, unlisted ones after",
    chrome.map((each) => each.dir).join() === "Profile 3,Default,Profile 4",
    chrome
  )
  check("with their names", chrome[0]?.name === "Dương")
  check("no Local State is no profiles", chromiumProfiles(null).length === 0)

  const firefox = firefoxProfiles(
    [
      "[Install4F96D1932A9F858E]",
      "Default=Profiles/abc.default-release",
      "",
      "[Profile1]",
      "Name=default",
      "IsRelative=1",
      "Path=Profiles/xyz.default",
      "",
      "[Profile0]",
      "Name=default-release",
      "IsRelative=0",
      "Path=/abs/abc.default-release",
      "",
      "[General]",
      "Version=2",
    ].join("\n")
  )
  check("Firefox's two profiles", firefox.length === 2, firefox)
  check(
    "a relative and an absolute path",
    firefox[0]?.relative === true && firefox[1]?.relative === false
  )
}

section("sites")
{
  const cases: [string, string][] = [
    [".github.com", "github.com"],
    ["accounts.google.com", "google.com"],
    ["shop.example.co.jp", "example.co.jp"],
    ["news.bbc.co.uk", "bbc.co.uk"],
    ["vnexpress.net", "vnexpress.net"],
    ["a.b.c.vn", "c.vn"],
    ["tuoitre.com.vn", "tuoitre.com.vn"],
    ["localhost", "localhost"],
    ["127.0.0.1", "127.0.0.1"],
  ]
  for (const [host, site] of cases) {
    check(`${host} → ${site}`, siteOf(host) === site, siteOf(host))
  }
}

finish()
