import marketplace from "../../../../marketplace/plugins.json"
import { matchesPlugin } from "../../../../src/shared/marketplace"

/*
 * What the marketplace page lists, read at build time from the same two places
 * the app reads: the built-in plugins' manifests (`plugins/<id>/` in the
 * repository) and the catalog the app installs from
 * (`marketplace/plugins.json`). The page is for looking — it holds no
 * download links, since an install belongs to the app, which checks the zip's
 * checksum before unpacking it.
 */

export type ListedPlugin = {
  id: string
  name: string
  version: string
  description: string
  author: string
  repo: string | null
  tags: string[]
  /** The built-in plugin's icon as a URL Vite emitted, or null. */
  icon: string | null
  builtin: boolean
}

type Manifest = {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  icon?: string
}

const manifests = import.meta.glob<Manifest>(
  "../../../../plugins/*/manifest.json",
  { eager: true, import: "default" }
)
const icons = import.meta.glob<string>("../../../../plugins/*/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
})

const BUILTIN_REPO = "https://github.com/veystudioapp/vey/tree/main/plugins"

export const BUILTIN: ListedPlugin[] = Object.entries(manifests)
  .map(([file, manifest]) => {
    const dir = file.slice(0, -"manifest.json".length)
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? "",
      author: manifest.author ?? "Vey",
      repo: `${BUILTIN_REPO}/${manifest.id}`,
      tags: [],
      icon: manifest.icon ? (icons[dir + manifest.icon] ?? null) : null,
      builtin: true,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

type Entry = {
  id?: unknown
  name?: unknown
  version?: unknown
  description?: unknown
  author?: unknown
  repo?: unknown
  tags?: unknown
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/** The catalog's entries, loosely — the app is what refuses a bad one; here an
 * entry without a name is simply not drawn. */
export const COMMUNITY: ListedPlugin[] = (
  (marketplace as { plugins?: Entry[] }).plugins ?? []
)
  .filter((entry) => text(entry.id) && text(entry.name))
  .map((entry) => {
    const repo = text(entry.repo)
    return {
      id: text(entry.id),
      name: text(entry.name),
      version: text(entry.version),
      description: text(entry.description),
      author: text(entry.author),
      repo: repo.startsWith("https://") ? repo : null,
      tags: Array.isArray(entry.tags)
        ? entry.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      icon: null,
      builtin: false,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

/** The app's own search rule, so the page and Plugins › Marketplace find the
 * same plugins for the same words. */
export function matches(plugin: ListedPlugin, query: string): boolean {
  return matchesPlugin(plugin, query)
}
