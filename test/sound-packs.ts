import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { strToU8, zipSync } from "fflate"

import {
  installedSoundPackDir,
  installSoundPack,
  listSoundPacks,
  readSoundPack,
  readSoundPackFolder,
  readSoundPackZip,
} from "../src/main/sound-packs"
import {
  DEFAULT_SOUND_PACKS,
  mouseCodeOf,
  playbackRateOf,
  PITCH_SPREAD,
  resolveSoundPack,
  segmentSeconds,
} from "../src/renderer/lib/typing-sounds/choice"
import {
  isSoundPackId,
  packFileOf,
  parseSoundPack,
  soundPackIdOf,
  type SoundPackInfo,
} from "../src/shared/sound-packs"
import { check, finish, section } from "./harness"

/**
 * The typing and click sounds' Mechvibes packs: reading both generations of
 * `config.json`, keyboard and mouse, importing from real folders and real archives, and the
 * built-in packs this repository carries actually parsing.
 */

async function throwsWith(
  run: () => Promise<unknown> | unknown,
  fragment: string
): Promise<boolean> {
  try {
    await run()
    return false
  } catch (error) {
    return error instanceof Error && error.message.includes(fragment)
  }
}

const v2 = (extra: object = {}) =>
  JSON.stringify({
    config_version: "2",
    id: "my-pack",
    name: "My Pack",
    author: "Somebody",
    definition_method: "single",
    audio_file: "sound.ogg",
    definitions: {
      KeyA: {
        timing: [
          [100, 150],
          [150, 200],
        ],
      },
      Space: { timing: [[300, 400]] },
      MouseLeft: { timing: [[0, 10]] },
      KeyB: {
        timing: [
          [1, 2],
          [2, 3],
          [3, 4],
        ],
      },
      KeyC: { timing: [[50, 40]] },
    },
    ...extra,
  })

section("V2")
{
  const pack = parseSoundPack(v2())
  check(
    "name and author",
    pack.name === "My Pack" && pack.author === "Somebody"
  )
  check(
    "two segments are a press and a release",
    pack.keys.KeyA?.press.start === 100 &&
      pack.keys.KeyA.press.end === 150 &&
      pack.keys.KeyA.release?.start === 150 &&
      pack.keys.KeyA.release.end === 200,
    pack.keys.KeyA
  )
  check(
    "one segment is a press alone",
    pack.keys.Space?.press.end === 400 && pack.keys.Space.release === null
  )
  check(
    "a keyboard pack's stray mouse button is left out",
    pack.kind === "keyboard" && !("MouseLeft" in pack.keys)
  )
  check("three segments play nothing, as in Mechvibes", !("KeyB" in pack.keys))
  check("a backwards segment plays nothing", !("KeyC" in pack.keys))
  check("files are the one audio file", pack.files.join() === "sound.ogg")
  check("volume defaults to 1", pack.volume === 1 && !pack.randomPitch)

  const bare = parseSoundPack(
    JSON.stringify({
      name: "Bare",
      author: "x",
      audio_file: "./a.wav",
      defs: { KeyA: [[0, 10]] },
      options: { recommended_volume: 5, random_pitch: true },
    })
  )
  check(
    "`defs` and a bare timing array are read",
    bare.keys.KeyA?.press.file === "a.wav"
  )
  check("volume is capped at 2", bare.volume === 2 && bare.randomPitch)

  const multi = parseSoundPack(
    JSON.stringify({
      name: "Multi",
      author: "x",
      definition_method: "multi",
      audio_file: "main.ogg",
      definitions: {
        KeyA: { audio_file: "a.ogg", timing: [[0, 50]] },
        KeyB: { audio_file: "b.ogg" },
        KeyC: { timing: [[10, 20]] },
      },
    })
  )
  check(
    "a multi key plays its own file",
    multi.keys.KeyA?.press.file === "a.ogg"
  )
  check(
    "a multi key without timing plays its whole file",
    multi.keys.KeyB?.press.start === 0 && multi.keys.KeyB.press.end === null
  )
  check(
    "a multi key without a file plays the pack's",
    multi.keys.KeyC?.press.file === "main.ogg"
  )
  check(
    "a newer format is refused",
    await throwsWith(
      () => parseSoundPack(v2({ config_version: 3 })),
      "newer version"
    )
  )
  check(
    "a config with no playable key is refused",
    await throwsWith(
      () =>
        parseSoundPack(
          JSON.stringify({ name: "x", audio_file: "a.ogg", definitions: {} })
        ),
      "no key or button"
    )
  )
}

