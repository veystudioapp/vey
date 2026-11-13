/**
 * Mechvibes sound packs — what the typing and click sounds play
 * (`docs/design.md` § Typing sounds).
 *
 * The format is Mechvibes' own, read rather than reinvented, so a pack made
 * for Mechvibes (its library, its web editor, the thousands of V1 packs still
 * passed around as zips) plays here as it is. Two generations:
 *
 * - **V2**, keyed by `KeyboardEvent.code` — the same name a keydown in this
 *   page carries, which is why the format suits a web app at all — and by
 *   `MouseLeft`, `MouseRight` and the like for a mouse pack. Each key is one
 *   or two `[startMs, endMs]` segments: the press, and the release.
 * - **V1**, keyed by iohook's numeric scancodes, one `[startMs, durationMs]`
 *   per key (`single`) or one file per key (`multi`). Read through
 *   `V1_KEY_CODES`, the table Mechvibes' own converter uses.
 *
 * Pure, and shared: main parses a pack to know which files to copy and serve,
 * the renderer to know what to play.
 */

export type SoundPackSource = "folder" | "zip"

/** Mechvibes keeps a keyboard's packs and a mouse's apart, and so does this:
 * each is chosen, switched on and turned up on its own. */
export type SoundPackKind = "keyboard" | "mouse"

/** A pack as Settings lists it. */
export type SoundPackInfo = {
  id: string
  name: string
  author: string | null
  kind: SoundPackKind
  /** Carried by the app (`resources/sound-packs/`) rather than imported. */
  builtin: boolean
}

export type SoundPackInstall = { id: string; name: string; replaced: boolean }

/** A slice of one of the pack's files, in milliseconds. */
export type SoundSegment = {
  file: string
  start: number
  /** Null for "to the end of the file" — a V1 `multi` key's whole clip. */
  end: number | null
}

export type KeySound = { press: SoundSegment; release: SoundSegment | null }

export type SoundPack = {
  name: string
  author: string | null
  kind: SoundPackKind
  /** Every file a key plays from, `/`-separated and relative to the pack. */
  files: string[]
  /** By `KeyboardEvent.code`, or `MouseLeft` and its family for a mouse
   * pack — only its own kind's. A key a pack leaves out is silent —
   * Mechvibes' own rule, since a stand-in sound is a different keyboard. */
  keys: Record<string, KeySound>
  /** `options.recommended_volume`, 0–2, multiplied into the user's volume. */
  volume: number
  /** `options.random_pitch`. */
  randomPitch: boolean
}

/** A pack and its files' bytes — what main answers `soundPack` with. */
export type SoundPackAudio = {
  id: string
  pack: SoundPack
  audio: Record<string, Uint8Array>
}

/** What Chromium's `decodeAudioData` reads, of what Mechvibes accepts. */
export const SOUND_FILE = /\.(ogg|oga|wav|mp3|flac)$/i

/** A pack's id is its folder's name, so it is held to one path component
 * every OS can store. */
export function isSoundPackId(value: unknown): value is string {
  return (
    typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)
  )
}

/** An id for a pack whose config gives none usable: its name, slugged. */
export function soundPackIdOf(config: unknown, name: string): string {
  const id = (config as { id?: unknown } | null)?.id
  if (isSoundPackId(id)) return id
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug ? slug : "sound-pack"
}

/**
 * A file name from a config, as a relative `/` path inside the pack — or null
 * for anything that would climb out of it, or is not audio. The config is
 * somebody else's file and these names become paths on disk.
 */
export function packFileOf(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parts = value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
  if (parts.length === 0) return null
  if (/^[A-Za-z]:/.test(parts[0]!) || value.trim().startsWith("/")) return null
  if (parts.some((part) => part === "..")) return null
  const file = parts.join("/")
  return SOUND_FILE.test(file) ? file : null
}

/**
 * A config's text as a pack, or a throw saying why not.
 *
 * `available` is the audio files found beside the config, for a V1 `single`
 * pack that names no `sound` — Mechvibes plays the first one it finds.
 */
