import { createHash } from "node:crypto"

import { strToU8, zipSync } from "fflate"

import { Marketplace } from "../src/main/marketplace"
import {
  marketplaceActionOf,
  matchesPlugin,
  parseCatalog,
  type MarketplacePlugin,
} from "../src/shared/marketplace"
import type { PluginInfo } from "../src/shared/plugins"
import { check, finish, section } from "./harness"

/**
 * The plugin marketplace: reading the catalog, searching it, and the checks a
 * download has to pass before its files reach `installPlugin` — against real
 * zips and a fake `fetch`.
 */

const zipOf = (id: string) =>
  zipSync({
    [`${id}-1.0.0/manifest.json`]: strToU8(
      JSON.stringify({ id, name: `Plugin ${id}`, version: "1.0.0" })
    ),
    [`${id}-1.0.0/main.js`]: strToU8("export default class {}"),
  })

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")

const entry = (
  id: string,
  extra: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  id,
  name: `Plugin ${id}`,
  version: "1.0.0",
  description: "Does a thing",
  author: "Somebody",
  download: `https://example.com/${id}.zip`,
  sha256: "a".repeat(64),
  ...extra,
})

const info = (
  id: string,
  version: string | null,
  bundled = false
): PluginInfo => ({
  id,
  bundled,
  manifest: version ? { id, name: id, version } : null,
  hasStyles: false,
  hasIcon: false,
  error: version ? null : "broken",
})

async function throwsWith(
  run: () => Promise<unknown>,
  fragment: string
): Promise<boolean> {
  try {
    await run()
    return false
  } catch (error) {
    return error instanceof Error && error.message.includes(fragment)
  }
}

section("parseCatalog")
{
  const plugins = parseCatalog({
    plugins: [
      entry("good", { tags: ["git", 3, "x".repeat(40)] }),
      entry("good", { name: "A second good" }),
      entry("Bad-Id"),
      entry("plain-http", { download: "http://example.com/a.zip" }),
      entry("no-hash", { sha256: "abc" }),
      entry("upper", { sha256: "A".repeat(64), repo: "javascript:alert(1)" }),
      null,
      "text",
    ],
  })
  check(
    "keeps the valid entries, first of an id",
    plugins.map((plugin) => plugin.id).join() === "good,upper"
  )
  check("keeps string tags under the limit", plugins[0]?.tags.join() === "git")
  check("lower-cases the hash", plugins[1]?.sha256 === "a".repeat(64))
  check("drops a repo that is not https", plugins[1]?.repo === null)
  let threw = false
  try {
    parseCatalog({ nope: [] })
  } catch {
    threw = true
  }
  check("a file with no list throws", threw)
}

section("matchesPlugin")
{
  const plugin = {
    id: "git-blame",
    name: "Git blame",
    description: "Who last changed a line",
    tags: ["history"],
  }
  check("empty query matches", matchesPlugin(plugin, "  "))
  check("words across fields", matchesPlugin(plugin, "GIT changed"))
  check("a tag", matchesPlugin(plugin, "histo"))
  check("every word must match", !matchesPlugin(plugin, "git eslint"))
}

section("marketplaceActionOf")
{
  const [listed] = parseCatalog({ plugins: [entry("p", { version: "1.2.0" })] })
  const it = listed as MarketplacePlugin
  check("nothing installed", marketplaceActionOf(it, undefined) === "install")
  check("older copy", marketplaceActionOf(it, info("p", "1.1.9")) === "update")
  check("same", marketplaceActionOf(it, info("p", "1.2.0")) === "installed")
  check("newer", marketplaceActionOf(it, info("p", "2.0.0")) === "installed")
  check("broken copy", marketplaceActionOf(it, info("p", null)) === "update")
  check(
    "built-in id",
    marketplaceActionOf(it, info("p", "0.1.0", true)) === "builtin"
  )
}

section("Marketplace")
{
  const good = zipOf("hello")
  const other = zipOf("other")
  const catalog = {
    plugins: [
      entry("hello", { sha256: sha(good) }),
      entry("tampered", {
        sha256: "0".repeat(64),
        download: "https://example.com/hello.zip",
      }),
      entry("liar", {
        sha256: sha(other),
        download: "https://example.com/other.zip",
      }),
      entry("gone", { download: "https://example.com/gone.zip" }),
    ],
  }
  const requests: string[] = []
  let clock = 0
  const fetch = async (url: string): Promise<Response> => {
    requests.push(url)
    if (url === "https://catalog.test/plugins.json") {
      return new Response(JSON.stringify(catalog))
    }
    if (url === "https://example.com/hello.zip") return new Response(good)
    if (url === "https://example.com/other.zip") return new Response(other)
    return new Response("missing", { status: 404 })
  }
  const market = new Marketplace({
    fetch,
    url: "https://catalog.test/plugins.json",
    now: () => clock,
  })

  await market.catalog()
  await market.catalog()
  check(
    "the catalog is held",
    requests.filter((url) => url.endsWith("plugins.json")).length === 1
  )
  clock += 11 * 60 * 1000
  await market.catalog()
  check(
    "and read again once stale",
    requests.filter((url) => url.endsWith("plugins.json")).length === 2
  )

  const files = await market.download("hello")
  check("downloads and unpacks a good entry", files.manifest.includes("hello"))
  check(
    "a checksum mismatch is refused",
    await throwsWith(() => market.download("tampered"), "checksum")
  )
  check(
    "a manifest naming another id is refused",
    await throwsWith(() => market.download("liar"), "different plugin")
  )
  check(
    "a failed download says so",
    await throwsWith(() => market.download("gone"), "404")
  )
  check(
    "an id not in the catalog is refused",
    await throwsWith(() => market.download("nope"), "not in the plugin")
  )

  const down = new Marketplace({
    fetch: async () => new Response("", { status: 503 }),
    url: "https://catalog.test/plugins.json",
  })
  check(
    "an unreachable catalog throws its status",
    await throwsWith(() => down.catalog(), "503")
  )
}

finish()
