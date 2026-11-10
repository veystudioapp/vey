/**
 * What ESLint said about one file, as both sides read it.
 *
 * ESLint's own message shape, cut to what the editor draws: positions are
 * ESLint's (1-based lines and columns, `endColumn` exclusive), and a fix is
 * ESLint's too — offsets into the text that was linted, which is the editor's
 * buffer, so the renderer can apply it to the document it sent only while that
 * document has not moved on. `main/eslint.ts` has the rest.
 */

/**
 * The flat config's names, in ESLint's own order of preference. A directory
 * holding one of these is the `cwd` ESLint is run in for the files under it,
 * which is where ESLint 9 looks for its config.
 */
export const FLAT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
] as const

/** The `.eslintrc` names ESLint 8 and older read. `package.json`'s
 * `eslintConfig` is the third way, checked separately. */
export const LEGACY_CONFIG_FILES = [
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.json",
  ".eslintrc",
] as const

/** What the worker is asked: one buffer, linted as the file at `filePath`. */
export type EslintRequest = {
  id: number
  /** Where the config was found, and so where ESLint runs. */
  cwd: string
  /** A flat config (`eslint.config.*`) rather than an `.eslintrc`. */
  flat: boolean
  filePath: string
  text: string
}

/** A replacement of `range` (offsets, end exclusive) with `text`. */
export type EslintFix = { range: [number, number]; text: string }

export type EslintMessage = {
  line: number
  column: number
  endLine?: number
  endColumn?: number
  /** 2 an error, 1 a warning — ESLint's own numbers. */
  severity: 1 | 2
  message: string
  /** Null for a parse error, which no rule reported. */
  ruleId: string | null
  fix?: EslintFix
  suggestions?: { desc: string; fix: EslintFix }[]
}

/**
 * One lint, and the two ways it can come back without messages.
 *
 * `unavailable` is a file with no ESLint installed above it — said nothing
 * about, the way a folder with no `typescript` gets no hovers. `failed` is an
 * ESLint that is there and could not run: a config that throws, a plugin it
 * names that is not installed. That one is worth saying out loud, since the
 * alternative is a project that is linted on the command line and silently not
 * in the editor.
 */
export type EslintResult =
  | { status: "linted"; messages: EslintMessage[] }
  | { status: "unavailable" }
  | { status: "failed"; error: string }
