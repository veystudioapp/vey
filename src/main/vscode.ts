/**
 * Opening a file or folder in the user's own VS Code — the `code` CLI,
 * resolved through the login shell the same way `claudeBinary` is
 * (`claude-bin.ts`), since it is the same kind of "whatever the user
 * installed, wherever that put it" problem. `CODE_BIN` is for a custom
 * install, same bargain as `CLAUDE_BIN`.
 */
import { spawn } from "node:child_process"
import { locate } from "./shell-env"

export function codeBinary(): string {
  return process.env.CODE_BIN ?? "code"
}

export async function openInVscode(target: string): Promise<void> {
  const binary = await locate(codeBinary())
  if (!binary) {
    throw new Error(
      `Could not find \`${codeBinary()}\` on your PATH. Install the "code" shell command from VS Code's Command Palette, or set CODE_BIN if it is installed somewhere unusual.`
    )
  }
  // Fire-and-forget, same as launching anything else external to this app —
  // nothing here waits on VS Code to exit.
  spawn(binary, [target], { detached: true, stdio: "ignore" }).unref()
}