section("mouse packs")
{
  const mouse = parseSoundPack(
    JSON.stringify({
      name: "Clicks",
      author: "x",
      audio_file: "click.mp3",
      definitions: {
        MouseLeft: {
          timing: [
            [26, 156],
            [176, 545],
          ],
        },
        MouseRight: { timing: [[0, 20]] },
      },
    })
  )
  check("every key a button is a mouse pack", mouse.kind === "mouse")
  check(
    "its buttons press and release",
    mouse.keys.MouseLeft?.release?.end === 545 &&
      mouse.keys.MouseRight?.release === null
  )
  const declared = parseSoundPack(
    JSON.stringify({
      name: "Declared",
      author: "x",
      soundpack_type: "Mouse",
      audio_file: "a.ogg",
      definitions: { MouseLeft: [[0, 1]], KeyA: [[1, 2]] },
    })
  )
  check(
    "`soundpack_type` wins, and keeps the buttons alone",
    declared.kind === "mouse" &&
      Object.keys(declared.keys).join() === "MouseLeft"
  )
  const v1 = parseSoundPack(
    JSON.stringify({
      name: "Old mouse",
      mouse: true,
      key_define_type: "multi",
      defines: { "1": "l.wav", "01": "l-up.wav", "2": "r.wav" },
    })
  )
  check(
    "a V1 mouse pack reads its codes as buttons, release and all",
    v1.kind === "mouse" &&
      v1.keys.MouseLeft?.press.file === "l.wav" &&
      v1.keys.MouseLeft.release?.file === "l-up.wav" &&
      v1.keys.MouseRight?.press.file === "r.wav",
    v1.keys
  )
  check(
    "buttons as Mechvibes names them",
    mouseCodeOf(0) === "MouseLeft" &&
      mouseCodeOf(1) === "MouseMiddle" &&
      mouseCodeOf(2) === "MouseRight" &&
      mouseCodeOf(4) === "Mouse5" &&
      mouseCodeOf(7) === null
  )
}

section("V1")
{
  const single = parseSoundPack(
    JSON.stringify({
      id: "sound-pack-1",
      name: "Old",
      key_define_type: "single",
      sound: "sound.ogg",
      defines: { "30": [1000, 80], "57": [2000, 120], "3675": [3000, 50] },
    })
  )
  check(
    "[start, duration] becomes [start, start + duration]",
    single.keys.KeyA?.press.start === 1000 &&
      single.keys.KeyA.press.end === 1080,
    single.keys.KeyA
  )
  check(
    "iohook codes map to KeyboardEvent.code",
    single.keys.Space?.press.start === 2000 && !!single.keys.MetaLeft
  )
  check("a V1 key has no release", single.keys.KeyA?.release === null)

  const fallback = parseSoundPack(
    JSON.stringify({
      name: "No sound field",
      key_define_type: "single",
      defines: { "30": [0, 10] },
    }),
    ["readme.txt", "click.wav"]
  )
  check(
    "a V1 single pack naming no file plays the one beside it",
    fallback.keys.KeyA?.press.file === "click.wav"
  )

  const multi = parseSoundPack(
    JSON.stringify({
      name: "Old multi",
      key_define_type: "multi",
      defines: {
        "030": "a-up.wav",
        "30": "a.wav",
        "57": null,
        "61000": "nav.wav",
        "57416": "up.wav",
      },
    })
  )
  check(
    "a multi key plays its whole file",
    multi.keys.KeyA?.press.file === "a.wav" &&
      multi.keys.KeyA.press.end === null
  )
  check(
    "a zero-padded code is that key's release, whatever the order",
    multi.keys.KeyA?.release?.file === "a-up.wav",
    multi.keys.KeyA
  )
  check("a null define is silent", !("Space" in multi.keys))
  check(
    "a Num Lock-off code never replaces the key it stands for",
    multi.keys.ArrowUp?.press.file === "up.wav",
    multi.keys.ArrowUp
  )
}

