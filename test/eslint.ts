import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import * as esbuild from "esbuild"

import { configFor, eslintDirFor, EslintServers } from "../src/main/eslint"
import type { EslintResult } from "../src/shared/eslint"
import { check, finish, section } from "./harness"

/**
 * The editor's ESLint, against a real ESLint: this repository's own, with its
 * own `eslint.config.js`, run in the worker the app bundles.
 *
 * Nothing mocked, for the reason `test/tsserver.ts` gives — what is worth
 * checking is that a project's config is found and loaded, that the worker's
 * framing holds, and that ESLint's positions and fixes come back as the editor
 * reads them. The worker is bundled the way `scripts/build-electron.mjs` does
 * and run on a real `node`, not on bun: it is Electron-as-Node that ships.
 */

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))

function messagesOf(result: EslintResult | null) {
  return result?.status === "linted" ? result.messages : null
}

async function main() {
  const scratch = await realpath(await mkdtemp(path.join(tmpdir(), "eslint-")))
  const worker = path.join(scratch, "eslint-worker.cjs")
  await esbuild.build({
    entryPoints: [path.join(root, "src/main/eslint-worker.ts")],
    outfile: worker,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    logLevel: "warning",
  })

  // A project of its own beside this one: this repository's ESLint, linked
  // in, and a config the test can break and mend.
  const project = path.join(scratch, "project")
  await mkdir(path.join(project, "node_modules"), { recursive: true })
  await symlink(
    path.join(root, "node_modules", "eslint"),
    path.join(project, "node_modules", "eslint"),
    "dir"
  )
  const bare = path.join(scratch, "bare")
  await mkdir(bare)

  const servers = new EslintServers(
    async () => [root, project, bare],
    worker,
    "node"
  )

  try {
    section("finding the project's ESLint")

    const file = path.join(root, "src", "main", "eslint.ts")
    check(
      "a file is linted by the ESLint its folder installed",
      eslintDirFor(file, root) === path.join(root, "node_modules", "eslint"),
      eslintDirFor(file, root)
    )
    check(
      "a folder with none is linted by nothing",
      eslintDirFor(path.join(bare, "a.ts"), bare) === null
    )
    check(
      "the nearest eslint.config.* is where it runs, as a flat config",
      JSON.stringify(
        configFor(file, root, path.join(root, "node_modules", "eslint"))
      ) === JSON.stringify({ cwd: root, flat: true }),
      configFor(file, root, path.join(root, "node_modules", "eslint"))
    )
    check(
      "an ESLint with no config near it is not a project asking to be linted",
      (await servers.lint(path.join(project, "a.js"), "var a = 1\n"))
        ?.status === "unavailable"
    )
    check(
      "a file in no folder is not linted",
      (await servers.lint(path.join(scratch, "elsewhere.js"), ""))?.status ===
        "unavailable"
    )

    section("linting a buffer")

    // Not on disk: the editor's buffer is what is linted, unsaved.
    const unused = messagesOf(
      await servers.lint(
        path.join(root, "src", "main", "lint-probe.local.ts"),
        "export {}\n"
      )
    )
    check(
      "a path the config ignores comes back with nothing, not a warning",
      unused !== null && unused.length === 0,
      unused
    )

    const probe = path.join(root, "src", "main", "lint-probe.ts")
    const text = "const unusedThing = 1\nlet kept = 2\nexport { kept }\n"
    const messages = messagesOf(await servers.lint(probe, text)) ?? []
    const unusedMessage = messages.find(
      (message) => message.ruleId === "@typescript-eslint/no-unused-vars"
    )
    check(
      "the project's own rules answer, through its own plugins",
      unusedMessage !== undefined,
      messages
    )
    check(
      "positions are ESLint's: 1-based, the end exclusive",
      unusedMessage?.line === 1 &&
        unusedMessage.column === 7 &&
        unusedMessage.endLine === 1 &&
        unusedMessage.endColumn === 18,
      unusedMessage
    )
    const preferConst = messages.find(
      (message) => message.ruleId === "prefer-const"
    )
    check(
      "a rule's autofix comes back as a range of the text that was sent",
      preferConst?.fix !== undefined &&
        text.slice(0, preferConst.fix.range[0]) +
          preferConst.fix.text +
          text.slice(preferConst.fix.range[1]) ===
          "const unusedThing = 1\nconst kept = 2\nexport { kept }\n",
      preferConst
    )

    const broken = messagesOf(await servers.lint(probe, "const = \n"))
    check(
      "a parse error is a message with no rule",
      broken?.length === 1 && broken[0]!.ruleId === null,
      broken
    )

    section("a config that cannot load")

    const config = path.join(project, "eslint.config.js")
    await writeFile(config, 'throw new Error("this config is broken")\n')
    const failed = await servers.lint(path.join(project, "a.js"), "var a\n")
    check(
      "says why, rather than linting nothing in silence",
      failed?.status === "failed" &&
        failed.error.includes("this config is broken"),
      failed
    )

    await writeFile(
      config,
      'export default [{ rules: { "no-var": "error" } }]\n'
    )
    const mended = messagesOf(
      await servers.lint(path.join(project, "a.js"), "var a\nexport { a }\n")
    )
    check(
      "a mended config is read again without a restart",
      mended?.some((message) => message.ruleId === "no-var") === true,
      mended
    )
  } finally {
    servers.stopAll()
    await rm(scratch, { recursive: true, force: true })
  }

  finish()
}

void main()
