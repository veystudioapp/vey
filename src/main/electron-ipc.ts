import { writeFile } from "node:fs/promises"
import path from "node:path"

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  Notification,
  powerMonitor,
  safeStorage,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from "electron"

import { IPC } from "../shared/api"
import {
  browserCookieSites,
  clearBrowserCookies,
  guestPage,
  setBrowserCookies,
} from "./electron-browser"
import type { Host } from "./host"
import { createIpc } from "./ipc"
import { clampPercent, kilobytes } from "./system-usage"

/** The installer, shipped in the bundle (`extraResources`) rather than fetched:
 * a button that runs a script downloaded at the moment it is pressed is a
 * different thing to agree to than one that runs the app's own. */
function installerScript(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "install.sh")
    : path.join(app.getAppPath(), "install.sh")
}

/** The built-in plugins: an `extraResources` entry in a packaged app, and what
 * `scripts/build-plugins.mjs` left in `dist-plugins/` while developing. */
function bundledPluginsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "plugins")
    : path.join(app.getAppPath(), "dist-plugins")
}

/** The window an IPC call came from, if it is still there. */
function ownerOf(caller: unknown): BrowserWindow | null {
  const sender = (caller as IpcMainInvokeEvent | undefined)?.sender
  const owner = sender ? BrowserWindow.fromWebContents(sender) : null
  return owner && !owner.isDestroyed() ? owner : null
}

/**
 * This app's own share: every process Electron runs, added up.
 *
 * `getAppMetrics()` reports one row per process — the main process, each
 * renderer, the GPU and utility processes — and none of them alone is "the
 * app". The ptys are not in here: a `claude` or a shell is a child of the
 * daemon, not of this app, and counting it would make the studio look
 * responsible for work the user started deliberately.
 *
 * `percentCPUUsage` is Chromium's own since-the-last-call delta, on the same
 * clock as the machine figure, and — measured, not assumed — it is already a
 * share of *all* cores rather than of one: a process burning 1.09 CPU-seconds
 * over two seconds on a ten-core machine reports 5%, not 54%. So it goes
 * straight into `appCpuPercent`, and it is the *Activity Monitor* figure that
 * has to be derived, by multiplying back up by the core count. Both are carried
 * because a bar disagreeing with Activity Monitor by a factor of ten, with no
 * way to see why, would just look broken.
 */
function electronShare(cores: number): ReturnType<Host["appShare"]> {
  const metrics = app.getAppMetrics()

  let machine = 0
  let memory = 0
  for (const entry of metrics) {
    machine += entry.cpu.percentCPUUsage
    memory += kilobytes(entry.memory.workingSetSize)
  }

  return {
    appCpuPercent: clampPercent(machine),
    appCoreCpuPercent: Math.max(0, machine * Math.max(1, cores)),
    appMemory: memory,
    appProcesses: metrics.length,
  }
}

/**
 * Puts every handler in `ipc.ts` on `ipcMain`, with Electron as its host.
 *
 * Every push event goes to every window — see `send` in `ipc.ts` — and the
 * dialogs are parented to the studio when there is one, so a picker is modal
 * to it rather than a sheet the user can lose behind it.
 */
