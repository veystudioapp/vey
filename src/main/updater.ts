import { execFileSync, spawn } from "node:child_process"
import { closeSync, createWriteStream, mkdirSync, openSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"
import { pipeline } from "node:stream/promises"

import type { ReleaseNote, UpdateCheck } from "../shared/api"
import { isNewer } from "../shared/version"
import { dataDir } from "./data-dir"

/**
 * Whether there is a newer Vey, and installing it.
 *
 * **Not `electron-updater`, and deliberately.** Squirrel.Mac will not replace a
 * bundle that carries no Developer ID, and these builds carry none — signing
 * costs an Apple Developer membership, which is the same reason `install.sh`
 * exists at all. So the whole of the update story here is: ask GitHub what the
 * latest release is, compare it against this build, and run the very script the
 * README already tells people to paste into a terminal. There is no delta.
 *
 * The one thing this process does fetch is the installer itself
 * (`downloadUpdate`) — when the button is pressed, or ahead of time, in the
 * background, when automatic updates are on, so that the next ordinary quit
 * can install it (`stageUpdate` in `ipc.ts`). The download *is* the wait, about
 * a hundred megabytes of it, and it is the one phase the window is still alive
 * for. `install.sh` quits the app before it copies anything, so a percentage is
 * honest up to there and nothing after it could be drawn at all.
 *
 * Free of `electron` — this process's own version, and where the script it runs
 * lives, are arguments — so `test/updates.ts` can import it under plain `bun`,
 * the same bargain `git.ts` makes.
 */

// The source's own repository, which `release.yml` publishes the installers
// to. They lived in a releases-only `vey-studio-releases` while the source was
// private; a build from before the move still looks there.
const REPO = "veystudioapp/vey"

const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`

const LATEST_RELEASE_API = `${RELEASES_API}/latest`

/** Where "What's new" goes, and the fallback button on anything but macOS. */
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`

/**
 * A check runs unasked, on a timer, so it must not be able to hang about: an
 * unreachable GitHub should read as `unknown` within a few seconds rather than
 * leave a request pending for however long the OS's default is.
 */
const REQUEST_TIMEOUT_MS = 10_000

/** The installer's output, kept because the app it is updating quits halfway
 * through and has nowhere left to show a failure. */
export function updateLogPath(): string {
  return path.join(dataDir(), "update.log")
}

type Release = ReleaseNote

/** The shape of the one release GitHub is asked for, checked rather than cast:
 * this is JSON off the network. */
function asRelease(value: unknown): Release | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const tag = record.tag_name
  if (typeof tag !== "string" || tag.length === 0) return null
  return {
    version: tag.replace(/^v/, ""),
    notes: typeof record.body === "string" ? record.body : "",
    url: typeof record.html_url === "string" ? record.html_url : RELEASES_PAGE,
  }
}

