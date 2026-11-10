/**
 * The plugin marketplace, as both sides read it: one JSON file in this
 * repository (`marketplace/plugins.json`) that main fetches and the renderer
 * searches. Installing goes through main alone — the renderer names an id, main
 * looks it up in the catalog it fetched and downloads that entry's zip, so no
 * URL the renderer holds ever becomes a download.
 *
 * Pure and shared (`test/marketplace.ts`). `docs/design.md` § The plugin
 * marketplace.
 */

import { isPluginId, type PluginInfo } from "./plugins"
import { isNewer } from "./version"

/**
 * Where the catalog is read from: the repository's `main`, so listing a plugin
 * is a merged pull request and nothing has to be deployed for it.
 * `VEYSTUDIO_MARKETPLACE_URL` in main's environment overrides it, for a catalog
 * being tried out on this machine.
 */
export const MARKETPLACE_URL =
  "https://raw.githubusercontent.com/veystudioapp/vey/main/marketplace/plugins.json"

/** One entry of the catalog. */
export type MarketplacePlugin = {
  id: string
  name: string
  version: string
  description: string
  author: string
  /** The plugin's source, for somebody who wants to read it first. */
  repo: string | null
  /** An `https` URL of the plugin's `.zip`. */
  download: string
  /** The zip's SHA-256, lower-case hex — checked before anything is unpacked. */
  sha256: string
  tags: string[]
}

const SHA256 = /^[0-9a-f]{64}$/

function textOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text && text.length <= max ? text : null
}

function httpsOf(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

/**
 * The catalog's entries, each narrowed: one missing a field it needs, or with a
 * download that is not `https` or a hash that is not one, is dropped rather
 * than failing the whole list, and a second entry under an id already read is
 * dropped too — which one an install meant would be a guess.
 */
export function parseCatalog(raw: unknown): MarketplacePlugin[] {
  const list = (raw as { plugins?: unknown } | null)?.plugins
  if (!Array.isArray(list)) throw new Error("The catalog has no plugins list.")
  const seen = new Set<string>()
  const plugins: MarketplacePlugin[] = []
  for (const item of list as unknown[]) {
    if (!item || typeof item !== "object") continue
    const entry = item as Record<string, unknown>
    const id = entry.id
    const name = textOf(entry.name, 80)
    const version = textOf(entry.version, 40)
    const download = httpsOf(entry.download)
    const sha256 =
      typeof entry.sha256 === "string" ? entry.sha256.toLowerCase() : ""
    if (!isPluginId(id) || seen.has(id)) continue
    if (!name || !version || !download || !SHA256.test(sha256)) continue
    seen.add(id)
    plugins.push({
      id,
      name,
      version,
      description: textOf(entry.description, 500) ?? "",
      author: textOf(entry.author, 80) ?? "",
      repo: httpsOf(entry.repo),
      download,
      sha256,
      tags: Array.isArray(entry.tags)
        ? entry.tags
            .map((tag) => textOf(tag, 30))
            .filter((tag): tag is string => tag !== null)
            .slice(0, 8)
        : [],
    })
  }
  return plugins
}

/** What a search box matches a plugin on, the catalog's or one installed. */
export type Searchable = {
  id: string
  name: string
  description?: string
  author?: string
  tags?: string[]
}

/**
 * Whether `plugin` matches `query`: every word of it, case-folded, somewhere in
 * the name, id, description, author or tags — so "git blame" finds a plugin
 * whose name says one and description the other.
 */
export function matchesPlugin(plugin: Searchable, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [
    plugin.name,
    plugin.id,
    plugin.description ?? "",
    plugin.author ?? "",
    ...(plugin.tags ?? []),
  ]
    .join("\n")
    .toLocaleLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * What the marketplace offers for an entry, given what is on disk under its id:
 * `install` for nothing there, `update` for an older copy of the user's,
 * `installed` for one as new or newer, and `builtin` for an id the app ships —
 * which an install would refuse.
 */
export type MarketplaceAction = "install" | "update" | "installed" | "builtin"

export function marketplaceActionOf(
  entry: MarketplacePlugin,
  installed: PluginInfo | undefined
): MarketplaceAction {
  if (!installed) return "install"
  if (installed.bundled) return "builtin"
  const version = installed.manifest?.version
  // A copy whose manifest no longer reads is one an install would mend.
  if (!version) return "update"
  return isNewer(entry.version, version) ? "update" : "installed"
}
