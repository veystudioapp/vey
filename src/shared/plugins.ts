/**
 * What a plugin is, as both sides have to read it.
 *
 * A plugin is a directory under `workspace/plugins/<id>/` holding a
 * `manifest.json`, a `main.js` and optionally a `styles.css` — Obsidian's shape,
 * and for Obsidian's reason: a directory somebody can drop in by hand is the
 * whole of the install story until there is a list to install from. The
 * renderer loads `main.js` as an ES module off this app's own scheme, which is
 * why the URL is built here — `main/protocol.ts` parses what the renderer
 * builds. `docs/design.md` § Plugins has the argument.
 */

/** Registered as a privileged scheme before the app is ready — see
 * `registerAppScheme`. */
export const PLUGIN_SCHEME = "vsc-plugin"

/**
 * What a plugin's directory may be called, and so what its id may be.
 *
 * Lower case because the id is the URL's **host**, and a host is lower-cased by
 * the URL parser: `My-Plugin` would be requested as `my-plugin` and found by
 * nobody on a case-sensitive disk. No dots or slashes, which is also what keeps
 * it from naming anything outside `plugins/`.
 */
const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export function isPluginId(id: unknown): id is string {
  return typeof id === "string" && PLUGIN_ID.test(id)
}

/**
 * The files a plugin is served from; nothing else in its directory is.
 *
 * `icon` is not a file name but a stand-in for whichever file the manifest's
 * `icon` names — main reads the manifest to find it — so the URL never carries
 * a path out of the page, and the one path it can reach is one the plugin's
 * own manifest declared.
 */
export const PLUGIN_FILES = ["main.js", "styles.css", "icon"] as const
export type PluginFile = (typeof PLUGIN_FILES)[number]

/** What a plugin's icon may be, by extension, and the type it is served as. */
export const PLUGIN_ICON_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

/**
 * The manifest's `icon`, as a path inside the plugin's folder, or null for one
 * that is not: absolute, climbing out with `..`, a Windows path, or not one of
 * `PLUGIN_ICON_TYPES`. `/`-separated whatever the platform, the way a URL and
 * a zip both are; a leading `./` is dropped.
 */
export function pluginIconPathOf(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 255) {
    return null
  }
  if (raw.includes("\\") || raw.includes(":") || raw.startsWith("/")) {
    return null
  }
  const segments = raw.split("/").filter((segment, index) => {
    return !(index === 0 && segment === ".")
  })
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null
  }
  const extension = segments.at(-1)!.split(".").at(-1)!.toLowerCase()
  if (!Object.hasOwn(PLUGIN_ICON_TYPES, extension)) return null
  return segments.join("/")
}

/** `manifest.json`, as far as this app reads it. */
export type PluginManifest = {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** A path inside the plugin's folder — `icon.svg`, `assets/logo.png`. See
   * `pluginIconPathOf`. */
  icon?: string
}

/**
 * One directory under `plugins/`, as the rail's Plugins view draws it.
 *
 * A directory whose manifest could not be read is still listed, with `error`,
 * rather than left out: a plugin somebody just dropped in that silently does
 * not appear is the one failure with nothing on screen to go on.
 */
export type PluginInfo = {
  /** The directory's name, which a valid manifest's `id` has to match. */
  id: string
  /**
   * Shipped inside the app (`plugins/` in the repository, built into the
   * bundle's resources) rather than dropped into the user's folder. A built-in
   * plugin is **on unless switched off**, since it is a feature the app has
   * always had and moving it into a plugin must not make it vanish.
   */
  bundled: boolean
  manifest: PluginManifest | null
  hasStyles: boolean
  /** The manifest names an `icon` and that file is there. */
  hasIcon: boolean
  error: string | null
}

/** What an install put where — see `installPlugin` in `main/plugin-install.ts`. */
export type PluginInstall = {
  id: string
  name: string
  /** An earlier copy of the same id was there and has been replaced. */
  replaced: boolean
}

/** Where an install reads a plugin from. The marketplace will be a third. */
export type PluginSource = "folder" | "zip"

/**
 * The URL one of a plugin's files is loaded from.
 *
 * `bust` is appended as a query because an ES module is cached by URL for the
 * life of the page: without it, Reload would import the copy it already has.
 */
export function pluginUrl(id: string, file: PluginFile, bust?: string): string {
  const query = bust ? `?v=${encodeURIComponent(bust)}` : ""
  return `${PLUGIN_SCHEME}://${id}/${file}${query}`
}

/** The plugin and file a URL names, or null for anything this app does not
 * serve — including a path that is not one of `PLUGIN_FILES`. */
export function pluginFileOf(
  url: string
): { id: string; file: PluginFile } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${PLUGIN_SCHEME}:`) return null
  const id = parsed.hostname
  const file = parsed.pathname.replace(/^\/+/, "")
  if (!isPluginId(id)) return null
  if (!(PLUGIN_FILES as readonly string[]).includes(file)) return null
  return { id, file: file as PluginFile }
}