async function latestRelease(): Promise<Release> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
      // GitHub rejects an anonymous API request with no user agent outright,
      // and the rejection is a 403 that reads like rate limiting.
      "User-Agent": "Vey",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status}.`)
  }
  const release = asRelease(await response.json())
  if (!release) throw new Error("The latest release has no tag.")
  return release
}

/**
 * What the update badge is drawn from.
 *
 * `platform` decides only whether the button can install or merely link — the
 * check itself is worth doing everywhere, because "there is a newer version"
 * is true on Windows too even when this app cannot be the one to fetch it.
 */
export async function checkForUpdate(
  current: string,
  platform: NodeJS.Platform
): Promise<UpdateCheck> {
  let release: Release
  try {
    release = await latestRelease()
  } catch (error) {
    return {
      status: "unknown",
      current,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  if (!isNewer(release.version, current)) return { status: "current", current }
  return {
    status: "available",
    version: release.version,
    current,
    notes: release.notes,
    url: release.url,
    installable: platform === "darwin" || platform === "win32",
  }
}

/**
 * How many releases back the notes are looked for. A page of GitHub's listing:
 * somebody who skipped more updates than this gets the newest thirty, and the
 * link to the releases page has the rest.
 */
const NOTES_PAGE = 30

/**
 * The releases after `since`, up to and including `current`, newest first —
 * what somebody who was last on `since` has not been told about yet.
 *
 * `since` null is "only this one": a build from before the notes were shown
 * has no record of what was last seen, and every release in the listing would
 * be a wall of text about versions they used for months.
 */
export function notesBetween(
  releases: unknown,
  since: string | null,
  current: string
): ReleaseNote[] {
  if (!Array.isArray(releases)) return []
  return releases
    .map(asRelease)
    .filter((release): release is Release => release !== null)
    .filter((release) =>
      since === null
        ? !isNewer(release.version, current) &&
          !isNewer(current, release.version)
        : isNewer(release.version, since) && !isNewer(release.version, current)
    )
    .sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1))
}

/**
 * What changed between `since` and this build, for the dialog the first launch
 * after an update opens (`whats-new-dialog.tsx`). Throws when GitHub cannot be
 * asked — the renderer then says nothing and tries again next launch, since a
 * dialog announcing an update with no notes in it is not worth the click.
 */
export async function releaseNotes(
  since: string | null,
  current: string
): Promise<ReleaseNote[]> {
  const response = await fetch(`${RELEASES_API}?per_page=${NOTES_PAGE}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Vey",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status}.`)
  }
  return notesBetween(await response.json(), since, current)
}

/**
 * How often a download says where it got to.
 *
 * A hundred megabytes arrives as a few thousand chunks and every one of them
 * would otherwise be an IPC message and a React render. Ten a second is a bar
 * that still moves smoothly.
 */
const PROGRESS_INTERVAL_MS = 100

type Asset = { url: string; name: string; size: number }

/** What this platform's installer is called at the end — the `.dmg` on macOS,
 * the NSIS `.exe` on Windows — or null where there is none to run. */
function installerSuffix(
  platform: NodeJS.Platform,
  arch: string
): string | null {
  if (platform === "darwin") return `-${arch}.dmg`
  if (platform === "win32") return `-${arch}.exe`
  return null
}

/**
 * The installer for one platform and architecture among a release's assets.
 *
 * Found by the suffix of the asset's *own* name, which is how `install.sh`
 * finds it too — never by building a filename out of a version and a template,
 * so a release whose files are named something else fails as "no arm64 build
 * here" rather than as a 404 on a URL this app invented.
 */
export function installerAsset(
  release: unknown,
  platform: NodeJS.Platform,
  arch: string
): Asset | null {
  const suffix = installerSuffix(platform, arch)
  if (!suffix) return null
  if (typeof release !== "object" || release === null) return null
  const assets = (release as Record<string, unknown>).assets
  if (!Array.isArray(assets)) return null
  for (const entry of assets) {
    if (typeof entry !== "object" || entry === null) continue
    const record = entry as Record<string, unknown>
    const name = record.name
    const url = record.browser_download_url
    if (typeof name !== "string" || typeof url !== "string") continue
    if (!name.endsWith(suffix)) continue
    // An absent or nonsense size reads as zero, which is "total unknown" — the
    // bar draws that as indeterminate rather than as a percentage of nothing.
    const size =
      typeof record.size === "number" && record.size > 0 ? record.size : 0
    return { name, url, size }
  }
  return null
}

/** A release by tag, in both spellings — which one a release used is not
 * something anything here should have to know, the same reason `install.sh`
 * tries both. */
async function releaseByTag(version: string): Promise<unknown> {
  const bare = version.replace(/^v/, "")
  for (const tag of [`v${bare}`, bare]) {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Vey",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )
    if (response.ok) return response.json()
    // Anything but "no such tag" is worth saying out loud: a 403 here is rate
    // limiting, and retrying it under the other spelling would report it as a
    // missing release.
    if (response.status !== 404) {
      throw new Error(`GitHub answered ${response.status}.`)
    }
  }
  throw new Error(`No release tagged ${bare}.`)
}

