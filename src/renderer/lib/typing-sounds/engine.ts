import type {
  SoundPack,
  SoundPackKind,
  SoundSegment,
} from "@shared/sound-packs"

import { useSettings } from "../settings"
import {
  mouseCodeOf,
  playbackRateOf,
  PREVIEW,
  resolveSoundPack,
  segmentSeconds,
} from "./choice"
import { useSoundPacks } from "./store"

/**
 * The typing and click sounds — a Mechvibes keyboard pack played on every key
 * pressed in this window, and a mouse pack on every click
 * (`docs/design.md` § Typing sounds).
 *
 * **This window's keys and clicks only**, heard at `window` in the capture
 * phase, so the composer, CodeMirror and xterm's textarea all sound alike
 * without any of them knowing. Keys typed or clicks made in another app make no
 * sound: hearing those needs the OS's accessibility permission and a global
 * hook, which is what Mechvibes itself is for. Nor does the chat's browser,
 * whose guest is a page of its own.
 *
 * **Web Audio, decoded once.** A pack's file is decoded into an `AudioBuffer`
 * when it is picked, and each key is a fresh `AudioBufferSourceNode` started at
 * its slice — the node is the cheap part, made to be thrown away, and the
 * buffer is shared. An `<audio>` per key was the alternative and adds a
 * decode, and tens of milliseconds, to every press.
 *
 * The keyboard and the mouse are two **slots**, each with its own pack and its
 * own gain, so either can be on alone and each at its own level.
 */

type Loaded = {
  /** The pack's id and the import revision it was read at. */
  key: string
  pack: SoundPack
  buffers: Map<string, AudioBuffer>
}

type Slot = {
  loaded: Loaded | null
  loading: Promise<Loaded | null> | null
  loadingKey: string | null
  gain: GainNode | null
  /** Keys or buttons whose press played, so a release is only ever the end of
   * one — not a key held down from before the window was focused. */
  down: Set<string>
}

const slots: Record<SoundPackKind, Slot> = {
  keyboard: emptySlot(),
  mouse: emptySlot(),
}

function emptySlot(): Slot {
  return {
    loaded: null,
    loading: null,
    loadingKey: null,
    gain: null,
    down: new Set(),
  }
}

let context: AudioContext | null = null

function audio(kind: SoundPackKind): { ctx: AudioContext; gain: GainNode } {
  context ??= new AudioContext({ latencyHint: "interactive" })
  const slot = slots[kind]
  if (!slot.gain) {
    slot.gain = context.createGain()
    slot.gain.connect(context.destination)
  }
  return { ctx: context, gain: slot.gain }
}

/** Whether a kind is switched on, and how loud — the settings' two names for
 * each. */
function settingsOf(kind: SoundPackKind) {
  const settings = useSettings.getState()
  return kind === "keyboard"
    ? {
        on: settings.typingSounds,
        chosen: settings.typingSoundPack,
        volume: settings.typingSoundVolume,
      }
    : {
        on: settings.mouseSounds,
        chosen: settings.mouseSoundPack,
        volume: settings.mouseSoundVolume,
      }
}

/** Reads and decodes a pack into its kind's slot, once per id and import. */
function load(kind: SoundPackKind, id: string): Promise<Loaded | null> {
  const slot = slots[kind]
  const key = `${id}@${useSoundPacks.getState().revision}`
  if (slot.loaded?.key === key) return Promise.resolve(slot.loaded)
  if (slot.loading && slot.loadingKey === key) return slot.loading
  slot.loadingKey = key
  const loading = (async () => {
    try {
      const { pack, audio: files } = await window.desktop.soundPack(id)
      const { ctx } = audio(kind)
      const buffers = new Map<string, AudioBuffer>()
      await Promise.all(
        Object.entries(files).map(async ([file, bytes]) => {
          try {
            // `decodeAudioData` takes the buffer and detaches it, and what
            // crossed the bridge may be a view onto a larger one.
            const copy = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            ) as ArrayBuffer
            buffers.set(file, await ctx.decodeAudioData(copy))
          } catch (error) {
            // A file that cannot be decoded silences the keys that play it.
            console.error(`Could not decode ${file} of sound pack ${id}`, error)
          }
        })
      )
      // Picked past while it was decoding: the newer pick wins.
      if (slot.loadingKey !== key) return null
      slot.loaded = { key, pack, buffers }
      return slot.loaded
    } catch (error) {
      console.error(`Could not read sound pack ${id}`, error)
      return null
    } finally {
      if (slot.loadingKey === key) {
        slot.loading = null
        slot.loadingKey = null
      }
    }
  })()
  slot.loading = loading
  return loading
}

