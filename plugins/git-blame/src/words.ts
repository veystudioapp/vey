import type { GitBlameCommit, GitLineCommit } from "@shared/api"
import type { Locale, Translate } from "@/lib/i18n"

/**
 * The words of the blame that need a language — `2 months ago`, the
 * annotation, a commit's size. The app's own strings, in the app's language,
 * through `app.t` and `app.locale()`: a plugin that bundled `lib/i18n` would
 * carry a second copy of every message and a locale of its own that the
 * Settings switch never reaches. Handed in rather than held, so
 * `test/git-blame.ts` can check them in a language of its choosing.
 */
export type Words = { t: Translate; locale: Locale }

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

const formats = new Map<Locale, Intl.RelativeTimeFormat>()
function relative(locale: Locale): Intl.RelativeTimeFormat {
  let format = formats.get(locale)
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
    formats.set(locale, format)
  }
  return format
}

/**
 * `2 months ago` — the long form, unlike the sidebar's `since`: the annotation
 * has the width of the rest of the line to spend, and it is read as a sentence.
 */
export function ago(
  iso: string,
  words: Words,
  now: number = Date.now()
): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ""
  const ms = Math.max(0, now - at)
  for (const [unit, size] of UNITS) {
    if (ms >= size) {
      return relative(words.locale).format(-Math.floor(ms / size), unit)
    }
  }
  return words.t("files.blame.justNow")
}

/** What sits at the end of the caret's line: `Ada, 2 months ago • fix: …`. */
export function annotationOf(
  commit: GitBlameCommit | null,
  words: Words,
  now: number = Date.now()
): string {
  if (!commit) return words.t("files.blame.notCommitted")
  return `${commit.author}, ${ago(commit.date, words, now)} • ${commit.summary}`
}

/** The size of a whole commit under its message: `3 files changed · +12 −4`. */
export function statText(stat: GitLineCommit["stat"], words: Words): string {
  if (!stat) return ""
  return words.t("files.blame.stat", {
    count: stat.files,
    added: stat.added,
    removed: stat.removed,
  })
}
