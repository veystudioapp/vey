import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import { unzipSync } from "fflate"

import {
  isSoundPackId,
  parseSoundPack,
  SOUND_FILE,
  soundPackIdOf,
  type SoundPackAudio,
  type SoundPackInfo,
  type SoundPackInstall,
} from "../shared/sound-packs"

/**
 * The typing and click sounds' packs on disk — `docs/design.md` § Typing
 * sounds.
 *
 * Two folders, the plugins' shape: the **built-in** packs this build carries
 * (`resources/sound-packs/`, an `extraResources` entry) and the user's
 * `workspace/sound-packs/<id>/`, filled by **importing** a Mechvibes pack from
 * a folder or a `.zip`. An import copies `config.json` as it is — so the pack
 * stays one Mechvibes reads — and the audio files it names, nothing else; no
 * path inside a zip becomes a path on disk except those names, already held
 * inside the pack by `packFileOf`.
 *
 * Free of `electron` (`test/sound-packs.ts`); the pickers and the trash are
 * `host`'s.
 */

export type SoundPackRoots = { bundled: string | null; user: string }

/** A pack's files, read out of wherever it came from. */
export type SoundPackFiles = {
  config: string
  /** By the relative path the config names them under. */
  audio: Map<string, Uint8Array>
}

/** A config is text; a pack is a recording of one keyboard, so anything far
 * past these is not one — and a zip bomb is refused rather than inflated. */
const CONFIG_LIMIT = 2 * 1024 * 1024
const FILE_LIMIT = 64 * 1024 * 1024
const TOTAL_LIMIT = 160 * 1024 * 1024

const CONFIG = "config.json"

/** Built-in first, then the user's, each by name. A folder whose config does
 * not parse is left out rather than listed as a pack that plays nothing. */
export async function listSoundPacks(
  roots: SoundPackRoots
): Promise<SoundPackInfo[]> {
  const listed = async (dir: string | null, builtin: boolean) => {
    if (!dir) return []
    let names: string[]
    try {
      names = (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && isSoundPackId(entry.name))
        .map((entry) => entry.name)
    } catch {
      return []
    }
    const packs = await Promise.all(
      names.map(async (id): Promise<SoundPackInfo | null> => {
        try {
          const folder = path.join(dir, id)
          const text = await readFile(path.join(folder, CONFIG), "utf8")
          const pack = parseSoundPack(text, await audioFilesIn(folder))
          return {
            id,
            name: pack.name,
            author: pack.author,
            kind: pack.kind,
            builtin,
          }
        } catch {
          return null
        }
      })
    )
    return packs
      .filter((pack): pack is SoundPackInfo => pack !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  const bundled = await listed(roots.bundled, true)
  const taken = new Set(bundled.map((pack) => pack.id))
  const user = (await listed(roots.user, false)).filter(
    (pack) => !taken.has(pack.id)
  )
  return [...bundled, ...user]
}

/** A pack and the bytes of every file it plays — the renderer decodes them. */
export async function readSoundPack(
  roots: SoundPackRoots,
  id: string
): Promise<SoundPackAudio> {
  const folder = await soundPackDir(roots, id)
  const text = await readFile(path.join(folder, CONFIG), "utf8")
  const pack = parseSoundPack(text, await audioFilesIn(folder))
  const audio: Record<string, Uint8Array> = {}
  await Promise.all(
    pack.files.map(async (file) => {
      try {
        audio[file] = await readFile(path.join(folder, ...file.split("/")))
      } catch {
        // A missing file silences the keys that play it and no others —
        // Mechvibes' rule, and the renderer's to apply.
      }
    })
  )
  return { id, pack, audio }
}

/** The folder a pack is in — the user's copy only where no built-in pack has
 * that id, since the id comes from the renderer. */
async function soundPackDir(roots: SoundPackRoots, id: string) {
  if (!isSoundPackId(id)) throw new Error(`Not a sound pack id: ${id}`)
  if (roots.bundled && (await exists(path.join(roots.bundled, id, CONFIG)))) {
    return path.join(roots.bundled, id)
  }
  const dir = path.join(roots.user, id)
  if (!(await exists(path.join(dir, CONFIG)))) {
    throw new Error(`No such sound pack: ${id}`)
  }
  return dir
}

/** The audio files at a folder's top level, for a V1 pack naming none. */
async function audioFilesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => SOUND_FILE.test(name)).sort()
  } catch {
    return []
  }
}