function play(
  kind: SoundPackKind,
  segment: SoundSegment,
  { pack, buffers }: Loaded
) {
  const buffer = buffers.get(segment.file)
  if (!buffer) return
  const slice = segmentSeconds(segment, buffer.duration)
  if (!slice) return
  const { ctx, gain } = audio(kind)
  // Chromium suspends a context made before a gesture; a press is one.
  if (ctx.state === "suspended") void ctx.resume()
  gain.gain.value = settingsOf(kind).volume * pack.volume
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = playbackRateOf(
    useSettings.getState().typingSoundPitch || pack.randomPitch
  )
  source.connect(gain)
  source.start(0, slice.offset, slice.duration)
}

function press(kind: SoundPackKind, code: string) {
  const { loaded, down } = slots[kind]
  if (!settingsOf(kind).on || !loaded) return
  const sound = loaded.pack.keys[code]
  if (!sound) return
  down.add(code)
  play(kind, sound.press, loaded)
}

function lift(kind: SoundPackKind, code: string) {
  const { loaded, down } = slots[kind]
  if (!down.delete(code)) return
  if (!settingsOf(kind).on || !useSettings.getState().typingSoundRelease) return
  const release = loaded?.pack.keys[code]?.release
  if (loaded && release) play(kind, release, loaded)
}

function onKeyDown(event: KeyboardEvent) {
  if (!event.repeat) press("keyboard", event.code)
}

function onKeyUp(event: KeyboardEvent) {
  lift("keyboard", event.code)
}

/**
 * `mousedown`, not `pointerdown`: a second button pressed while the first is
 * held is a `pointermove` to Pointer Events, so a right click during a drag
 * would make no sound. A touch screen's taps arrive as mouse events too, after
 * the fact, and are played as the clicks they stand for.
 */
function onMouseDown(event: MouseEvent) {
  const code = mouseCodeOf(event.button)
  if (code) press("mouse", code)
}

function onMouseUp(event: MouseEvent) {
  const code = mouseCodeOf(event.button)
  if (code) lift("mouse", code)
}

/** A key or button held when the window lost focus never sends its up here. */
function onBlur() {
  slots.keyboard.down.clear()
  slots.mouse.down.clear()
}

/** Which packs the settings name, read as soon as there is one to read. */
function sync() {
  if (!useSettings.getState().loaded) return
  const kinds = (["keyboard", "mouse"] as const).filter(
    (kind) => settingsOf(kind).on
  )
  if (kinds.length === 0) return
  const { packs, refresh } = useSoundPacks.getState()
  if (!packs) {
    void refresh()
    return
  }
  for (const kind of kinds) {
    const id = resolveSoundPack(settingsOf(kind).chosen, packs, kind)
    if (id) void load(kind, id)
  }
}

/**
 * Listens for keys and clicks and keeps the chosen packs decoded; the returned
 * function stops both. Mounted once per window, by the studio and a popped-out
 * chat.
 */
export function startTypingSounds(): () => void {
  sync()
  const unsettings = useSettings.subscribe((state, previous) => {
    if (
      state.loaded !== previous.loaded ||
      state.typingSounds !== previous.typingSounds ||
      state.typingSoundPack !== previous.typingSoundPack ||
      state.mouseSounds !== previous.mouseSounds ||
      state.mouseSoundPack !== previous.mouseSoundPack
    ) {
      sync()
    }
  })
  const unpacks = useSoundPacks.subscribe(sync)
  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("mousedown", onMouseDown, true)
  window.addEventListener("mouseup", onMouseUp, true)
  window.addEventListener("blur", onBlur)
  return () => {
    unsettings()
    unpacks()
    window.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("keyup", onKeyUp, true)
    window.removeEventListener("mousedown", onMouseDown, true)
    window.removeEventListener("mouseup", onMouseUp, true)
    window.removeEventListener("blur", onBlur)
    onBlur()
  }
}

/**
 * A pack typing a word or clicking, for Settings — once it is decoded, so the
 * first pick of a pack sounds as soon as it can rather than not at all. Plays
 * whether or not that kind is on: it is what somebody deciding whether to
 * turn it on wants to hear.
 */
export async function previewSounds(
  kind: SoundPackKind,
  id: string
): Promise<void> {
  const ready = await load(kind, id)
  if (!ready) return
  const withRelease = useSettings.getState().typingSoundRelease
  // A mouse's clicks are further apart than a typist's keys.
  const gap = kind === "mouse" ? 260 : 120
  PREVIEW[kind].forEach((code, index) => {
    const sound = ready.pack.keys[code]
    if (!sound) return
    window.setTimeout(() => play(kind, sound.press, ready), index * gap)
    const release = sound.release
    if (release && withRelease) {
      window.setTimeout(() => play(kind, release, ready), index * gap + 70)
    }
  })
}
