import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { autoUpdater as squirrel } from "electron"
import { autoUpdater, type ProgressInfo } from "electron-updater"

import type { MacUpdate } from "./host"
import { updateLogPath } from "./updater"

/**
 * macOS's in-app update: electron-updater downloads the release's zip, and
 * Squirrel.Mac checks it and swaps the bundle once the app has quit, then
 * reopens it.
 *
 * It replaced `install.sh` once the builds were signed (`docs/design.md`
 * § Updating). Squirrel refuses a bundle whose signature does not satisfy the
 * running app's designated requirement, so an update is checked as coming from
 * the same developer — the script copied whatever the disk image held. And the
 * app quits itself through its own `before-quit`, where the script sent a
 * `quit app` Apple Event that the hardened runtime may refuse, waited five
 * seconds on a `pgrep` the pty daemon also matched, and reopened a bundle name
 * it had guessed.
 *
 * The one half of the updater that needs `electron`, so it is not in
 * `updater.ts`.
 */

/** A line of electron-updater's own account into `update.log`: the app is
 * gone by the time Squirrel can fail, and this is where to look afterwards. */
function writeLog(level: string, message: unknown): void {
  const text =
    message instanceof Error
      ? (message.stack ?? message.message)
      : String(message)
  try {
    appendFileSync(
      updateLogPath(),
      `${new Date().toISOString()} ${level} ${text}\n`
    )
  } catch {
    // A log that cannot be written is not a reason to stop an update.
  }
}

export const installMacUpdate: MacUpdate = async ({
  version,
  feedUrl,
  onProgress,
  onInstalling,
}) => {
  const log = updateLogPath()
  mkdirSync(path.dirname(log), { recursive: true })
  // Truncated rather than appended: what matters is the run that just failed.
  writeFileSync(log, "")

  autoUpdater.logger = {
    info: (message) => writeLog("info", message),
    warn: (message) => writeLog("warn", message),
    error: (message) => writeLog("error", message),
    debug: (message) => writeLog("debug", message),
  }
  // The button is the whole of it: nothing is fetched until it is pressed.
  autoUpdater.autoDownload = false
  // True is what makes electron-updater hand the zip to Squirrel as soon as it
  // has it. False defers that to `quitAndInstall`, so a refused signature would
  // arrive with the windows already closing and nothing left to say it in.
  autoUpdater.autoInstallOnAppQuit = true
  // A differential download reports no `download-progress`, and the bar is
  // what the window has to show for the wait.
  autoUpdater.disableDifferentialDownload = true
  autoUpdater.setFeedURL({ provider: "generic", url: feedUrl })

  const check = await autoUpdater.checkForUpdates()
  const offered = check?.updateInfo.version
  if (offered !== version) {
    throw new Error(
      offered
        ? `The release offers ${offered}, not ${version}.`
        : `No macOS update was found in ${version}.`
    )
  }

  // Squirrel's own events, not electron-updater's: its `update-downloaded`
  // fires when *its* download is done, before Squirrel has fetched the zip
  // from it and checked the signature — the step that refuses a bad bundle.
  let staged!: () => void
  let refused!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    staged = resolve
    refused = reject
  })
  const progress = (info: ProgressInfo) =>
    onProgress(info.transferred, info.total)
  squirrel.once("update-downloaded", staged)
  squirrel.once("error", refused)
  autoUpdater.on("download-progress", progress)
  autoUpdater.once("update-downloaded", onInstalling)
  try {
    // With `autoInstallOnAppQuit` the macOS download's promise settles only on
    // a failure, never on success, so it is raced rather than awaited.
    await Promise.race([ready, autoUpdater.downloadUpdate().then(() => ready)])
  } finally {
    squirrel.off("update-downloaded", staged)
    squirrel.off("error", refused)
    autoUpdater.off("download-progress", progress)
    autoUpdater.off("update-downloaded", onInstalling)
  }

  // Closes the windows and quits through `before-quit` like any other quit, so
  // the terminals and chats end the usual way; Squirrel's ShipIt waits for
  // this process to be gone, swaps the bundle and opens the new one.
  autoUpdater.quitAndInstall()
}