/**
 * Downloads a release's installer, reporting how far it has got.
 *
 * Ahead of `install.sh` rather than inside it: the script's own `curl` writes a
 * progress bar to a log file nobody is reading, and this is the only phase of
 * an install that can be drawn in the window — everything after it happens with
 * the app already quit.
 *
 * Answers with the file's path, which is handed straight to the installer.
 */
export async function downloadUpdate(input: {
  version: string
  platform: NodeJS.Platform
  /** `process.arch` — matches the `-arm64.dmg` / `-x64.exe` suffix. */
  arch: string
  /** Called at most every `PROGRESS_INTERVAL_MS`, and once more at the end.
   * `total` is 0 when the release does not say how large the asset is. */
  onProgress: (received: number, total: number) => void
}): Promise<string> {
  const asset = installerAsset(
    await releaseByTag(input.version),
    input.platform,
    input.arch
  )
  if (!asset) {
    throw new Error(
      `No ${input.platform} ${input.arch} installer in ${input.version}.`
    )
  }

  const dir = path.join(dataDir(), "updates")
  // Emptied rather than added to: this holds one asset at a time, and an
  // install that failed halfway should not leave a hundred megabytes behind for
  // the next one to sit beside.
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, asset.name)

  // No timeout on this one, unlike the metadata requests above: a slow link is
  // not a hung request, and there is a person watching the bar who can say when
  // they have had enough.
  const response = await fetch(asset.url, {
    headers: { "User-Agent": "Vey" },
  })
  if (!response.ok || !response.body) {
    throw new Error(`The download answered ${response.status}.`)
  }

  const declared = Number(response.headers.get("content-length"))
  const total =
    Number.isFinite(declared) && declared > 0 ? declared : asset.size

  let received = 0
  let announced = 0
  const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>)
  body.on("data", (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (now - announced < PROGRESS_INTERVAL_MS) return
    announced = now
    input.onProgress(received, total)
  })
  await pipeline(body, createWriteStream(file))
  // The last chunk is almost always inside the throttle window, so without this
  // the bar stops a per cent or two short of the install starting.
  input.onProgress(received, total)
  return file
}

/**
 * Runs `install.sh` for a version, and reopens the app afterwards when asked.
 *
 * Synchronous, because one of its callers is `will-quit`: the process exits as
 * soon as that handler returns, and an `await` in front of the spawn would be
 * an installer that never starts.
 *
 * **Detached, and that is the whole trick.** The script's third act is quitting
 * the app so that a bundle is not replaced out from under a running process —
 * it does that itself, `osascript` and a `pgrep` loop, because somebody running
 * it from a terminal needs it too. A child of the process being quit would die
 * with it midway through a `ditto`; a detached one outlives it and gets to the
 * `open` at the end.
 *
 * Output goes to a file for the same reason: by the time anything goes wrong,
 * the window that would have shown it is gone.
 */
export function startInstaller(input: {
  /** The `install.sh` shipped inside the app bundle. */
  script: string
  version: string
  /** The bundle to reopen — where `install.sh` puts it, not where this process
   * happens to be running from. Null for an install at quit: somebody who
   * quit the app did not ask for it back. */
  appPath: string | null
  /** The `.dmg` `downloadUpdate` already fetched, so the script skips its own
   * `curl`. The script deletes it on the way out. */
  dmg?: string
}): void {
  const logPath = updateLogPath()
  mkdirSync(path.dirname(logPath), { recursive: true })
  // Truncated rather than appended: what matters is the run that just failed,
  // and this file is read by a person looking for exactly that.
  const log = openSync(logPath, "w")

  const child = spawn(
    "/bin/bash",
    [
      "-c",
      // Arguments rather than an interpolated string: a version is a value from
      // the network, and this one ends up on a command line.
      input.appPath ? 'bash "$1" "$2" && open "$3"' : 'bash "$1" "$2"',
      "veystudio-update",
      input.script,
      input.version,
      ...(input.appPath ? [input.appPath] : []),
    ],
    {
      detached: true,
      stdio: ["ignore", log, log],
      // The one thing passed by environment rather than argument: the script's
      // positional arguments are its public interface — a version, from a
      // terminal — and a pre-downloaded file is this app talking to itself.
      env: input.dmg
        ? { ...process.env, VEYSTUDIO_UPDATE_DMG: input.dmg }
        : process.env,
      // No cwd of this app's: it may be inside the bundle about to be replaced.
      cwd: path.dirname(logPath),
    }
  )
  // The child holds its own copy; this one would otherwise outlive the spawn.
  closeSync(log)
  child.unref()
}

