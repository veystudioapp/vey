/**
 * Comparing two of this app's versions.
 *
 * Shared because both sides ask: main whether GitHub's latest release is worth
 * offering (`main/updater.ts`), the renderer whether this launch is the first
 * on a new build and so owes somebody its notes (`lib/whats-new.ts`).
 */

/**
 * A version as numbers, for comparing.
 *
 * Anything that is not a run of digits ends the list rather than being coerced,
 * so `1.0.20-beta.1` is `[1, 0, 20]` and its prerelease is handled separately —
 * a `-beta` sorting as a fourth component would make it *newer* than the
 * release it precedes.
 */
export function versionParts(version: string): number[] {
  const core = version.replace(/^v/, "").split(/[-+]/, 1)[0] ?? ""
  return core.split(".").map((part) => {
    const value = Number.parseInt(part, 10)
    return Number.isNaN(value) ? 0 : value
  })
}

function isPrerelease(version: string): boolean {
  return /[-+]/.test(version.replace(/^v/, ""))
}

/**
 * Whether `candidate` is a release worth offering to somebody on `current`.
 *
 * Strictly newer, never merely different: a machine running a build ahead of
 * the latest release — anyone who ran `make app` from a checkout — should be
 * told nothing rather than offered a downgrade dressed up as an update.
 */
export function isNewer(candidate: string, current: string): boolean {
  const left = versionParts(candidate)
  const right = versionParts(current)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a > b
  }
  // Same numbers: `1.0.20` is newer than `1.0.20-beta.1`, and nothing else
  // about two prereleases of one version is worth guessing at.
  return isPrerelease(current) && !isPrerelease(candidate)
}