export function parseSoundPack(
  text: string,
  available: string[] = []
): SoundPack {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error("config.json is not valid JSON.")
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("config.json is not an object.")
  }
  const config = raw as Record<string, unknown>

  const version = Number(config.config_version)
  if (Number.isFinite(version) && version > 2) {
    throw new Error("This pack needs a newer version of the Mechvibes format.")
  }

  const name =
    typeof config.name === "string" && config.name.trim()
      ? config.name.trim()
      : "Untitled pack"
  const authorField = config.author ?? config.m_author
  const author =
    typeof authorField === "string" && authorField.trim()
      ? authorField.trim()
      : null
  const options = (config.options ?? {}) as Record<string, unknown>
  const recommended = Number(options.recommended_volume)
  const volume =
    Number.isFinite(recommended) && recommended >= 0
      ? Math.min(recommended, 2)
      : 1
  const randomPitch = options.random_pitch === true

  const definitions = config.definitions ?? config.defs
  const all =
    definitions !== undefined
      ? keysOfV2(config, definitions)
      : config.defines !== undefined
        ? keysOfV1(config, available)
        : null
  if (!all) throw new Error("config.json defines no keys.")
  const kind = kindOf(config, Object.keys(all))
  // Only the pack's own kind: a keyboard pack's stray `MouseLeft` would
  // otherwise click under a mouse pack chosen separately.
  const keys = Object.fromEntries(
    Object.entries(all).filter(
      ([code]) => isMouseCode(code) === (kind === "mouse")
    )
  )
  if (Object.keys(keys).length === 0) {
    throw new Error("config.json defines no key or button that can play.")
  }

  const files = [
    ...new Set(
      Object.values(keys).flatMap((sound) =>
        sound.release
          ? [sound.press.file, sound.release.file]
          : [sound.press.file]
      )
    ),
  ]
  return { name, author, kind, files, keys, volume, randomPitch }
}

/** Mechvibes' own test for a mouse pack's codes. */
export function isMouseCode(code: string): boolean {
  return /^(Mouse|Button|Wheel)/.test(code)
}

/**
 * A pack's kind: what `soundpack_type` says, else a mouse pack when every key
 * it defines is a button — Mechvibes' detection, which a V1 mouse pack cannot
 * pass (its codes are plain numbers) and so is read off its `mouse` flag.
 */
function kindOf(
  config: Record<string, unknown>,
  codes: string[]
): SoundPackKind {
  const declared =
    typeof config.soundpack_type === "string"
      ? config.soundpack_type.toLowerCase()
      : null
  if (declared === "mouse" || declared === "keyboard") return declared
  if (config.mouse === true) return "mouse"
  return codes.length > 0 && codes.every(isMouseCode) ? "mouse" : "keyboard"
}

function keysOfV2(
  config: Record<string, unknown>,
  definitions: unknown
): Record<string, KeySound> {
  if (typeof definitions !== "object" || definitions === null) {
    throw new Error("config.json's definitions are not an object.")
  }
  const multi = config.definition_method === "multi"
  const main = packFileOf(config.audio_file)
  const keys: Record<string, KeySound> = {}

  for (const [code, value] of Object.entries(definitions)) {
    const own =
      multi && typeof value === "object" && value !== null
        ? packFileOf((value as { audio_file?: unknown }).audio_file)
        : null
    const file = own ?? main
    if (!file) continue
    const timing = Array.isArray(value)
      ? value
      : typeof value === "object" && value !== null
        ? (value as { timing?: unknown }).timing
        : undefined

    // A multi key without timing plays its whole file.
    if (timing === undefined && multi && own) {
      keys[code] = { press: { file, start: 0, end: null }, release: null }
      continue
    }
    if (!Array.isArray(timing)) continue
    // More than two segments plays nothing in Mechvibes (`lookup_timing`),
    // and a pack that sounds different in two apps is worse than a silent key.
    if (timing.length === 0 || timing.length > 2) continue
    const press = segmentOf(file, timing[0])
    const release = timing.length === 2 ? segmentOf(file, timing[1]) : null
    if (!press || (timing.length === 2 && !release)) continue
    keys[code] = { press, release }
  }
  return keys
}

