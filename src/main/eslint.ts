import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  FLAT_CONFIG_FILES,
  LEGACY_CONFIG_FILES,
  type EslintRequest,
  type EslintResult,
} from "../shared/eslint"

/**
 * ESLint for the editor: the squiggles the built-in `eslint` plugin draws.
 *
 * **The project's own ESLint, and no other** — the bargain `tsserver.ts` makes
 * with TypeScript, and stricter here. A config is resolved against the
 * project's `node_modules`: `typescript-eslint`, `eslint-plugin-react` and the
 * rest are found next to the `eslint` that loads them, so a copy shipped inside
 * the app would not find them, and an ESLint 9 cannot read the `.eslintrc` an
 * ESLint 8 project is written in. A file with no ESLint above it is linted by
 * nothing, silently.
 *
 * **A process, not a `require` in main.** A config is the project's code, run;
 * a type-aware rule set builds a whole TypeScript program before its first
 * answer. Either, in main, is the studio frozen while it happens — or gone,
 * when it throws in the wrong place. `eslint-worker.ts` is that process, one per
 * ESLint installation, on Electron's own binary as plain Node.
 *
 * Here and not in the plugin because a plugin is a page module with no Node
 * half (`docs/design.md` § Plugins): this file is the capability, the plugin is
 * the policy — which files, how a message is drawn, what a fix does.
 */

/** A first lint loads the config and, with type-aware rules, the whole
 * program — on a monorepo that is long. Past this the answer is dropped and
 * the editor keeps what it had drawn. */
const LINT_TIMEOUT_MS = 60_000

/**
 * The `eslint` package a file is linted by: the nearest `node_modules/eslint`
 * from the file's directory up to the workspace folder it is in, and never
 * above it — a folder is linted by what it installed, not by whatever happens
 * to sit in a parent directory.
 *
 * Nearest rather than the folder's top level only (which is all `tsserver.ts`
 * reads), because a monorepo that installs ESLint per package is common, and
 * linting one package with another's plugins is a wrong answer, not a missing
 * one.
 */
export function eslintDirFor(file: string, root: string): string | null {
  for (const dir of upFrom(path.dirname(file), root)) {
    const candidate = path.join(dir, "node_modules", "eslint")
    if (existsSync(path.join(candidate, "package.json"))) return candidate
  }
  return null
}

/**
 * Where ESLint is run for a file, and which kind of config it reads there — or
 * null when the project has none.
 *
 * The nearest `eslint.config.*` wins: ESLint 9 looks for it in its `cwd` and no
 * further, so the cwd has to be that directory. Failing one, an `.eslintrc`
 * anywhere up to the root (or a `package.json` with `eslintConfig`) makes it an
 * old-style project, run from the directory ESLint is installed in, which is
 * where those configs' plugins resolve from.
 *
 * None at all is no lint rather than ESLint's own "could not find a config"
 * on every file: an `eslint` hoisted into `node_modules` by some other
 * package's dependencies is not a project asking to be linted.
 */
export function configFor(
  file: string,
  root: string,
  eslintDir: string
): { cwd: string; flat: boolean } | null {
  const dirs = upFrom(path.dirname(file), root)

  for (const dir of dirs) {
    if (FLAT_CONFIG_FILES.some((name) => existsSync(path.join(dir, name)))) {
      return { cwd: dir, flat: true }
    }
  }

  const legacy = dirs.some(
    (dir) =>
      LEGACY_CONFIG_FILES.some((name) => existsSync(path.join(dir, name))) ||
      hasEslintConfigField(path.join(dir, "package.json"))
  )
  // `<project>/node_modules/eslint` → `<project>`.
  return legacy
    ? { cwd: path.dirname(path.dirname(eslintDir)), flat: false }
    : null
}

