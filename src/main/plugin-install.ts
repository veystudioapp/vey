import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import { unzipSync } from "fflate"

import {
  isPluginId,
  pluginIconPathOf,
  type PluginInstall,
} from "../shared/plugins"
import { parseManifest, type PluginRoots } from "./plugins"

/**
 * Putting a plugin from outside the app into the user's plugins folder — from a
 * folder or a `.zip` today, and from the marketplace when there is one, which
 * will download and hand its bytes to the same `installPlugin`.
 *
 * An install **copies four files and nothing else**: `manifest.json`,
 * `main.js`, `styles.css` and the icon the manifest names, the ones
 * `pluginFileOf` serves. A plugin's
 * folder is usually its repository — `src/`, `node_modules/`, a `.git` — and
 * none of that is read by the app, so none of it is carried in. It is also what
 * keeps a zip from writing anywhere: no path inside an archive becomes a path
 * on disk, only those names under a directory this module chose.
 *
 * Free of `electron` (`test/plugins.ts`); the pickers are `host`'s.
 */

/** The ceilings on what is read in, so a zip bomb is refused rather than
 * inflated. A plugin's script is code somebody wrote, not an asset store. */
const LIMITS = {
  "manifest.json": 64 * 1024,
  "main.js": 10 * 1024 * 1024,
  "styles.css": 2 * 1024 * 1024,
  // A mark drawn at 16px; anything this size is a photograph, not an icon.
  icon: 1024 * 1024,
} as const

type InstallFile = keyof typeof LIMITS

/** A plugin's files, read out of wherever it came from. */
export type PluginFiles = {
  manifest: string
  main: Uint8Array
  styles: Uint8Array | null
  /** At the path the manifest names, `/`-separated. */
  icon: { path: string; bytes: Uint8Array } | null
}

/** The icon path a manifest's text names, or null — for none, and for one
 * `parseManifest` will refuse when the install reads the manifest properly. */
function iconPathIn(manifest: string): string | null {
  try {
    const raw: unknown = JSON.parse(manifest)
    return pluginIconPathOf((raw as { icon?: unknown } | null)?.icon)
  } catch {
    return null
  }
}

/** The files from a folder on disk — the one a plugin was built into. */
export async function readPluginFolder(dir: string): Promise<PluginFiles> {
  const read = async (
    name: InstallFile,
    relative: string = name
  ): Promise<Uint8Array | null> => {
    const file = path.join(dir, ...relative.split("/"))
    let size: number
    try {
      size = (await stat(file)).size
    } catch {
      return null
    }
    if (size > LIMITS[name]) throw new Error(`${relative} is too large.`)
    return readFile(file)
  }

  const manifest = await read("manifest.json")
  if (!manifest) throw new Error("That folder has no manifest.json.")
  const main = await read("main.js")
  if (!main) throw new Error("That folder has no main.js.")
  const text = new TextDecoder().decode(manifest)
  const iconPath = iconPathIn(text)
  const icon = iconPath ? await read("icon", iconPath) : null
  return {
    manifest: text,
    main,
    styles: await read("styles.css"),
    icon: iconPath && icon ? { path: iconPath, bytes: icon } : null,
  }
}

/**
 * The files from a `.zip`.
 *
 * At the archive's root, or inside **one** folder at its root — which is how
 * GitHub's "Download ZIP" and most release archives are laid out
 * (`my-plugin-1.0.0/manifest.json`). Anything deeper, or two manifests, is
 * refused rather than guessed between.
 */