export function registerIpc(
  getWindow: () => BrowserWindow | null,
  /** Opens or focuses the window one chat is popped out into — `main.ts`
   * owns window creation, so this is handed in rather than done here. */
  openChatWindow: (chatId: string) => void
) {
  /** Brings the studio up: from the dock, from behind another app, or from
   * minimised, which are three different states and only the last has a name. */
  const showWindow = (): BrowserWindow | null => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return null
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return window
  }

  /** The studio, scrolled to one chat — where a notification's click leads. */
  const revealChat = (chatId: string): void => {
    showWindow()?.webContents.send(IPC.revealChat, chatId)
  }

  const showOpenDialog = (options: OpenDialogOptions) => {
    const window = getWindow()
    return window
      ? dialog.showOpenDialog(window, options)
      : dialog.showOpenDialog(options)
  }

  /**
   * What runs once the app has quit — an update's installer. `will-quit`
   * rather than earlier: `before-quit` defers the quit until the terminals and
   * chats are ended, and this is the first moment after that.
   *
   * `atSessionEnd` is false for an update nobody pressed a button for: the OS
   * logging off or shutting down quits the app too, and an installer started
   * then is killed with the session somewhere in the middle of its copy.
   */
  let quitTask: { run: () => void; atSessionEnd: boolean } | null = null
  let sessionEnding = false
  // `session-end` is Windows', on a window; `shutdown` is macOS's and Linux's,
  // and `powerMonitor` cannot be touched before `ready`.
  app.on("browser-window-created", (_event, window) => {
    window.on("session-end", () => {
      sessionEnding = true
    })
  })
  void app.whenReady().then(() => {
    powerMonitor.on("shutdown", () => {
      sessionEnding = true
    })
  })
  app.on("will-quit", () => {
    const task = quitTask
    quitTask = null
    if (!task || (sessionEnding && !task.atSessionEnd)) return
    try {
      task.run()
    } catch (error) {
      // Nothing is left to show it to, and the quit must go on regardless.
      console.error("The quit task failed:", error)
    }
  })

  const host: Host = {
    send(channel, payload) {
      for (const window of BrowserWindow.getAllWindows()) {
        // Gone during shutdown; its last output has nowhere to go.
        if (window.isDestroyed()) continue
        window.webContents.send(channel, payload)
      }
    },

    async pickDirectory(options) {
      const result = await showOpenDialog({
        title: options?.title ?? "Add a folder",
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: options?.buttonLabel ?? "Add",
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },

    async pickNewDirectory({ title, buttonLabel }) {
      // A save panel rather than the open panel's `New Folder`, which leaves
      // the folder made and still has to be picked: here the name is typed
      // once and the folder is made by whoever asked.
      const window = BrowserWindow.getFocusedWindow()
      const options = {
        title,
        buttonLabel,
        nameFieldLabel: "Name:",
        defaultPath: app.getPath("home"),
        properties: ["createDirectory" as const],
      }
      const result = await (window
        ? dialog.showSaveDialog(window, options)
        : dialog.showSaveDialog(options))
      return result.canceled || !result.filePath ? null : result.filePath
    },

    async pickFiles({ title, directory, single, filters }) {
      const result = await showOpenDialog({
        title,
        properties: single ? ["openFile"] : ["openFile", "multiSelections"],
        ...(directory ? { defaultPath: directory } : {}),
        ...(filters ? { filters } : {}),
      })
      return result.canceled ? [] : result.filePaths
    },

    async saveTextFile(caller, input) {
      const owner = ownerOf(caller)
      const options = {
        defaultPath: path.join(app.getPath("documents"), input.defaultName),
        filters: input.filters,
      }
      const result = await (owner
        ? dialog.showSaveDialog(owner, options)
        : dialog.showSaveDialog(options))
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, input.text, "utf8")
      return result.filePath
    },

    async clipboardImage() {
      const image = clipboard.readImage()
      return image.isEmpty() ? null : image.toPNG()
    },

    trash: (target) => shell.trashItem(target),
    async reveal(target) {
      shell.showItemInFolder(target)
    },
    async startDrag(caller, target) {
      const sender = (caller as IpcMainInvokeEvent | undefined)?.sender
      if (!sender || sender.isDestroyed()) return
      // macOS refuses a drag with an empty image, and the file's own icon is
      // what Finder would have shown under the pointer anyway.
      const icon = await app.getFileIcon(target, { size: "small" })
      sender.startDrag({ file: target, icon })
    },

    // Any window of this app's, not only the studio's: a chat popped out into
    // its own window and being read there is one nobody needs calling back to.
    focused: () => BrowserWindow.getFocusedWindow() !== null,

    notify({ title, body, chatId }) {
      if (!Notification.isSupported()) return
      const banner = new Notification({ title, body })
      banner.on("click", () => revealChat(chatId))
      banner.show()
    },

    openChatWindow,
    // On the *calling* window: the studio has no reason to pin itself, and a
    // popped-out chat is the one that wants to stay over another editor.
    setAlwaysOnTop(caller, on) {
      ownerOf(caller)?.setAlwaysOnTop(on, "floating")
    },
    isAlwaysOnTop: (caller) => ownerOf(caller)?.isAlwaysOnTop() ?? false,

    setBadgeCount(count) {
      app.setBadgeCount(Math.max(0, Math.floor(count)))
    },
    browserPage(caller, webContentsId) {
      const sender = (caller as IpcMainInvokeEvent | undefined)?.sender
      return sender ? guestPage(sender, webContentsId) : null
    },
    setBrowserCookies,
    browserCookieSites,
    clearBrowserCookies,
    async appIcon(appPath) {
      try {
        const icon = await app.getFileIcon(appPath, { size: "normal" })
        return icon.isEmpty() ? null : icon.toDataURL()
      } catch {
        return null
      }
    },
    openExternal(url) {
      void shell.openExternal(url)
    },
    fetch: (url, init) => net.fetch(url, init),
    // The keychain's key where there is one. Without it — a Linux desktop with
    // no secret service — the text is kept as it is and marked so, rather
    // than a custom API that cannot be saved at all.
    seal(text) {
      return safeStorage.isEncryptionAvailable()
        ? `sealed:${safeStorage.encryptString(text).toString("base64")}`
        : `plain:${text}`
    },
    unseal(sealed) {
      try {
        if (sealed.startsWith("plain:")) return sealed.slice("plain:".length)
        if (!sealed.startsWith("sealed:")) return null
        return safeStorage.decryptString(
          Buffer.from(sealed.slice("sealed:".length), "base64")
        )
      } catch {
        return null
      }
    },
    quitAndRun(task) {
      quitTask = { run: task, atSessionEnd: true }
      app.quit()
    },
    setQuitTask(task) {
      quitTask = task ? { run: task, atSessionEnd: false } : null
    },
    version: app.getVersion(),
    packaged: app.isPackaged,
    installerScript: installerScript(),
    bundledPluginsDir: bundledPluginsDir(),
    appShare: electronShare,
  }

  const ipc = createIpc(host)
  for (const [channel, handler] of ipc.handlers) {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      handler(event, ...args)
    )
  }

  return ipc
}