function segmentOf(file: string, pair: unknown): SoundSegment | null {
  if (!Array.isArray(pair) || pair.length !== 2) return null
  const start = Number(pair[0])
  const end = Number(pair[1])
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end <= start) return null
  return { file, start, end }
}

function keysOfV1(
  config: Record<string, unknown>,
  available: string[]
): Record<string, KeySound> {
  const defines = config.defines
  if (typeof defines !== "object" || defines === null) {
    throw new Error("config.json's defines are not an object.")
  }
  const multi = config.key_define_type === "multi"
  const main =
    packFileOf(config.sound) ??
    available.map(packFileOf).find((file) => file !== null) ??
    null
  if (!multi && !main) throw new Error("This pack has no sound file.")

  const keys: Record<string, KeySound> = {}
  // A V1 pack's codes are iohook's either way; which table they are read
  // through is the pack's `mouse` flag.
  const table =
    config.mouse === true ||
    (typeof config.soundpack_type === "string" &&
      config.soundpack_type.toLowerCase() === "mouse")
      ? V1_MOUSE_CODES
      : V1_KEY_CODES
  // `"01"` is the release of `"1"` — a V1 mouse pack's spelling, which a
  // plain parse would fold onto the press.
  const isRelease = (define: string) =>
    define.length > 1 && define.startsWith("0")
  // Presses before releases, so a release finds its key; and a Num Lock-off
  // code never takes the place of the key it stands for — both in whatever
  // order the JSON was written, the converter's rules.
  const rank = (define: string) =>
    Number(isRelease(define)) * 2 +
    Number(NUMPAD_NAVIGATION.has(Number(define)))
  const entries = Object.entries(defines).sort(([a], [b]) => rank(a) - rank(b))
  for (const [define, value] of entries) {
    const release = isRelease(define)
    const code = table[Number(define)]
    if (!code || !/^\d+$/.test(define)) continue
    if (NUMPAD_NAVIGATION.has(Number(define)) && keys[code]) continue

    let segment: SoundSegment | null = null
    if (multi) {
      const file = packFileOf(value)
      if (file) segment = { file, start: 0, end: null }
    } else if (Array.isArray(value) && value.length >= 2 && main) {
      const start = Number(value[0])
      const duration = Number(value[1])
      if (Number.isFinite(start) && Number.isFinite(duration) && start >= 0) {
        if (duration > 0) {
          segment = { file: main, start, end: start + duration }
        }
      }
    }
    if (!segment) continue
    if (release) {
      const held = keys[code]
      if (held) held.release = segment
    } else {
      keys[code] = { press: segment, release: keys[code]?.release ?? null }
    }
  }
  return keys
}

/** iohook's mouse buttons — `create_iohook_to_mouse_button_mapping`. */
const V1_MOUSE_CODES: Record<number, string> = {
  1: "MouseLeft",
  2: "MouseRight",
  3: "MouseMiddle",
}

/** The numpad keys with Num Lock off (iohook's `0xEExx`). */
const NUMPAD_NAVIGATION = new Set([
  60999, 61000, 61001, 61003, 61004, 61005, 61007, 61008, 61009, 61010, 61011,
])

/**
 * iohook's scancodes as `KeyboardEvent.code` — Mechvibes'
 * `create_iohook_to_web_key_mapping`, less the media, Sun and power keys no
 * keydown in a page ever carries.
 */
