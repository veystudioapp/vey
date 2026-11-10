import { stat } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import readline from "node:readline"
import { pathToFileURL } from "node:url"
import { format } from "node:util"

import {
  FLAT_CONFIG_FILES,
  LEGACY_CONFIG_FILES,
  type EslintMessage,
  type EslintRequest,
  type EslintResult,
} from "../shared/eslint"

/**
 * One project's ESLint, run as a process of its own — see `main/eslint.ts` for
 * why it is a process and why it is the project's own copy.
 *
 * Started as `<node> eslint-worker.cjs <eslint package directory>`, and spoken
 * to in newline-delimited JSON: an `EslintRequest` per line in, `{ id, result }`
 * per line out. Its own esbuild entry (`scripts/build-electron.mjs`), the way
 * the pty daemon is.
 */

/*
 * stdout is the protocol, and a config is code that may `console.log` — a
 * plugin announcing a deprecation, somebody's debugging left in. Every console
 * method goes to stderr instead, so a stray line cannot be read as an answer
 * or break the one after it.
 */
const write = process.stdout.write.bind(process.stdout)
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  console[level] = (...args: unknown[]) => {
    process.stderr.write(`${format(...args)}\n`)
  }
}

type LintResult = { messages: (EslintMessage & { fatal?: boolean })[] }

type ESLintInstance = {
  lintText: (
    text: string,
    options: { filePath: string; warnIgnored: boolean }
  ) => Promise<LintResult[]>
}

type ESLintClass = new (options: { cwd: string }) => ESLintInstance

type ESLintModule = {
  ESLint?: ESLintClass
  loadESLint?: (options: {
    useFlatConfig: boolean
    cwd: string
  }) => Promise<ESLintClass>
}

const eslintDir = process.argv[2]
if (!eslintDir) {
  process.stderr.write("eslint-worker: no ESLint directory given\n")
  process.exit(2)
}

let loaded: Promise<ESLintModule> | null = null

/**
 * The project's `eslint`, resolved by name from the `node_modules` it is in so
 * that its `exports` decide which file that is — then imported, which takes
 * the CommonJS build ESLint 8 and 9 ship and an ESM-only one alike.
 */
function eslintModule(): Promise<ESLintModule> {
  loaded ??= (async () => {
    const nodeModules = path.dirname(eslintDir!)
    const require = createRequire(path.join(nodeModules, "noop.js"))
    const entry = require.resolve("eslint")
    const module = (await import(pathToFileURL(entry).href)) as ESLintModule & {
      default?: ESLintModule
    }
    return module.loadESLint || module.ESLint
      ? module
      : (module.default ?? module)
  })()
  return loaded
}

async function eslintClass(cwd: string, flat: boolean): Promise<ESLintClass> {
  const module = await eslintModule()
  // 8.57 and later decide flat or not by being asked; before that `ESLint` is
  // the `.eslintrc` one and the flat one was an experiment behind a subpath.
  if (module.loadESLint) return module.loadESLint({ useFlatConfig: flat, cwd })
  if (!flat && module.ESLint) return module.ESLint
  throw new Error(
    flat
      ? "eslint.config.* needs ESLint 8.57 or later in this project."
      : "This project's ESLint has no ESLint class."
  )
}

/**
 * The config files in `cwd`, as their modification times — what an ESLint
 * instance was built against.
 *
 * An instance caches the config it loaded, so somebody editing
 * `eslint.config.js` would otherwise go on being linted by the old one until
 * the app restarted. A `stat` per lint is the price of noticing.
 */
async function stampOf(cwd: string): Promise<string> {
  const names = [...FLAT_CONFIG_FILES, ...LEGACY_CONFIG_FILES, "package.json"]
  const times = await Promise.all(
    names.map((name) =>
      stat(path.join(cwd, name)).then(
        (stats) => `${name}:${stats.mtimeMs}`,
        () => ""
      )
    )
  )
  return times.filter(Boolean).join("|")
}

const instances = new Map<
  string,
  { stamp: string; eslint: Promise<ESLintInstance> }
>()

async function instanceFor(
  cwd: string,
  flat: boolean
): Promise<ESLintInstance> {
  const key = `${flat ? "flat" : "legacy"}:${cwd}`
  const stamp = await stampOf(cwd)
  const cached = instances.get(key)
  if (cached?.stamp === stamp) return cached.eslint

  const eslint = eslintClass(cwd, flat).then((ESLint) => new ESLint({ cwd }))
  instances.set(key, { stamp, eslint })
  // A config that failed to load is not cached as failed: the next lint after
  // it is fixed should not have to wait on a stamp to change.
  eslint.catch(() => {
    if (instances.get(key)?.eslint === eslint) instances.delete(key)
  })
  return eslint
}

/** ESLint's messages, with nothing the editor does not draw. */
function messagesOf(results: LintResult[]): EslintMessage[] {
  return results.flatMap((result) =>
    result.messages.map((message) => ({
      line: message.line,
      column: message.column,
      ...(message.endLine !== undefined ? { endLine: message.endLine } : {}),
      ...(message.endColumn !== undefined
        ? { endColumn: message.endColumn }
        : {}),
      severity: message.severity === 2 ? 2 : 1,
      message: message.message,
      ruleId: message.ruleId ?? null,
      ...(message.fix ? { fix: message.fix } : {}),
      ...(message.suggestions?.length
        ? {
            suggestions: message.suggestions.map((suggestion) => ({
              desc: suggestion.desc,
              fix: suggestion.fix,
            })),
          }
        : {}),
    }))
  )
}

async function lint(request: EslintRequest): Promise<EslintResult> {
  try {
    const eslint = await instanceFor(request.cwd, request.flat)
    // `warnIgnored: false`: a file the config ignores, or names no rules for,
    // comes back with no messages rather than one saying so on line 1.
    const results = await eslint.lintText(request.text, {
      filePath: request.filePath,
      warnIgnored: false,
    })
    return { status: "linted", messages: messagesOf(results) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: "failed", error: message.slice(0, 2000) }
  }
}

const lines = readline.createInterface({ input: process.stdin })
lines.on("line", (line) => {
  let request: EslintRequest
  try {
    request = JSON.parse(line) as EslintRequest
  } catch {
    return
  }
  void lint(request).then((result) => {
    write(`${JSON.stringify({ id: request.id, result })}\n`)
  })
})
// Main went away: there is nobody left to answer.
lines.on("close", () => process.exit(0))