section("names from a config")
{
  check("a plain file", packFileOf("sound.ogg") === "sound.ogg")
  check("./ and backslashes", packFileOf(".\\audio\\a.WAV") === "audio/a.WAV")
  check("climbing out", packFileOf("../x.ogg") === null)
  check("absolute", packFileOf("/etc/x.ogg") === null)
  check("a drive", packFileOf("C:/x.ogg") === null)
  check("not audio", packFileOf("evil.js") === null)
  check("valid id", isSoundPackId("mv-0123abc") && !isSoundPackId("../x"))
  check("id from config", soundPackIdOf({ id: "nice-id" }, "x") === "nice-id")
  check(
    "id from a name",
    soundPackIdOf({ id: "bad/id" }, "Bàn phím Cơ!") === "ban-phim-co"
  )
}

section("choosing and playing")
{
  const packs = [
    { id: "a", name: "A", author: null, kind: "keyboard", builtin: true },
    {
      id: DEFAULT_SOUND_PACKS.keyboard,
      name: "D",
      author: null,
      kind: "keyboard",
      builtin: true,
    },
    { id: "m", name: "M", author: null, kind: "mouse", builtin: false },
  ] as const satisfies SoundPackInfo[]
  check(
    "the chosen pack",
    resolveSoundPack("a", [...packs], "keyboard") === "a"
  )
  check(
    "a removed choice falls back to the default",
    resolveSoundPack("gone", [...packs], "keyboard") ===
      DEFAULT_SOUND_PACKS.keyboard
  )
  check(
    "no default: the first of that kind",
    resolveSoundPack(null, [packs[0]], "keyboard") === "a" &&
      resolveSoundPack(null, [...packs], "mouse") === "m" &&
      resolveSoundPack(null, [], "keyboard") === null
  )
  check(
    "a pack of the other kind is never the answer",
    resolveSoundPack("m", [...packs], "keyboard") ===
      DEFAULT_SOUND_PACKS.keyboard &&
      resolveSoundPack("a", [packs[0]], "mouse") === null
  )
  check("pitch off is 1", playbackRateOf(false, 0) === 1)
  check(
    "pitch on stays in its spread",
    playbackRateOf(true, 0) === 1 - PITCH_SPREAD &&
      playbackRateOf(true, 1) === 1 + PITCH_SPREAD
  )
  const slice = segmentSeconds({ file: "f", start: 500, end: 900 }, 10)
  check(
    "ms become seconds",
    slice?.offset === 0.5 && Math.abs(slice.duration - 0.4) < 1e-9
  )
  const cut = segmentSeconds({ file: "f", start: 900, end: 5000 }, 1)
  check(
    "a segment is cut at the end of the file",
    cut !== null && Math.abs(cut.duration - 0.1) < 1e-9
  )
  check(
    "one past the end plays nothing",
    segmentSeconds({ file: "f", start: 2000, end: 3000 }, 1) === null
  )
  check(
    "a whole-file segment",
    segmentSeconds({ file: "f", start: 0, end: null }, 2)?.duration === 2
  )
}

section("the built-in packs")
{
  const bundled = path.join(
    import.meta.dirname,
    "..",
    "resources",
    "sound-packs"
  )
  const listed = await listSoundPacks({ bundled, user: "/nonexistent" })
  const keyboards = listed.filter((pack) => pack.kind === "keyboard")
  const mice = listed.filter((pack) => pack.kind === "mouse")
  check(
    "ten keyboard packs and four mouse packs",
    keyboards.length === 10 && mice.length === 4,
    listed.map((pack) => `${pack.id}:${pack.kind}`)
  )
  check(
    "each kind's default is among them",
    keyboards.some((pack) => pack.id === DEFAULT_SOUND_PACKS.keyboard) &&
      mice.some((pack) => pack.id === DEFAULT_SOUND_PACKS.mouse)
  )
  for (const info of mice) {
    const { pack, audio } = await readSoundPack(
      { bundled, user: "/nonexistent" },
      info.id
    )
    check(
      `${info.id}: both buttons press and release, and the audio is read`,
      !!pack.keys.MouseLeft?.release &&
        !!pack.keys.MouseRight?.release &&
        pack.files.every((file) => (audio[file]?.byteLength ?? 0) > 0)
    )
  }
  for (const info of keyboards) {
    const { pack, audio } = await readSoundPack(
      { bundled, user: "/nonexistent" },
      info.id
    )
    check(
      `${info.id}: every key has a press and a release, and the audio is read`,
      Object.keys(pack.keys).length > 90 &&
        Object.values(pack.keys).every((sound) => sound.release) &&
        pack.files.every((file) => (audio[file]?.byteLength ?? 0) > 0)
    )
  }
}

