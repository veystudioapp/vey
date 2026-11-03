import { isNewer } from "@shared/version"

/**
 * What a launch owes somebody about the build it is running.
 *
 * - `announce` — the first launch after an update: show the notes of every
 *   release since `since` (null for this build's alone).
 * - `record` — nothing to show, but the version is to be written down: a fresh
 *   install, whose welcome and tour are the introduction, or a build older
 *   than the one last seen, which has nothing new to say.
 * - `nothing` — this build has been seen already.
 */
export type WhatsNew =
  | { kind: "announce"; since: string | null }
  | { kind: "record" }
  | { kind: "nothing" }

export function whatsNewOf(
  current: string,
  seen: string | null,
  onboarded: boolean
): WhatsNew {
  if (seen === null) {
    // No record and no tour seen is a first launch. No record but the tour
    // seen is somebody updating from a build before this existed, and owed
    // this release's notes alone — not every release they already used.
    return onboarded ? { kind: "announce", since: null } : { kind: "record" }
  }
  if (isNewer(current, seen)) return { kind: "announce", since: seen }
  if (isNewer(seen, current)) return { kind: "record" }
  return { kind: "nothing" }
}