/** A pack from a folder on disk — the one Mechvibes would be pointed at. */
export async function readSoundPackFolder(
  dir: string
): Promise<SoundPackFiles> {
  const configPath = path.join(dir, CONFIG)
  let size: number
  try {
    size = (await stat(configPath)).size
  } catch {
    throw new Error("That folder has no config.json.")
  }
  if (size > CONFIG_LIMIT) throw new Error("config.json is too large.")
  const config = await readFile(configPath, "utf8")
  const pack = parseSoundPack(config, await audioFilesIn(dir))

  const audio = new Map<string, Uint8Array>()
  let total = 0
  for (const file of pack.files) {
    const full = path.join(dir, ...file.split("/"))
    let bytes: number
    try {
      bytes = (await stat(full)).size
    } catch {
      throw new Error(`${file} is missing from that folder.`)
    }
    total += bytes
    if (bytes > FILE_LIMIT || total > TOTAL_LIMIT) {
      throw new Error(`${file} is too large.`)
    }
    audio.set(file, await readFile(full))
  }
  return { config, audio }
}

/**
 * A pack from a `.zip` — Mechvibes' library downloads and the editor's
 * exports alike. At the archive's root or inside **one** folder, as GitHub's
 * downloads are; two configs are refused rather than guessed between.
 */
export function readSoundPackZip(bytes: Uint8Array): SoundPackFiles {
  const configs: string[] = []
  const names: string[] = []
  // A first pass that inflates nothing: only the names.
  unzipSync(bytes, {
    filter: (entry) => {
      if (/^(?:[^/]+\/)?config\.json$/.test(entry.name)) {
        configs.push(entry.name)
      }
      names.push(entry.name)
      return false
    },
  })
  // A macOS zip carries `__MACOSX/<folder>/config.json` beside the real one.
  const real = configs.filter((name) => !name.startsWith("__MACOSX/"))
  if (real.length === 0) {
    throw new Error("That archive has no config.json at its top level.")
  }
  if (real.length > 1) {
    throw new Error("That archive holds more than one sound pack.")
  }
  const prefix = real[0]!.slice(0, -CONFIG.length)

  const configBytes = unzipSync(bytes, {
    filter: (entry) => {
      if (entry.name !== real[0]) return false
      if (entry.originalSize > CONFIG_LIMIT) {
        throw new Error("config.json is too large.")
      }
      return true
    },
  })[real[0]!]
  if (!configBytes) throw new Error("That archive has no config.json.")
  const config = new TextDecoder().decode(configBytes)

  const beside = names
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .filter((name) => !name.includes("/") && SOUND_FILE.test(name))
    .sort()
  const pack = parseSoundPack(config, beside)

  const wanted = new Set(pack.files.map((file) => prefix + file))
  let total = 0
  const inflated = unzipSync(bytes, {
    filter: (entry) => {
      if (!wanted.has(entry.name)) return false
      total += entry.originalSize
      if (entry.originalSize > FILE_LIMIT || total > TOTAL_LIMIT) {
        throw new Error(`${entry.name.slice(prefix.length)} is too large.`)
      }
      return true
    },
  })
  const audio = new Map<string, Uint8Array>()
  for (const file of pack.files) {
    const data = inflated[prefix + file]
    if (!data) throw new Error(`${file} is missing from that archive.`)
    audio.set(file, data)
  }
  return { config, audio }
}

/**
 * Writes a pack into the user's folder under its config's id (or its name,
 * slugged). The same id again **replaces** it — written beside and swapped in
 * by rename, so a failure leaves the old copy — and a built-in pack's id is
 * refused, since it would never be the one played.
 */
export async function installSoundPack(
  roots: SoundPackRoots,
  files: SoundPackFiles
): Promise<SoundPackInstall> {
  const pack = parseSoundPack(files.config, [...files.audio.keys()])
  const id = soundPackIdOf(JSON.parse(files.config), pack.name)
  if (roots.bundled && (await exists(path.join(roots.bundled, id)))) {
    throw new Error(`"${id}" is the id of a built-in sound pack.`)
  }

  await mkdir(roots.user, { recursive: true })
  const target = path.join(roots.user, id)
  // Dot-named, so a listing that runs meanwhile skips both.
  const incoming = path.join(roots.user, `.${id}.installing`)
  const outgoing = path.join(roots.user, `.${id}.replaced`)

  await rm(incoming, { recursive: true, force: true })
  await mkdir(incoming, { recursive: true })
  await writeFile(path.join(incoming, CONFIG), files.config, "utf8")
  for (const [file, bytes] of files.audio) {
    const out = path.join(incoming, ...file.split("/"))
    await mkdir(path.dirname(out), { recursive: true })
    await writeFile(out, bytes)
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
  return { id, name: pack.name, replaced }
}

/** An imported pack's folder, for the trash — never a built-in one. */
export async function installedSoundPackDir(
  roots: SoundPackRoots,
  id: string
): Promise<string> {
  if (!isSoundPackId(id)) throw new Error(`Not a sound pack id: ${id}`)
  if (roots.bundled && (await exists(path.join(roots.bundled, id)))) {
    throw new Error("A built-in sound pack cannot be removed.")
  }
  const dir = path.join(roots.user, id)
  if (!(await exists(dir))) throw new Error(`No such sound pack: ${id}`)
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
