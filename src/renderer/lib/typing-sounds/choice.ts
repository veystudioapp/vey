import type {
  SoundPackInfo,
  SoundPackKind,
  SoundSegment,
} from "@shared/sound-packs"

/**
 * The typing and click sounds' decisions that are not Web Audio — which pack
 * plays, which slice of its file, at what pitch, which button is which — kept
 * apart from `engine.ts` so they can be tested without a page
 * (`test/sound-packs.ts`).
 */

/** What plays before anybody has picked: for the keyboard, the pack Mechvibes
 * itself opens on; for the mouse, the one that sounds like a mouse. */
export const DEFAULT_SOUND_PACKS: Record<SoundPackKind, string> = {
  keyboard: "cherrymx-black-abs",
  mouse: "mouse-wooden",
}

/**
 * The pack of `kind` to play: the one chosen while it is still there, else the
 * default, else the first of that kind listed. A chosen pack since removed is
 * not an error — the sounds carry on with another rather than going quiet
 * without a word.
 */
export function resolveSoundPack(
  chosen: string | null,
  packs: SoundPackInfo[],
  kind: SoundPackKind
): string | null {
  const ofKind = packs.filter((pack) => pack.kind === kind)
  if (chosen && ofKind.some((pack) => pack.id === chosen)) return chosen
  const fallback = DEFAULT_SOUND_PACKS[kind]
  if (ofKind.some((pack) => pack.id === fallback)) return fallback
  return ofKind[0]?.id ?? null
}

/**
 * A `MouseEvent.button` as the code a Mechvibes mouse pack names it by — or
 * null for a button no pack can name. Mouse 4 and 5 are the side buttons,
 * Back and Forward.
 */
export function mouseCodeOf(button: number): string | null {
  return MOUSE_BUTTONS[button] ?? null
}

const MOUSE_BUTTONS: Record<number, string> = {
  0: "MouseLeft",
  1: "MouseMiddle",
  2: "MouseRight",
  3: "Mouse4",
  4: "Mouse5",
}

/**
 * How far a random pitch strays either way. Mechvibes' own is wider, ±10–15%,
 * which at typing speed reads as two different keyboards; this is the spread
 * that only stops a repeated key sounding like a loop.
 */
export const PITCH_SPREAD = 0.05

/** `playbackRate` for one key: 1, or within `PITCH_SPREAD` of it. */
export function playbackRateOf(random: boolean, roll = Math.random()): number {
  return random ? 1 + (roll * 2 - 1) * PITCH_SPREAD : 1
}

/**
 * A segment as `AudioBufferSourceNode.start`'s offset and duration, in
 * seconds — cut at the end of the file, as Mechvibes cuts it, and null for one
 * that starts past the end (a config written for a longer recording).
 */
export function segmentSeconds(
  segment: SoundSegment,
  fileSeconds: number
): { offset: number; duration: number } | null {
  const offset = segment.start / 1000
  if (offset >= fileSeconds) return null
  const end =
    segment.end === null
      ? fileSeconds
      : Math.min(segment.end / 1000, fileSeconds)
  const duration = end - offset
  return duration > 0 ? { offset, duration } : null
}

/** What the Settings preview plays: for a keyboard, a word and a space, the
 * shortest run that shows a pack's letters, its space bar and its rhythm; for
 * a mouse, a click of each button and two more of the left. */
export const PREVIEW: Record<SoundPackKind, string[]> = {
  keyboard: ["KeyH", "KeyE", "KeyL", "KeyL", "KeyO", "Space"],
  mouse: ["MouseLeft", "MouseRight", "MouseLeft", "MouseLeft"],
}