export const V1_KEY_CODES: Record<number, string> = {
  1: "Escape",
  2: "Digit1",
  3: "Digit2",
  4: "Digit3",
  5: "Digit4",
  6: "Digit5",
  7: "Digit6",
  8: "Digit7",
  9: "Digit8",
  10: "Digit9",
  11: "Digit0",
  12: "Minus",
  13: "Equal",
  14: "Backspace",
  15: "Tab",
  16: "KeyQ",
  17: "KeyW",
  18: "KeyE",
  19: "KeyR",
  20: "KeyT",
  21: "KeyY",
  22: "KeyU",
  23: "KeyI",
  24: "KeyO",
  25: "KeyP",
  26: "BracketLeft",
  27: "BracketRight",
  28: "Enter",
  29: "ControlLeft",
  30: "KeyA",
  31: "KeyS",
  32: "KeyD",
  33: "KeyF",
  34: "KeyG",
  35: "KeyH",
  36: "KeyJ",
  37: "KeyK",
  38: "KeyL",
  39: "Semicolon",
  40: "Quote",
  41: "Backquote",
  42: "ShiftLeft",
  43: "Backslash",
  44: "KeyZ",
  45: "KeyX",
  46: "KeyC",
  47: "KeyV",
  48: "KeyB",
  49: "KeyN",
  50: "KeyM",
  51: "Comma",
  52: "Period",
  53: "Slash",
  54: "ShiftRight",
  55: "NumpadMultiply",
  56: "AltLeft",
  57: "Space",
  58: "CapsLock",
  59: "F1",
  60: "F2",
  61: "F3",
  62: "F4",
  63: "F5",
  64: "F6",
  65: "F7",
  66: "F8",
  67: "F9",
  68: "F10",
  69: "NumLock",
  70: "ScrollLock",
  71: "Numpad7",
  72: "Numpad8",
  73: "Numpad9",
  74: "NumpadSubtract",
  75: "Numpad4",
  76: "Numpad5",
  77: "Numpad6",
  78: "NumpadAdd",
  79: "Numpad1",
  80: "Numpad2",
  81: "Numpad3",
  82: "Numpad0",
  83: "NumpadDecimal",
  87: "F11",
  88: "F12",
  91: "F13",
  92: "F14",
  93: "F15",
  94: "IntlBackslash",
  99: "F16",
  100: "F17",
  101: "F18",
  102: "F19",
  103: "F20",
  104: "F21",
  105: "F22",
  106: "F23",
  107: "F24",
  112: "Convert",
  115: "Lang1",
  119: "Lang2",
  121: "KanaMode",
  123: "HiraganaKatakana",
  125: "IntlYen",
  126: "NumpadComma",
  // Mechvibes 2's own extended codes (0x0Exx), which every V1 pack uses.
  3597: "NumpadEqual",
  3612: "NumpadEnter",
  3613: "ControlRight",
  3637: "NumpadDivide",
  3639: "PrintScreen",
  3640: "AltRight",
  3653: "Pause",
  3655: "Home",
  3657: "PageUp",
  3663: "End",
  3665: "PageDown",
  3666: "Insert",
  3667: "Delete",
  3675: "MetaLeft",
  3676: "MetaRight",
  3677: "ContextMenu",
  // The same keys as other iohook builds report them (0xE0xx).
  57399: "PrintScreen",
  58437: "Pause",
  57415: "Home",
  57416: "ArrowUp",
  57417: "PageUp",
  57419: "ArrowLeft",
  57421: "ArrowRight",
  57423: "End",
  57424: "ArrowDown",
  57425: "PageDown",
  57426: "Insert",
  57427: "Delete",
  57400: "AltRight",
  57435: "MetaLeft",
  57436: "MetaRight",
  57437: "ContextMenu",
  58444: "Clear",
  58470: "IntlBackslash",
  // The numpad with Num Lock off, as the key each stands for.
  60999: "Home",
  61000: "ArrowUp",
  61001: "PageUp",
  61003: "ArrowLeft",
  61004: "Clear",
  61005: "ArrowRight",
  61007: "End",
  61008: "ArrowDown",
  61009: "PageDown",
  61010: "Insert",
  61011: "Delete",
}