export function readPluginZip(bytes: Uint8Array): PluginFiles {
  const manifests: string[] = []
  // A first pass that inflates nothing: only the names, to find the folder.
  unzipSync(bytes, {
    filter: (entry) => {
      if (/^(?:[^/]+\/)?manifest\.json$/.test(entry.name)) {
        manifests.push(entry.name)
      }
      return false
    },
  })
  if (manifests.length === 0) {
    throw new Error("That archive has no manifest.json at its top level.")
  }
  if (manifests.length > 1) {
    throw new Error("That archive holds more than one plugin.")
  }
  const prefix = manifests[0]!.slice(0, -"manifest.json".length)

  // The icon is not among these: where it is is the manifest's to say, so it
  // is a third pass once the manifest has been read.
  const fixed: InstallFile[] = ["manifest.json", "main.js", "styles.css"]
  const files = inflate(
    bytes,
    new Map(fixed.map((name) => [prefix + name, name]))
  )

  const manifest = files[prefix + "manifest.json"]
  const main = files[prefix + "main.js"]
  if (!manifest) throw new Error("That archive has no manifest.json.")
  if (!main) throw new Error("That archive has no main.js beside its manifest.")
  const text = new TextDecoder().decode(manifest)
  const iconPath = iconPathIn(text)
  const icon = iconPath
    ? inflate(bytes, new Map([[prefix + iconPath, "icon"]]))[prefix + iconPath]
    : undefined
  return {
    manifest: text,
    main,
    styles: files[prefix + "styles.css"] ?? null,
    icon: iconPath && icon ? { path: iconPath, bytes: icon } : null,
  }
}

/** The entries of `bytes` named in `wanted`, each held to its file's limit. */
function inflate(
  bytes: Uint8Array,
  wanted: Map<string, InstallFile>
): Record<string, Uint8Array> {
  return unzipSync(bytes, {
    filter: (entry) => {
      const name = wanted.get(entry.name)
      if (!name) return false
      if (entry.originalSize > LIMITS[name]) {
        throw new Error(`${entry.name.split("/").at(-1)} is too large.`)
      }
      return true
    },
  })
}

/**
 * Writes a plugin into the user's folder under the id its manifest gives —
 * not the name of the folder or archive it came in, which is `my-plugin-main`
 * as often as not.
 *
 * Installing an id that is already there **replaces** it, which is what an
 * update is. The new copy is written beside the old one and swapped in by
 * rename, so a failure part-way leaves the installed plugin as it was. A
 * built-in plugin's id is refused: it would be listed as broken and never run.
 */
export async function installPlugin(
  roots: PluginRoots,
  files: PluginFiles
): Promise<PluginInstall> {
  let raw: unknown
  try {
    raw = JSON.parse(files.manifest)
  } catch {
    throw new Error("manifest.json is not valid JSON.")
  }
  const id = (raw as { id?: unknown } | null)?.id
  if (!isPluginId(id)) {
    throw new Error(
      "manifest.json needs an `id` of lower-case letters, digits and dashes."
    )
  }
  const manifest = parseManifest(files.manifest, id)

  if (roots.bundled && (await exists(path.join(roots.bundled, id)))) {
    throw new Error(`"${id}" is the id of a built-in plugin.`)
  }

  const target = path.join(roots.user, id)
  // Dot-named, so a listing that runs meanwhile skips both.
  const incoming = path.join(roots.user, `.${id}.installing`)
  const outgoing = path.join(roots.user, `.${id}.replaced`)

  await rm(incoming, { recursive: true, force: true })
  await mkdir(incoming, { recursive: true })
  await writeFile(path.join(incoming, "manifest.json"), files.manifest, "utf8")
  await writeFile(path.join(incoming, "main.js"), files.main)
  if (files.styles) {
    await writeFile(path.join(incoming, "styles.css"), files.styles)
  }
  if (files.icon) {
    const target = path.join(incoming, ...files.icon.path.split("/"))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, files.icon.bytes)
  }

  const replaced = await exists(target)
  await rm(outgoing, { recursive: true, force: true })
  if (replaced) await rename(target, outgoing)
  try {
    await rename(incoming, target)
  } catch (error) {
    if (replaced) await rename(outgoing, target)
    throw error
  }
  await rm(outgoing, { recursive: true, force: true })

  return { id, name: manifest.name, replaced }
}

/**
 * The installed plugin's folder, for removing it — never a built-in one, which
 * is switched off rather than removed, and never anything outside the user's
 * folder, since the id comes from the renderer.
 */
export async function installedPluginDir(
  roots: PluginRoots,
  id: string
): Promise<string> {
  if (!isPluginId(id)) throw new Error(`Not a plugin id: ${id}`)
  if (roots.bundled && (await exists(path.join(roots.bundled, id)))) {
    throw new Error("A built-in plugin can be switched off, not removed.")
  }
  const dir = path.join(roots.user, id)
  if (!(await exists(dir))) throw new Error(`No such plugin: ${id}`)
  return dir
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}