/** `dir` and every directory above it, up to and including `root`. */
function upFrom(dir: string, root: string): string[] {
  const dirs: string[] = []
  let current = dir
  for (;;) {
    if (current !== root && !current.startsWith(root + path.sep)) break
    dirs.push(current)
    if (current === root) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return dirs
}

function hasEslintConfigField(file: string): boolean {
  try {
    const json = JSON.parse(readFileSync(file, "utf8")) as unknown
    return typeof json === "object" && json !== null && "eslintConfig" in json
  } catch {
    return false
  }
}

type Pending = {
  resolve: (result: EslintResult | null) => void
  timer: ReturnType<typeof setTimeout>
}

/** One worker, for one ESLint installation. */
class EslintWorker {
  private child: ChildProcess | null = null
  private buffer = ""
  private seq = 0
  private readonly pending = new Map<number, Pending>()

  constructor(
    private readonly eslintDir: string,
    private readonly worker: string,
    private readonly node: string
  ) {}

  private start(): ChildProcess {
    if (this.child && !this.child.killed) return this.child

    const child = spawn(this.node, [this.worker, this.eslintDir], {
      cwd: path.dirname(path.dirname(this.eslintDir)),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => this.receive(chunk))
    // What configs and plugins print. Nobody reads it: a config that fails says
    // so in the answer, and that is what the editor shows.
    child.stderr?.on("data", () => {})
    child.on("exit", () => this.forget())
    // A worker that cannot be started (no such binary) is an `exit` that never
    // comes; the error is the same news.
    child.on("error", () => this.forget())

    this.child = child
    return child
  }

  private forget() {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.resolve(null)
    }
    this.pending.clear()
    this.buffer = ""
    this.child = null
  }

  /** Newline-delimited, and a read may end mid-line or carry several. */
  private receive(chunk: string) {
    this.buffer += chunk
    for (;;) {
      const end = this.buffer.indexOf("\n")
      if (end === -1) return
      const line = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 1)

      let message: { id?: number; result?: EslintResult }
      try {
        message = JSON.parse(line) as typeof message
      } catch {
        continue
      }
      const request = this.pending.get(message.id ?? -1)
      if (!request || !message.result) continue
      this.pending.delete(message.id!)
      clearTimeout(request.timer)
      request.resolve(message.result)
    }
  }

  lint(input: Omit<EslintRequest, "id">): Promise<EslintResult | null> {
    const id = (this.seq += 1)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, LINT_TIMEOUT_MS)
      this.pending.set(id, { resolve, timer })
      const request: EslintRequest = { id, ...input }
      this.start().stdin?.write(`${JSON.stringify(request)}\n`)
    })
  }

  stop() {
    this.child?.kill()
    this.forget()
  }
}

/**
 * The workers, one per ESLint installation, each started by the first file
 * that needs it. Nothing at launch, for the reason `TsServers` gives.
 */
export class EslintServers {
  private readonly workers = new Map<string, EslintWorker>()

  /**
   * `folders` is read afresh on every call, as `TsServers` does. `worker` is
   * the bundled `eslint-worker.cjs`; `node` is Electron's own binary in the
   * app and a real `node` under the tests, for the reason `TsServers` gives.
   */
  constructor(
    private readonly folders: () => Promise<string[]>,
    private readonly worker: string,
    private readonly node: string = process.execPath
  ) {}

  /**
   * `text` linted as the file at `file` — the editor's buffer, unsaved edits
   * and all. Null when no answer came in time or the worker died under it,
   * which the editor reads as "keep what is drawn".
   */
  async lint(file: string, text: string): Promise<EslintResult | null> {
    const root = (await this.folders())
      .filter(
        (candidate) =>
          file === candidate || file.startsWith(candidate + path.sep)
      )
      .sort((a, b) => b.length - a.length)[0]
    if (root === undefined) return { status: "unavailable" }

    const eslintDir = eslintDirFor(file, root)
    if (eslintDir === null) return { status: "unavailable" }
    const config = configFor(file, root, eslintDir)
    if (config === null) return { status: "unavailable" }

    let worker = this.workers.get(eslintDir)
    if (!worker) {
      worker = new EslintWorker(eslintDir, this.worker, this.node)
      this.workers.set(eslintDir, worker)
    }
    return worker.lint({ ...config, filePath: file, text })
  }

  /** The workers whose ESLint is under `dir`, ahead of it being deleted —
   * Windows will not delete a `node_modules` a running process holds open. */
  stopUnder(dir: string): void {
    for (const [eslintDir, worker] of this.workers) {
      if (!eslintDir.startsWith(dir + path.sep)) continue
      worker.stop()
      this.workers.delete(eslintDir)
    }
  }

  stopAll(): void {
    for (const worker of this.workers.values()) worker.stop()
    this.workers.clear()
  }
}