/**
 * What the NSIS installer is run with — the flags electron-updater itself
 * passes to an installer this template built.
 *
 * It is started at `will-quit` (`quitTask` in `electron-ipc.ts`), so the
 * app's own quit has already happened: `before-quit` ended the terminals and
 * the chats the way any other quit does. Not from a PowerShell wrapper waiting
 * on this process — a PowerShell spawned `detached` has no console and exits
 * at once, having run nothing — and not before the quit, which would leave the
 * installer's `taskkill` racing the cleanup.
 *
 * - `/S` — silent: no wizard to click through, since the window that asked for
 *   the update is gone by the time it would appear.
 * - `--updated` — the running-app check closes whatever copy of the executable
 *   is still about without asking. It is not relied on for the pty daemon —
 *   see `endOtherCopies`. The old version's files are moved aside rather than
 *   deleted, so a failed copy can put them back.
 * - `--force-run` — a silent one-click install launches the app afterwards only
 *   when asked to; without it the update would end with nothing on screen.
 *   Left off for an install at quit, which is somebody closing the app: it
 *   reopening on its own a few seconds later would be the app overruling them.
 *
 * The `.exe` is left in `updates/`, which the next `downloadUpdate` empties: by
 * the time it could be deleted nothing of this app is running to do it. Nor is
 * there a log — NSIS writes none, and the app reopening is the answer.
 */
export function windowsInstallerArgs(reopen: boolean): string[] {
  return reopen ? ["/S", "--updated", "--force-run"] : ["/S", "--updated"]
}

/**
 * Ends every other process running this app's executable, and waits for them
 * to go, before the installer is started.
 *
 * The pty daemon is the one that matters: it is this same `.exe` running
 * `daemon.cjs` out of `app.asar`, it outlives the app by a minute at least (for
 * good while it still holds a session this run did not start), and the
 * installer's own running-app check let it through. With it alive the old
 * uninstaller fails, the extraction cannot replace the two files it holds and
 * overwrites everything else regardless — so the update "succeeds" with the old
 * `Vey.exe` and `app.asar` still in place, and the app reopens as the
 * version it was. A TypeScript server is the same executable too.
 *
 * Chromium's own helpers (`--type=`) are left alone: they belong to this
 * process and go when it does.
 *
 * Synchronous and attached, not detached: a PowerShell with no console exits
 * having run nothing. The pid and the path go by environment rather than into
 * the script, where a quote in a user's name would end the string.
 */
function endOtherCopies(): void {
  const script = [
    "Get-CimInstance Win32_Process",
    "| Where-Object { $_.ExecutablePath -eq $env:VEYSTUDIO_EXE -and $_.ProcessId -ne [int]$env:VEYSTUDIO_PID -and $_.CommandLine -notmatch ' --type=' }",
    "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Wait-Process -Id $_.ProcessId -Timeout 5 -ErrorAction SilentlyContinue }",
  ].join(" ")
  const powershell = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  )
  try {
    execFileSync(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: {
          ...process.env,
          VEYSTUDIO_EXE: process.execPath,
          VEYSTUDIO_PID: String(process.pid),
        },
        stdio: "ignore",
        windowsHide: true,
        timeout: 20_000,
      }
    )
  } catch (error) {
    // The installer's own check is still behind this, and the quit goes on.
    console.error("Could not end the app's other processes:", error)
  }
}

/** Starts the NSIS installer, detached — see `windowsInstallerArgs`. */
export function startWindowsInstaller(file: string, reopen: boolean): void {
  endOtherCopies()
  spawn(file, windowsInstallerArgs(reopen), {
    detached: true,
    stdio: "ignore",
    // Not the install directory, which this is about to replace.
    cwd: path.dirname(file),
  }).unref()
}
