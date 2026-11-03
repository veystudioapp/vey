import type { CookieSite } from "../shared/browser"
import type { ImportedCookie } from "./browser-cookies"
import type { BrowserPage } from "./browser-hub"

/**
 * Everything `ipc.ts` needs from Electron itself — a native dialog, a window to
 * pin, a badge on the dock icon — and nothing that reads or writes the
 * workspace. `electron-ipc.ts` implements it.
 *
 * Free of `electron`, like the rest of what `ipc.ts` imports, so the tests can
 * import the handlers without it.
 */
export type Host = {
  /** A push event, to every window at once — see
   * `send` in `ipc.ts` for why it is everyone rather than the caller. */
  send: (channel: string, payload: unknown) => void

  /** A native folder picker — titled for adding a project unless told
   * otherwise. */
  pickDirectory: (options?: {
    title: string
    buttonLabel: string
  }) => Promise<string | null>
  /** A native save panel asking for a folder that does not exist yet: where
   * it goes and what it is called. The path, not created; null when
   * cancelled. */
  pickNewDirectory: (options: {
    title: string
    buttonLabel: string
  }) => Promise<string | null>
  /** A native file picker. Empty when cancelled. */
  pickFiles: (options: {
    title: string
    directory?: string
    /** One file rather than several. */
    single?: boolean
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<string[]>
  /** Asks where to put a text file and writes it; null when cancelled.
   * `caller` is whatever the transport identifies a window by. */
  saveTextFile: (
    caller: unknown,
    input: {
      defaultName: string
      text: string
      filters?: { name: string; extensions: string[] }[]
    }
  ) => Promise<string | null>
  /** The system clipboard's picture as PNG bytes, or null for none. */
  clipboardImage: () => Promise<Uint8Array | null>

  /** The OS trash rather than `unlink` — see `trashPath` in `ipc.ts`. */
  trash: (target: string) => Promise<void>
  /** Shows a path in the OS file manager. */
  reveal: (target: string) => Promise<void>
  /** Hands a path to the OS as a drag out of the calling window, so it can be
   * dropped into Finder, Slack, a mail — anywhere that takes a file. */
  startDrag: (caller: unknown, target: string) => Promise<void>

  /** Whether somebody is looking at one of this app's windows right now — the
   * check a notification is skipped on. */
  focused: () => boolean
  /** Rings an OS notification whose click leads back to `chatId`. */
  notify: (notice: { title: string; body: string; chatId: string }) => void

  openChatWindow: (chatId: string) => void
  setAlwaysOnTop: (caller: unknown, on: boolean) => void
  isAlwaysOnTop: (caller: unknown) => boolean

  /** A `<webview>` the calling window owns, as a page the browser tools can
   * drive — null for an id that is not one of its guests. See
   * `main/electron-browser.ts`. */
  browserPage: (caller: unknown, webContentsId: number) => BrowserPage | null
  /** The chat browser's own cookies, by site, and their removal — see
   * `clearBrowserCookies` in `electron-browser.ts`. Null is every site. */
  browserCookieSites: () => Promise<CookieSite[]>
  clearBrowserCookies: (sites: string[] | null) => Promise<number>
  /** An app's icon as a PNG data URL — a browser's, in the cookie dialog —
   * or null where there is none to get. */
  appIcon: (appPath: string) => Promise<string | null>
  /** Cookies into the chat browser's profile, one at a time — see
   * `setBrowserCookies` in `electron-browser.ts`. */
  setBrowserCookies: (
    cookies: ImportedCookie[]
  ) => Promise<{ set: number; failed: number }>

  /** Opens a URL in the user's browser. Only for a URL this app built itself —
   * the free AI server's sign-in page — since the caller is not reviewing it. */
  openExternal: (url: string) => void

  /**
   * `fetch` through Chromium's network stack (`net.fetch`) rather than Node's:
   * the system proxy, a VPN's routes and the OS's certificates, exactly as the
   * browser that just signed in reaches the same server. Node's `fetch` honours
   * none of them, so behind a proxy the sign-in page answered and main never
   * heard.
   */
  fetch: (url: string, init?: RequestInit) => Promise<Response>

  /** A secret as text that is safe to write to disk — Electron's
   * `safeStorage`, the OS keychain's key — and back. `unseal` answers null
   * for what it cannot read: another machine's, or a keychain reset. */
  seal: (text: string) => string
  unseal: (sealed: string) => string | null

  /** The number on the app's own icon — the dock's red badge on macOS, the
   * launcher's count on Linux. Zero clears it. */
  setBadgeCount: (count: number) => void

  /** Quits the app the ordinary way, `before-quit` and all, and calls `task`
   * once that cleanup is done — the Windows update's installer. */
  quitAndRun: (task: () => void) => void
  /**
   * What to call once the app has quit, whenever and however it is quit — a
   * staged update's installer — or null for nothing. Called at `will-quit` and
   * must be synchronous; skipped when the quit is the OS logging off or
   * shutting down, which would cut an installer off halfway.
   */
  setQuitTask: (task: (() => void) | null) => void

  /** This build's version, for the update check. */
  version: string
  /** A packaged build rather than `bun run dev`. Only a packaged one installs
   * an update unasked: a dev run would otherwise replace the installed app with
   * the latest release every time it was closed. */
  packaged: boolean
  /** `install.sh`, or null where this host cannot run it — see
   * `installUpdate` in `ipc.ts`. */
  installerScript: string | null
  /** The built-in plugins this build carries, or null for none — see
   * `main/plugins.ts`. */
  bundledPluginsDir: string | null

  /** This app's own share of the machine, for `systemUsage`: every process
   * Chromium runs, added up. */
  appShare: (cores: number) => {
    appCpuPercent: number
    appCoreCpuPercent: number
    appMemory: number
    appProcesses: number
  }
}
