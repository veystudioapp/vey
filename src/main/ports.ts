import { execFile } from "node:child_process"
import { promisify } from "node:util"

import type { ListeningPort } from "../shared/api"

const run = promisify(execFile)

/*
 * The TCP ports something on this machine is listening on, and stopping
 * whatever holds one — the system bar's `Ports`, for the `EADDRINUSE` left by
 * a dev server that outlived its terminal. It replaces `lsof -i :3000` and
 * `kill` pasted into a shell.
 *
 * Free of `electron`, so `test/ports.ts` can import the parsers. Read with
 * absolute paths first: a GUI app inherits almost none of the login shell's
 * PATH, and `lsof` lives in `/usr/sbin`, which is not on the short one.
 */

/** A listener as a parser reads it, before the command line is looked up. */
type Listener = Omit<ListeningPort, "args" | "self">

/**
 * `lsof -nP -iTCP -sTCP:LISTEN -F pcn`: one field per line, each led by its
 * letter — `p` opens a process, `c` names it, `f` a descriptor, `n` the
 * address. A process listening on IPv4 and IPv6 at once is one row, not two.
 */
export function parseLsof(output: string): Listener[] {
  const found: Listener[] = []
  let pid = 0
  let command = ""
  for (const line of output.split("\n")) {
    const field = line[0]
    const value = line.slice(1).trim()
    if (field === "p") {
      pid = Number(value)
      command = ""
    } else if (field === "c") {
      command = value
    } else if (field === "n" && pid > 0) {
      const listener = addressOf(value)
      if (listener) found.push({ ...listener, pid, command })
    }
  }
  return unique(found)
}

/**
 * `netstat -ano -p TCP` and its IPv6 half: `TCP  0.0.0.0:3000  0.0.0.0:0
 * LISTENING  1234`. The state is matched by its column position rather than
 * its word, which Windows translates.
 */
export function parseNetstat(
  output: string,
  names: Map<number, string> = new Map()
): Listener[] {
  const found: Listener[] = []
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/)
    if (columns.length !== 5 || !/^TCP/i.test(columns[0]!)) continue
    // A listener's foreign address is a wildcard port — `0.0.0.0:0`, `[::]:0`.
    if (!/:0$/.test(columns[2]!)) continue
    const listener = addressOf(columns[1]!)
    const pid = Number(columns[4])
    if (!listener || !Number.isInteger(pid) || pid <= 0) continue
    found.push({ ...listener, pid, command: names.get(pid) ?? "" })
  }
  return unique(found)
}

/** `tasklist /FO CSV /NH`: `"node.exe","1234","Console","1","50,000 K"`. */
export function parseTasklist(output: string): Map<number, string> {
  const names = new Map<number, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]*)","(\d+)"/.exec(line.trim())
    if (match) names.set(Number(match[2]), match[1]!)
  }
  return names
}

/** `127.0.0.1:5173`, `*:3000`, `[::1]:8080` — the host and the port. */
function addressOf(value: string): { address: string; port: number } | null {
  const match = /^(.*):(\d+)$/.exec(value)
  if (!match) return null
  const port = Number(match[2])
  if (!Number.isInteger(port) || port <= 0) return null
  return { address: match[1]!.replace(/^\[(.*)\]$/, "$1"), port }
}

/** One row per process and port, sorted by port, the way they are looked up. */
function unique(listeners: Listener[]): Listener[] {
  const seen = new Map<string, Listener>()
  for (const listener of listeners) {
    const key = `${listener.pid}:${listener.port}`
    if (!seen.has(key)) seen.set(key, listener)
  }
  return [...seen.values()].sort((a, b) => a.port - b.port || a.pid - b.pid)
}

/** The first of `commands` that runs, for a tool that may or may not be on
 * PATH. `lsof` exits 1 when nothing matched, which is an answer, not a miss. */
async function runFirst(
  commands: string[],
  args: string[]
): Promise<string | null> {
  for (const command of commands) {
    try {
      const { stdout } = await run(command, args, {
        timeout: 5_000,
        maxBuffer: 4 * 1024 * 1024,
      })
      return stdout
    } catch (error) {
      const failed = error as NodeJS.ErrnoException & { stdout?: string }
      if (failed.code === "ENOENT") continue
      if (typeof failed.stdout === "string") return failed.stdout
      throw error
    }
  }
  return null
}

/** Each process's full command line, which says *which* `node` it is. */
async function commandLines(pids: number[]): Promise<Map<number, string>> {
  const lines = new Map<number, string>()
  if (pids.length === 0 || process.platform === "win32") return lines
  const output = await runFirst(
    ["/bin/ps", "ps"],
    ["-o", "pid=,args=", "-p", pids.join(",")]
  ).catch(() => null)
  for (const line of (output ?? "").split("\n")) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match) lines.set(Number(match[1]), match[2]!.trim())
  }
  return lines
}

export async function listeningPorts(): Promise<ListeningPort[]> {
  let listeners: Listener[]
  if (process.platform === "win32") {
    const [netstat, tasklist] = await Promise.all([
      runFirst(["netstat"], ["-ano", "-p", "TCP"]),
      runFirst(["tasklist"], ["/FO", "CSV", "/NH"]).catch(() => null),
    ])
    const v6 = await runFirst(["netstat"], ["-ano", "-p", "TCPv6"]).catch(
      () => null
    )
    const names = parseTasklist(tasklist ?? "")
    listeners = parseNetstat(`${netstat ?? ""}\n${v6 ?? ""}`, names)
  } else {
    const output = await runFirst(
      ["/usr/sbin/lsof", "/usr/bin/lsof", "lsof"],
      ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"]
    )
    if (output === null) throw new Error("lsof is not installed.")
    listeners = parseLsof(output)
  }

  const args = await commandLines([...new Set(listeners.map((l) => l.pid))])
  return listeners.map((listener) => ({
    ...listener,
    args: args.get(listener.pid),
    self: listener.pid === process.pid,
  }))
}

/**
 * Stops the process holding a port: SIGTERM, so a dev server can shut down
 * cleanly, or SIGKILL for one that would not.
 *
 * Only a pid listening right now, asked again here rather than taken from the
 * renderer on trust — this kills processes, and a stale row's pid may have
 * been handed to something else since the list was drawn. Never this app.
 */
export async function stopListener(pid: number, force: boolean) {
  if (pid === process.pid) throw new Error("That is Vey itself.")
  const listening = await listeningPorts()
  if (!listening.some((listener) => listener.pid === pid)) {
    throw new Error(`Process ${pid} is not listening on a port any more.`)
  }
  if (process.platform === "win32") {
    // `process.kill` on Windows is always a hard stop and leaves children
    // behind; `taskkill /T` takes the tree a dev server's runner started.
    await run("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])])
    return
  }
  try {
    process.kill(pid, force ? "SIGKILL" : "SIGTERM")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      throw new Error(`Not allowed to stop process ${pid} — it is not yours.`)
    }
    throw error
  }
}
