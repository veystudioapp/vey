import { createHash } from "node:crypto"

import {
  MARKETPLACE_URL,
  parseCatalog,
  type MarketplacePlugin,
} from "../shared/marketplace"
import { readPluginZip, type PluginFiles } from "./plugin-install"

/**
 * The plugin marketplace in main: fetching the catalog and downloading one
 * entry's zip into the files `installPlugin` writes. Free of `electron` —
 * `fetch` is handed in (`Host.fetch`) — so `test/marketplace.ts` drives it with
 * a fake one.
 */

/** How long a fetched catalog is answered from memory: the view is opened and
 * searched again and again, and the file changes when a pull request merges. */
const CATALOG_MS = 10 * 60 * 1000

/** The largest zip downloaded. `installPlugin`'s own ceilings come to ~13 MB
 * of files; this leaves room for an archive carrying a repository beside them. */
const ZIP_LIMIT = 25 * 1024 * 1024

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export class Marketplace {
  private cached: { at: number; plugins: MarketplacePlugin[] } | null = null

  constructor(
    private readonly options: {
      fetch: Fetch
      url?: string
      now?: () => number
    }
  ) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** The catalog, from memory for `CATALOG_MS` unless `refresh`. */
  async catalog(refresh = false): Promise<MarketplacePlugin[]> {
    if (!refresh && this.cached && this.now() - this.cached.at < CATALOG_MS) {
      return this.cached.plugins
    }
    const url = this.options.url ?? MARKETPLACE_URL
    let response: Response
    try {
      response = await this.options.fetch(url)
    } catch {
      throw new Error("Could not reach the plugin marketplace.")
    }
    if (!response.ok) {
      throw new Error(`The plugin marketplace answered ${response.status}.`)
    }
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new Error("The plugin marketplace's catalog is not valid JSON.")
    }
    const plugins = parseCatalog(raw)
    this.cached = { at: this.now(), plugins }
    return plugins
  }

  /**
   * One entry's files, downloaded and checked: the zip's hash against the
   * catalog's before anything is unpacked, and the manifest's id against the
   * entry's — an entry reviewed as `foo` must not install, or update, `bar`.
   * The entry is looked up in the catalog main fetched, never taken from the
   * renderer.
   */
  async download(id: string): Promise<PluginFiles> {
    const entry = (await this.catalog()).find((plugin) => plugin.id === id)
    if (!entry) throw new Error(`"${id}" is not in the plugin marketplace.`)

    let response: Response
    try {
      response = await this.options.fetch(entry.download)
    } catch {
      throw new Error(`Could not download ${entry.name}.`)
    }
    if (!response.ok) {
      throw new Error(`Downloading ${entry.name} answered ${response.status}.`)
    }
    const declared = Number(response.headers.get("content-length"))
    if (declared > ZIP_LIMIT) throw new Error(`${entry.name} is too large.`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > ZIP_LIMIT) {
      throw new Error(`${entry.name} is too large.`)
    }

    const hash = createHash("sha256").update(bytes).digest("hex")
    if (hash !== entry.sha256) {
      throw new Error(
        `${entry.name}'s download does not match the marketplace's checksum, so it was not installed.`
      )
    }

    const files = readPluginZip(bytes)
    let manifestId: unknown
    try {
      manifestId = (JSON.parse(files.manifest) as { id?: unknown } | null)?.id
    } catch {
      manifestId = undefined
    }
    if (manifestId !== entry.id) {
      throw new Error(
        `${entry.name}'s manifest names a different plugin, so it was not installed.`
      )
    }
    return files
  }
}