const root = await mkdtemp(path.join(tmpdir(), "sound-packs-"))
const roots = {
  bundled: path.join(root, "bundled"),
  user: path.join(root, "user"),
}
await mkdir(path.join(roots.bundled, "builtin-one"), { recursive: true })
await writeFile(
  path.join(roots.bundled, "builtin-one", "config.json"),
  v2({ id: "builtin-one", name: "Built-in One" })
)
await writeFile(path.join(roots.bundled, "builtin-one", "sound.ogg"), "x")

try {
  section("importing from a folder")
  {
    const dir = path.join(root, "pack-folder")
    await mkdir(path.join(dir, "audio"), { recursive: true })
    await writeFile(
      path.join(dir, "config.json"),
      v2({ audio_file: "audio/click.ogg" })
    )
    await writeFile(path.join(dir, "audio", "click.ogg"), "ogg bytes")
    await writeFile(path.join(dir, "thumbnail.jpg"), "not copied")
    const files = await readSoundPackFolder(dir)
    const installed = await installSoundPack(roots, files)
    check(
      "installed under the config's id",
      installed.id === "my-pack" && !installed.replaced
    )
    const copied = await readdir(path.join(roots.user, "my-pack"), {
      recursive: true,
    })
    check(
      "only the config and the audio it names are copied",
      copied.sort().join() ===
        ["audio", "audio/click.ogg", "config.json"].join(),
      copied
    )
    const again = await installSoundPack(roots, files)
    check("the same id again is an update", again.replaced)
    const listed = await listSoundPacks(roots)
    check(
      "listed after the built-in packs",
      listed.map((pack) => pack.id).join() === "builtin-one,my-pack"
    )
    check(
      "a missing audio file is refused",
      await throwsWith(async () => {
        await rm(path.join(dir, "audio", "click.ogg"))
        await readSoundPackFolder(dir)
      }, "missing")
    )
    check(
      "a built-in pack's id is refused",
      await throwsWith(
        () =>
          installSoundPack(roots, {
            config: v2({ id: "builtin-one" }),
            audio: new Map([["sound.ogg", new Uint8Array([1])]]),
          }),
        "built-in"
      )
    )
  }

  section("importing from a .zip")
  {
    const zip = zipSync({
      "Old Pack-main/config.json": strToU8(
        JSON.stringify({
          name: "Old Pack",
          key_define_type: "single",
          defines: { "30": [0, 10] },
        })
      ),
      "Old Pack-main/old.ogg": strToU8("ogg"),
      "Old Pack-main/other.txt": strToU8("skip"),
      "__MACOSX/Old Pack-main/config.json": strToU8("junk"),
    })
    const files = readSoundPackZip(zip)
    check(
      "inside one folder, the V1 sound found beside it",
      [...files.audio.keys()].join() === "old.ogg"
    )
    const installed = await installSoundPack(roots, files)
    check("an id from its name", installed.id === "old-pack")
    const read = await readSoundPack(roots, "old-pack")
    check(
      "it reads back with its audio",
      read.pack.keys.KeyA?.press.file === "old.ogg" &&
        read.audio["old.ogg"]?.byteLength === 3
    )
    check(
      "two packs in one archive are refused",
      await throwsWith(
        () =>
          readSoundPackZip(
            zipSync({
              "a/config.json": strToU8(v2()),
              "b/config.json": strToU8(v2()),
            })
          ),
        "more than one"
      )
    )
    check(
      "a config naming a path out of the pack plays nothing from it",
      await throwsWith(
        () =>
          readSoundPackZip(
            zipSync({
              "config.json": strToU8(v2({ audio_file: "../../evil.ogg" })),
            })
          ),
        "no key or button"
      )
    )
  }

  section("removing")
  {
    check(
      "an imported pack's folder",
      (await installedSoundPackDir(roots, "old-pack")) ===
        path.join(roots.user, "old-pack")
    )
    check(
      "never a built-in one",
      await throwsWith(
        () => installedSoundPackDir(roots, "builtin-one"),
        "cannot be removed"
      )
    )
    check(
      "never a path",
      await throwsWith(
        () => installedSoundPackDir(roots, "../user"),
        "Not a sound pack id"
      )
    )
  }
} finally {
  await rm(root, { recursive: true, force: true })
}

finish()
