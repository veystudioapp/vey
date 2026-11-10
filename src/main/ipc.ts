import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

import {
  IPC,
  TELEMETRY_KEY,
  type ChatImage,
  type ChatPlace,
  type ChatSeed,
  type ClaudeApiProfileInput,
  type ClaudeLoginRequest,
  type ClaudeProfile,
  type FileDiff,
  type FileIndexEntry,
  type ReplaceResult,
  type SearchFilter,
  type SearchOptions,
  type WorkspaceSearch,
  type ChatAnswer,
  type ChatOptions,
  type GitCompareAgainst,
} from "../shared/api"
import type { PluginFile, PluginSource } from "../shared/plugins"
import { pathFilterOf } from "../shared/search"
import { agentCommands } from "./agent-commands"
import { agentModels } from "./agent-models"
import { claudeAccount } from "./claude-auth"
import {
  apiEnv,
  apiTokenKey,
  isApiDir,
  setApiEnvs,
  validBaseUrl,
} from "./claude-api"
import { claudeVersions } from "./claude-version"
import { claudeBinary } from "./claude-bin"
import { openInVscode } from "./vscode"
import { dataDir, migrateChatFiles, migrateLegacyDataDir } from "./data-dir"
import {
  BROWSER_SERVER,
  type CookieImport,
  type CookieSource,
} from "../shared/browser"
import { cookiesIn, MAX_COOKIE_FILE_BYTES, keptAs } from "./browser-cookies"
import { cookieSites, cookieSources, sourceCookies } from "./browser-import"
import { BrowserHub, browserServer } from "./browser-hub"
import { Chats } from "./chat"
import { checkKey, restSource } from "./clickup"
import { ClickupInbox } from "./clickup-inbox"
import {
  CANCELLED,
  ClickupMcp,
  grantOf,
  mcpSource,
  signIn,
  type McpGrant,
} from "./clickup-mcp"
import { findFavicon, MAX_FAVICON_BYTES } from "./favicon"
import { serverUrl } from "./studio-server"
import * as files from "./files"
import { MAX_INDEXED_FILES } from "./files"
import {
  matcherOf,
  MAX_SEARCH_MATCHES,
  replaceInFile,
  searchFiles,
} from "./content-search"
import {
  changes,
  log,
  logScopeOf,
  commit,
  commitFileDiff,
  commitFiles,
  currentBranch,
  checkoutDetached,
  cherryPick,
  commitMessage,
  compareBase,
  createBranch,
  createTag,
  discard,
  discardAll,
  blame,
  fileAtHead,
  fileBytesAtHead,
  fileDiff,
  lineHistory,
  push,
  stage,
  unstage,
  upstream,
  workingTree,
} from "./git"
import { ChatNotices, noticeText, type ChatNotice } from "./notify"
import { installedMcpServers, removeMcpServer } from "./mcp-servers"
import { planUsage } from "./plan-usage"
import {
  installedPluginDir,
  installPlugin,
  readPluginFolder,
  readPluginZip,
  type PluginFiles,
} from "./plugin-install"
import {
  listAllPlugins,
  pluginFilePath,
  pluginRootOf,
  readPluginData,
  writePluginData,
} from "./plugins"
import { draftCommitMessage } from "./one-turn-agent"
import type { Host } from "./host"
import { expandHome, quote, spawnEnvironment } from "./shell-env"
import { systemUsage } from "./system-usage"
import { listeningPorts, stopListener } from "./ports"
import { startTelemetry, type Telemetry } from "./telemetry"
import { PLUGIN_DATA_DIR, PLUGINS_DIR, Store, WORKSPACE_DIR } from "./store"
import { installedShells } from "./shells"
import { TerminalManager } from "./terminal"
import { TsServers } from "./tsserver"
import {
  checkForUpdate,
  downloadUpdate,
  releaseFeedUrl,
  releaseNotes,
  startWindowsInstaller,
} from "./updater"
import { DirectoryWatchers, RootWatchers } from "./watch"
import {
  addWorktree,
  branchesOf,
  removeWorktree,
  worktreeDir,
} from "./worktrees"

/** The settings key the sealed ClickUp personal key is kept under. Not the
 * deleted watcher's `clickup.token`, which was sealed in another shape. */
const CLICKUP_KEY = "clickup.inboxToken"
/** The sign-in to ClickUp's MCP server (`main/clickup-mcp.ts`), sealed as
 * JSON. One of it and `CLICKUP_KEY` at a time — saving either empties the
 * other, so which one the inbox reads through is never a guess. */
const CLICKUP_GRANT = "clickup.mcpGrant"

/** What `imageDataUrl` recognises as a picture. */
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
}

/** A thumbnail is all this is for — never worth holding a huge image whole
 * in memory just to preview it. */
const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024

/** The most commits one `git:log` call answers with — see that handler. The
 * `Commits` view re-reads everything it has shown on every commit, in one call,
 * so this is also how far it can be paged before a re-read stops covering it. */
const MAX_LOG_PAGE = 1000

/** `claude auth login`'s account kinds — the request names one, and anything
 * else from the renderer is the default rather than a word on a command line. */
const LOGIN_METHODS: ClaudeLoginRequest["method"][] = [
  "claudeai",
  "console",
  "sso",
]

/**
 * An image on disk as a data URL.
 *
 * Shared by the two handlers that need one — an image file in the workspace
 * and a picture next to a document — so that "too large" and "which types are
 * pictures" are answered once. The renderer's origin is not `file://` and
 * Chromium will not load a `file://` subresource from any other origin, which
 * is why either of them needs bytes rather than a path.
 */
async function imageDataUrl(filePath: string): Promise<string> {
  const stats = await stat(filePath)
  if (stats.size > MAX_IMAGE_PREVIEW_BYTES) {
    const megabytes = (stats.size / (1024 * 1024)).toFixed(1)
    throw new Error(
      `${path.basename(filePath)} is too large to preview (${megabytes} MB).`
    )
  }
  const mime = IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()]
  const data = await readFile(filePath)
  return `data:${mime ?? "application/octet-stream"};base64,${data.toString("base64")}`
}

/**
 * The clipboard's image spilled to a file, so a terminal can paste a path.
 *
 * `tmpdir()` rather than anywhere under `~/.veystudio`: this is a scratch copy of
 * something the user still holds in their clipboard, the OS already knows to
 * clean the directory out, and it is where the system terminals put the same
 * file — the `/var/folders/…` path a pasted screenshot turns into there.
 *
 * PNG whatever came in, because that is the one encoding `NativeImage` can be
 * asked for without knowing what the clipboard's own format was.
 */
async function clipboardImagePath(
  png: Uint8Array | null
): Promise<string | null> {
  if (!png || png.length === 0) return null

  const file = path.join(tmpdir(), `veystudio-paste-${Date.now()}.png`)
  await writeFile(file, png)
  return file
}

/** One handler: the caller first (an Electron `IpcMainInvokeEvent`, or
 * nothing from a test), then the call's arguments as the renderer passed
 * them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (caller: unknown, ...args: any[]) => unknown

/**
 * Every renderer-callable method, as one table keyed by `IPC` channel.
 *
 * Built once for the whole app rather than per window; `electron-ipc.ts` puts
 * each entry on `ipcMain`. What needs Electron itself — a dialog, a window, the
 * menu bar — comes in through `host` and is nowhere else in this file, which is
 * what lets the tests import it without Electron.
 */
export function createIpc(host: Host): {
  handlers: Map<string, Handler>
  /** Exposed so a turn in flight can be killed on quit. */
  allChats: Chats
  terminals: TerminalManager
  tsServers: TsServers
  /** Both kinds of `fs.watch` — the tree's and the `Changes` list's. */
  watchers: { closeAll: () => void }
  noteFilePath: (fileName: string) => string
  pluginFilePath: (id: string, file: PluginFile) => string
  /** Flushed on quit, so the last minutes before it are counted. */
  telemetry: Telemetry
} {
  // Before anything reads the tree: the store, the daemon's socket, the logs.
  migrateLegacyDataDir()
  migrateChatFiles()
  const store = new Store()
  const telemetry = startTelemetry({
    version: host.version,
    packaged: host.packaged,
    serverUrl: serverUrl(),
    focused: host.focused,
    fetch: host.fetch,
    getSetting: (key) => store.getSetting(key),
    setSetting: (key, value) => store.setSetting(key, value),
    enabled: async () => (await store.getSetting(TELEMETRY_KEY)) !== "off",
  })

  /** The stored profiles, for `Chats` — which resolves a chat's `profileId`
   * to a directory through this list, and looks for a session's transcript in
   * every directory on it. */
  const chatProfiles = (): Promise<ClaudeProfile[]> => listProfiles()

  /**
   * The profiles, with every custom API profile's endpoint handed to
   * `claude-api.ts` on the way — so whatever reads the list before starting a
   * `claude` starts it on the endpoint as it now stands. A key the keychain
   * can no longer open holds nothing, and its row says why
   * (`IPC.claudeAccount`).
   */
  const listProfiles = async (): Promise<ClaudeProfile[]> => {
    const profiles = await store.listClaudeProfiles()
    const envs = new Map<string, Record<string, string>>()
    for (const profile of profiles) {
      if (!profile.api) continue
      const sealed = await store.getSetting(apiTokenKey(profile.id))
      const token = sealed ? host.unseal(sealed) : null
      if (token)
        envs.set(expandHome(profile.configDir), apiEnv(profile.api, token))
    }
    setApiEnvs(envs)
    return profiles
  }

  const handlers = new Map<string, Handler>()
  const handle = (channel: string, handler: Handler): void => {
    handlers.set(channel, handler)
  }

  /*
   * Every window, not only the studio's: a chat popped out into a window of
   * its own is the same conversation and has to see the same lines. A window
   * that holds no terminal ignores a `terminal:data` it is sent, which is
   * cheaper than a table of who wants what.
   */
  const send = host.send

  const terminals = new TerminalManager({
    data: (event) => send(IPC.terminalData, event),
    exit: (event) => send(IPC.terminalExit, event),
  })

  /** Each chat's browser page, for the tools its session is given — see
   * `main/browser-hub.ts`. */
  const browsers = new BrowserHub(
    (command) => send(IPC.browserCommand, command),
    (activity) => send(IPC.browserActivity, activity)
  )

  /**
   * A picked `profileId` as a `CLAUDE_CONFIG_DIR`, for a one-turn agent.
   *
   * The same resolve `chat.ts` does at send time (`profileConfigDir`
   * there), asked here instead because a drafted message has no chat and no
   * `Chats` record to resolve it on. Looked up by id
   * rather than trusted from the renderer, same reason: a profile can be
   * renamed or deleted between the picker being drawn and the button being
   * pressed.
   */
  const configDirOf = async (
    profileId: string | null
  ): Promise<string | null> => {
    if (!profileId) return null
    const profile = (await listProfiles()).find(
      (entry) => entry.id === profileId
    )
    return profile ? expandHome(profile.configDir) : null
  }

  /*
   * A project's chats: one agent turn at a time, in that project's directory.
   *
   * The larger of the two `claude`s this app spawns, and the only one that is a
   * conversation. What the old "no second one" rule was about is still refused —
   * a feature calling the CLI as a helper, an AI filter or an import button —
   * because a helper turn is a turn nobody asked for. `draftCommitMessage`
   * below is the turn beside these, and is not one of those: it is a button
   * pressed by the person who reads its answer. See the top of
   * `one-turn-agent.ts`.
   */
  const allChats = new Chats(
    {
      // Null rather than a throw for a folder that has left the workspace: the
      // caller turns "nowhere to run" into a line in the chat, and one path
      // through that is easier to be sure of than two.
      folderDir: (folderId) =>
        store.resolveFolderDir(folderId).catch(() => null),
      // Asked per turn rather than held — Settings can add, rename or delete a
      // profile between two messages in the same chat.
      claudeProfiles: chatProfiles,
      chats: () => store.listChats(),
      saveChats: (chats) => store.saveChats(chats),
      readChat: (id) => store.readChat(id),
      writeChat: (id, messages) => store.writeChat(id, messages),
      deleteChat: (id) => store.deleteChat(id),
      writeImage: (fileName, bytes) => store.writeNoteFile(fileName, bytes),
      readImage: (fileName) => store.readNoteFile(fileName),
      // A server instance per session rather than one shared: the chat is the
      // closure, so a call can only reach the page beside its own chat.
      mcpServers: (chatId) => ({
        [BROWSER_SERVER]: browserServer(browsers, chatId),
      }),
    },
    (event) => {
      send(IPC.chatEvent, event)
      const notice = notices.read(event)
      void announce(notice)
      holdAwake()
    }
  )

  const notices = new ChatNotices()

  /*
   * The machine stays up while any chat is working. Asked of the live sessions
   * on every event rather than tracked off `busy` events alone: a session that
   * dies, or a chat deleted or edited mid-turn, leaves the map without ever
   * saying `busy: false`, and a missed `false` here is a Mac that never sleeps.
   */
  const holdAwake = (): void => {
    host.keepAwake(allChats.busy().length > 0)
  }

  /**
   * Rings the OS notification a chat's event turned out to deserve.
   *
   * **Only while the studio window is unfocused**, which is the whole point of
   * the feature rather than a courtesy: several chats answering at once is what
   * this app is for, and the cost of that is walking away from a window with
   * three turns running in it. Somebody looking at the window can see the row
   * spinning, and a banner over the composer they are typing into is noise.
   *
   * The title is read out of the listing at the moment the notice is due rather
   * than tracked alongside it: a chat is named by its first message and renamed
   * by `retitle` partway through that same turn, so a name captured when the
   * turn started is the wrong one exactly on the turn somebody is least likely
   * to recognise by id.
   */
  const announce = async (notice: ChatNotice | null): Promise<void> => {
    if (!notice) return
    // Any window of this app's, not only the studio's: a chat popped out into
    // its own window and being read there is one nobody needs calling back to.
    if (host.focused()) return

    const chats = await allChats.list()
    const chat = chats.find((entry) => entry.id === notice.chatId)
    // A chat with no row is one the `+` opened and nobody has spoken into, so
    // there is nothing to call it and nothing to call somebody back to.
    if (!chat) return

    // Clicking it is the way back to the chat it is about — a notification that
    // only tells you something happened leaves you hunting for the row.
    host.notify({ ...noticeText(notice, chat.title), chatId: notice.chatId })
  }

  // Asked of the user's own `claude` and held for the run — see
  // `agent-models.ts`. Not a handler that touches any of the managers above,
  // which is why it takes no argument and keeps no state here.
  // The profile resolved here rather than a path trusted from the renderer —
  // the same `configDirOf` the plan usage goes through.
  handle(
    IPC.agentModels,
    async (_event, profileId: string | null, fresh?: boolean) =>
      agentModels(await configDirOf(profileId ?? null), fresh === true)
  )

  /*
   * The slash commands that `claude` has, asked in a project's directory — see
   * `agent-commands.ts`. The directory is resolved here for the reason every
   * other `folderId` call resolves it here: a project is an id in the manifest,
   * and the path behind it is the store's to say.
   */
  handle(IPC.agentCommands, async (_event, folderId: unknown) =>
    agentCommands(await folderDirOf(folderId))
  )

  /*
   * The MCP servers that same `claude` has, asked in a project's directory —
   * see `mcp-servers.ts`.
   *
   * The directory is resolved here rather than in the renderer for the reason
   * every other `folderId` call is: a project is an id in the manifest, and the
   * path behind it is the store's to say. A project that has left the workspace
   * reads as null, which asks in the user's home directory — the user-scope
   * servers and nothing repository-specific, which is the honest answer for a
   * project that is no longer there.
   */
  handle(IPC.installedMcpServers, async (_event, folderId: unknown) =>
    installedMcpServers(await folderDirOf(folderId))
  )

  // The profile resolved here rather than a path trusted from the renderer —
  // the same `configDirOf` the commit draft goes through.
  handle(
    IPC.planUsage,
    async (_event, profileId: string | null, fresh: boolean) => {
      const dir = await configDirOf(profileId)
      // An endpoint that is not Anthropic's has no plan windows to read.
      if (isApiDir(dir)) {
        return {
          available: false,
          subscription: null,
          windows: [],
          error: null,
          at: new Date().toISOString(),
        }
      }
      return planUsage(dir, fresh === true)
    }
  )

  // The CLI's own `mcp remove`, in the same directory the listing was asked in —
  // a `project`-scope server is in that repository's file and nowhere else. The
  // renderer confirms first and re-asks for the listing afterwards; this only
  // does it, and lets the CLI's own error through.
  handle(
    IPC.removeMcpServer,
    async (
      _event,
      input: { name: string; scope: string | null; folderId: string | null }
    ) =>
      removeMcpServer({
        name: input.name,
        scope: input.scope,
        cwd: await folderDirOf(input.folderId),
      })
  )

  /** A project's directory, or null for one that has left the workspace —
   * shared by the two MCP handlers above, which both run `claude` somewhere. */
  async function folderDirOf(folderId: unknown): Promise<string | null> {
    return typeof folderId === "string"
      ? await store.resolveFolderDir(folderId).catch(() => null)
      : null
  }

  handle(IPC.listClaudeProfiles, () => listProfiles())

  handle(IPC.saveClaudeProfiles, (_event, profiles: ClaudeProfile[]) =>
    // `~` expanded here, like `addFolder`'s path field: the SDK spawns
    // `claude` directly rather than through a shell, so nothing else would
    // ever turn a `~/.claude-group/hung` into an absolute path before it
    // became `CLAUDE_CONFIG_DIR` — and a literal `~` in that variable is a
    // directory named `~` relative to the turn's cwd, not the user's home.
    // Nothing types one any more (the store names the directory itself), but
    // the profiles that field wrote are on people's disks.
    saveProfiles(
      profiles.map((profile) => ({
        ...profile,
        configDir: expandHome(profile.configDir),
      }))
    )
  )

  /** Writes the list, drops the keys of profiles no longer on it, and
   * re-reads the endpoints. */
  const saveProfiles = async (
    profiles: ClaudeProfile[]
  ): Promise<ClaudeProfile[]> => {
    const before = await store.listClaudeProfiles()
    const saved = await store.saveClaudeProfiles(profiles)
    for (const gone of before) {
      if (gone.api && !saved.some((profile) => profile.id === gone.id)) {
        await store.setSetting(apiTokenKey(gone.id), "")
      }
    }
    return listProfiles()
  }

  handle(
    IPC.saveClaudeApiProfile,
    async (_event, input: ClaudeApiProfileInput) => {
      if (!validBaseUrl(input.api.baseUrl)) {
        throw new Error(
          "The base URL must be https:// (or http:// to this machine)."
        )
      }
      const profiles = await store.listClaudeProfiles()
      const existing = profiles.find((profile) => profile.id === input.id)
      if (input.token !== null && input.token.trim()) {
        await store.setSetting(
          apiTokenKey(input.id),
          host.seal(input.token.trim())
        )
      } else if (!existing) {
        throw new Error("A custom API needs its key.")
      }
      const profile: ClaudeProfile = {
        id: input.id,
        name: input.name.trim() || existing?.name || "API",
        configDir: existing?.configDir ?? "",
        api: {
          baseUrl: input.api.baseUrl.trim().replace(/\/+$/, ""),
          model: input.api.model.trim(),
          fastModel: input.api.fastModel.trim(),
        },
      }
      return saveProfiles(
        existing
          ? profiles.map((entry) => (entry.id === input.id ? profile : entry))
          : [...profiles, profile]
      )
    }
  )

  // A custom API profile has no login to ask `claude` about: it is working if
  // its endpoint is held (`listProfiles`), and otherwise says why not.
  handle(IPC.claudeAccount, async (_event, configDir: string) => {
    const dir = configDir.trim() ? expandHome(configDir.trim()) : ""
    const profile = dir
      ? (await listProfiles()).find(
          (entry) => entry.api && expandHome(entry.configDir) === dir
        )
      : undefined
    if (!profile?.api) return claudeAccount(configDir)
    const blank = {
      configDir: dir,
      email: null,
      organization: hostOf(profile.api.baseUrl),
      method: "custom_api",
      plan: null,
      error: null,
    }
    if (isApiDir(dir)) return { ...blank, state: "signedIn" as const }
    return {
      ...blank,
      state: "error" as const,
      error: "The key for this endpoint could not be read. Enter it again.",
    }
  })

  handle(IPC.claudeVersions, () => claudeVersions())

  /** The directories handed to a new profile's login this run. */
  const loginDirs = new Set<string>()

  /**
   * `claude auth login` for one profile's directory, in a pty of its own.
   *
   * The one place this app runs a `claude` the user could not have run
   * themselves in a shell — and it runs exactly that, through the same login
   * shell every other pty is started in, so a CLI installed by an alias or a
   * shell function is found the way `locate` finds one.
   */
  handle(
    IPC.claudeLogin,
    async (_event, request: ClaudeLoginRequest, cols: number, rows: number) => {
      const dir =
        request.configDir === null
          ? await store.newClaudeProfileDir(request.name, [...loginDirs])
          : request.configDir.trim()
            ? expandHome(request.configDir.trim())
            : ""
      // Two profiles added at once are both unsaved while they sign in, so the
      // store's list cannot keep them off each other's directory; this can.
      if (request.configDir === null) loginDirs.add(dir)

      // Made here rather than left to the CLI, which is the opposite of what
      // `claudeAccount` does with the same path: that one probes something
      // somebody may still be typing, and a directory conjured out of a typo is
      // the failure it is written against. This is a directory somebody asked
      // for by name, so the only thing the pty can then fail at is the login.
      if (dir) await mkdir(dir, { recursive: true })

      const binary = claudeBinary()
      // Quoted only when it is a path: `CLAUDE_BIN` can name a file with a
      // space in it, while a bare `claude` is often an alias or a shell
      // function, and quoting one stops the shell expanding it at all.
      // The flag answers the CLI's first question, which was asked with the
      // arrow keys — the step that made the login a terminal at all.
      const method = LOGIN_METHODS.includes(request.method)
        ? request.method
        : "claudeai"
      const command = `${binary.includes("/") ? quote(binary) : binary} auth login --${method}`

      const terminalId = await terminals.create(
        {
          // The user's home rather than a project, for `claudeAccount`'s
          // reason: a login is about the config directory, and a repository's
          // own settings have no say in whose account it holds.
          cwd: homedir(),
          // On the command line as well as in the environment, because the pty
          // is a *login* shell: somebody already running several identities is
          // exactly the person whose own `.zshrc` exports `CLAUDE_CONFIG_DIR`,
          // and that export runs after this env is handed over — it would win,
          // and sign the wrong directory in. Windows has no `VAR=value cmd`
          // form (PowerShell and cmd both read it as a command name), so there
          // the env above is the only route.
          command:
            dir && process.platform !== "win32"
              ? `CLAUDE_CONFIG_DIR=${quote(dir)} ${command}`
              : command,
          env: dir ? { CLAUDE_CONFIG_DIR: dir } : {},
        },
        cols,
        rows
      )
      return { terminalId, configDir: dir }
    }
  )

  handle(IPC.listChats, () => allChats.list())
  handle(IPC.busyChats, () => allChats.busy())

  handle(IPC.createChat, (_event, place: ChatPlace, seed?: ChatSeed) =>
    allChats.create(place, seed)
  )

  handle(IPC.readChat, (_event, id: string) => allChats.read(id))

  handle(IPC.chatSpend, () => allChats.spend())

  /*
   * A file the user names, which is the one write allowed outside the
   * workspace's roots: the save dialog is the gate, the way the open dialog is
   * for `addFolder`. Nothing is written when it is cancelled.
   */
  handle(
    IPC.saveTextFile,
    (
      caller,
      input: {
        defaultName: string
        text: string
        filters?: { name: string; extensions: string[] }[]
      }
    ): Promise<string | null> => host.saveTextFile(caller, input)
  )

  handle(IPC.openChatWindow, (_event, chatId: string) => {
    host.openChatWindow(chatId)
  })

  // On the *calling* window: the studio has no reason to pin itself, and a
  // popped-out chat is the one that wants to stay over another editor.
  handle(IPC.setAlwaysOnTop, (caller, on: boolean) => {
    host.setAlwaysOnTop(caller, on)
  })

  handle(IPC.isAlwaysOnTop, (caller) => host.isAlwaysOnTop(caller))

  handle(IPC.setBadgeCount, (_event, count: number) => {
    host.setBadgeCount(count)
  })

  // A chat's browser tab saying it has a page, and that it is going. The
  // page is looked up by the caller rather than trusted by id: only a
  // `<webview>` of the window asking may be handed to a chat's tools.
  handle(
    IPC.browserAttach,
    (caller, chatId: unknown, tabId: unknown, webContentsId: unknown) => {
      if (
        typeof chatId !== "string" ||
        typeof tabId !== "string" ||
        typeof webContentsId !== "number"
      ) {
        return false
      }
      const page = host.browserPage(caller, webContentsId)
      if (!page) return false
      browsers.attach(chatId, tabId, page)
      return true
    }
  )
  handle(
    IPC.browserDetach,
    (_event, chatId: unknown, tabId: unknown, webContentsId: unknown) => {
      if (
        typeof chatId !== "string" ||
        typeof tabId !== "string" ||
        typeof webContentsId !== "number"
      ) {
        return
      }
      browsers.detach(chatId, tabId, webContentsId)
    }
  )
  handle(IPC.browserFocus, (_event, chatId: unknown, tabId: unknown) => {
    if (typeof chatId !== "string" || typeof tabId !== "string") return
    browsers.focus(chatId, tabId)
  })

  // The annotation toolbar's two reads of a tab: what it shows, and what is
  // under the pointer.
  handle(
    IPC.browserCapture,
    async (_event, chatId: unknown, tabId: unknown) => {
      const page = browsers.page(String(chatId), String(tabId))
      return page ? page.capture().catch(() => null) : null
    }
  )
  handle(
    IPC.browserInspect,
    async (_event, chatId: unknown, tabId: unknown, x: unknown, y: unknown) => {
      const page = browsers.page(String(chatId), String(tabId))
      if (!page || typeof x !== "number" || typeof y !== "number") return null
      return page.inspect(x, y).catch(() => null)
    }
  )

  // The picker and the read here, not in the renderer: the file is the
  // user's, and what reaches Chromium is only what `cookiesIn` made of it.
  handle(
    IPC.browserImportCookies,
    async (_event, keep: unknown): Promise<CookieImport> => {
      const [file] = await host.pickFiles({
        title: "Import cookies",
        single: true,
        filters: [{ name: "Cookies", extensions: ["json", "txt"] }],
      })
      if (!file)
        return { imported: 0, skipped: 0, error: null, cancelled: true }
      try {
        if ((await stat(file)).size > MAX_COOKIE_FILE_BYTES) {
          throw new Error("That file is too large to be a cookie export.")
        }
        const { cookies, expired, skipped } = cookiesIn(
          await readFile(file, "utf8")
        )
        const { set, failed } = await host.setBrowserCookies(
          keptAs(cookies, keep !== false)
        )
        return {
          imported: set,
          expired,
          skipped: skipped + failed,
          error: null,
        }
      } catch (error) {
        return { imported: 0, skipped: 0, error: messageOf(error) }
      }
    }
  )

  // The chat browser's own cookies — `Clear cookies…`.
  handle(IPC.browserOwnCookieSites, () =>
    host.browserCookieSites().catch(() => [])
  )
  // Every site only when asked for by name — `null` — so a malformed call
  // clears nothing rather than everything.
  handle(IPC.browserClearCookies, (_event, sites: unknown) =>
    host.clearBrowserCookies(
      sites === null
        ? null
        : Array.isArray(sites)
          ? sites.filter((site): site is string => typeof site === "string")
          : []
    )
  )

  // Straight out of a browser on this machine — `main/browser-import.ts`.
  handle(IPC.browserCookieSources, async (): Promise<CookieSource[]> => {
    const sources = await cookieSources(homedir()).catch(() => [])
    return Promise.all(
      sources.map(async (source) => ({
        ...source,
        icon: source.app ? await host.appIcon(source.app) : null,
      }))
    )
  })
  handle(IPC.browserCookieSites, async (_event, sourceId: unknown) => {
    try {
      return {
        sites: await cookieSites(homedir(), String(sourceId)),
        error: null,
      }
    } catch (error) {
      return { sites: [], error: messageOf(error) }
    }
  })
  handle(
    IPC.browserImportFrom,
    async (
      _event,
      sourceId: unknown,
      sites: unknown,
      keep: unknown
    ): Promise<CookieImport> => {
      if (!Array.isArray(sites)) {
        return { imported: 0, skipped: 0, error: "No sites picked." }
      }
      try {
        const { cookies, expired, skipped } = await sourceCookies(
          homedir(),
          String(sourceId),
          sites.filter((site): site is string => typeof site === "string")
        )
        const { set, failed } = await host.setBrowserCookies(
          keptAs(cookies, keep !== false)
        )
        return {
          imported: set,
          expired,
          skipped: skipped + failed,
          error: null,
        }
      } catch (error) {
        return { imported: 0, skipped: 0, error: messageOf(error) }
      }
    }
  )

  /*
   * The left column's Search. `searching` is the generation: each call takes
   * the next one, and an older call still walking sees it has moved and stops,
   * so typing a word is one search finishing rather than one per letter.
   *
   * Chats before files, because they are the cheaper read and the rows that
   * this app alone can answer — an editor's search already finds the files.
   */
  let searching = 0
  handle(
    IPC.searchWorkspace,
    async (
      _event,
      query: string,
      options: SearchOptions,
      filter: SearchFilter
    ): Promise<WorkspaceSearch> => {
      const generation = (searching += 1)
      const stale = () => generation !== searching
      const none: WorkspaceSearch = {
        files: [],
        chats: [],
        truncated: false,
        error: null,
      }

      const built = matcherOf(query, options)
      if (!built) return none
      if ("error" in built) return { ...none, error: built.error }

      const chats =
        filter.kinds === "files"
          ? { chats: [], matches: 0 }
          : await allChats.search(
              built.matcher,
              MAX_SEARCH_MATCHES,
              stale,
              filter.folderId
            )
      const roots = (await fileRoots()).filter(
        (root) => filter.folderId === null || root.folderId === filter.folderId
      )
      const found =
        filter.kinds === "chats"
          ? { files: [], matches: 0, truncated: false }
          : await searchFiles(roots, built.matcher, {
              limit: MAX_SEARCH_MATCHES - chats.matches,
              stale,
              accept: pathFilterOf(filter.include, filter.exclude),
            })
      return {
        files: found.files,
        chats: chats.chats,
        truncated: found.truncated || chats.matches >= MAX_SEARCH_MATCHES,
        error: null,
      }
    }
  )

  /*
   * Replace across the files a search showed. One at a time rather than all at
   * once: a few hundred files is still quick, and a failure halfway leaves a
   * clean line between what was written and what was not.
   */
  handle(
    IPC.replaceInFiles,
    async (
      _event,
      query: string,
      options: SearchOptions,
      replacement: string,
      paths: string[]
    ): Promise<ReplaceResult> => {
      const result: ReplaceResult = {
        replaced: 0,
        files: [],
        failed: [],
        error: null,
      }
      const built = matcherOf(query, options)
      if (!built) return result
      if ("error" in built) return { ...result, error: built.error }

      for (const filePath of new Set(paths)) {
        try {
          const count = await replaceInFile(
            await inWorkspace(filePath),
            built.matcher,
            replacement,
            options.regex
          )
          if (count === 0) continue
          result.replaced += count
          result.files.push(filePath)
        } catch (error) {
          result.failed.push({
            path: filePath,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return result
    }
  )

  handle(IPC.deleteChat, (_event, id: string) => {
    // Before the delete rather than after: a chat killed mid-turn emits no
    // `busy: false`, so the watcher would keep it as working for the rest of
    // the run and swallow the first quiet of whatever reused the id.
    notices.forget(id)
    const deleted = allChats.delete(id)
    // `delete` takes the session out of the map before its first await.
    holdAwake()
    return deleted
  })

  handle(IPC.clearChat, (_event, id: string) => allChats.clear(id))

  handle(IPC.renameChat, (_event, id: string, title: string) =>
    allChats.rename(id, title)
  )

  handle(IPC.setChatOptions, (_event, id: string, options: ChatOptions) =>
    allChats.setOptions(id, options)
  )

  handle(IPC.answerChatAsk, (_event, askId: string, answer: ChatAnswer) => {
    allChats.answer(askId, answer)
  })

  handle(
    IPC.sendChat,
    (_event, id: string, prompt: string, images?: ChatImage[]) =>
      allChats.send(id, prompt, images ?? [])
  )

  handle(
    IPC.editChat,
    async (
      _event,
      id: string,
      at: number,
      prompt: string,
      restore: boolean
    ) => {
      try {
        return await allChats.edit(id, at, prompt, restore === true)
      } finally {
        holdAwake()
      }
    }
  )

  handle(IPC.stopChat, (_event, id: string) => {
    allChats.stop(id)
  })

  handle(IPC.getWorkspace, () => store.getWorkspace())

  handle(IPC.pickDirectory, () => host.pickDirectory())

  /*
   * `New directory…` in Add a folder. Outside every root, like a chat's
   * export, and for the same reason it may be: a system panel named the
   * place. `recursive` off, so a name already taken is a refusal rather than
   * somebody's folder added as if it were new.
   */
  handle(IPC.createProjectDirectory, async () => {
    const target = await host.pickNewDirectory({
      title: "New directory",
      buttonLabel: "Create",
    })
    if (!target) return null
    try {
      await mkdir(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`${path.basename(target)} already exists there.`)
      }
      throw error
    }
    return target
  })

  handle(IPC.pickFiles, (_event, directory?: string) =>
    host.pickFiles({
      title: "Attach files",
      // Where it opens, not what it may return: the paths come back from the
      // user's own click, and reading one is still an ordinary `files:*` call
      // through `insideAny`.
      ...(directory ? { directory: expandHome(directory) } : {}),
    })
  )

  handle(IPC.clipboardImagePath, async () =>
    clipboardImagePath(await host.clipboardImage())
  )

  // The two fields by name rather than a spread: `store.addFolder` also takes
  // `worktreeOf`, the mark that licenses `removeWorktree`, and a spread would
  // let the renderer write it onto any folder — `~` included.
  handle(IPC.addFolder, (_event, input: { path: string; name: string }) =>
    store.addFolder({ path: expandHome(input.path), name: input.name })
  )

  /*
   * A second checkout of a project, filed inside it (`main/worktrees.ts`).
   * Asked of a checkout, it is cut from that checkout's project: a checkout of
   * a checkout is not a thing git makes, and one level is all the column
   * draws. Named after the branch alone, since it is only ever shown under its
   * project's name.
   */
  handle(
    IPC.addWorktree,
    async (
      _event,
      input: { folderId: string; branch: string; base?: string }
    ) => {
      const { folders } = await store.getWorkspace()
      const asked = folders.find((candidate) => candidate.id === input.folderId)
      if (!asked) throw new Error(`No such folder: ${input.folderId}`)
      const project =
        folders.find((candidate) => candidate.id === asked.worktreeOf) ?? asked
      const repo = await store.resolveFolderDir(project.id)
      const branch = input.branch.trim()

      const dir = worktreeDir(
        path.join(dataDir(), WORKSPACE_DIR),
        project.id,
        branch
      )
      if (await stat(dir).catch(() => null)) {
        throw new Error(`${dir} already exists.`)
      }
      await mkdir(path.dirname(dir), { recursive: true })

      const added = await addWorktree({ repo, dir, branch, base: input.base })
      if ("error" in added) throw new Error(added.error)
      return store.addFolder({
        path: dir,
        name: branch,
        worktreeOf: project.id,
      })
    }
  )

  handle(IPC.worktreeBranches, async (_event, folderId: string) =>
    branchesOf(await store.resolveFolderDir(folderId))
  )

  /*
   * What holds the checkout open lets go first, or Windows refuses to delete
   * it: the tsservers and watchers here (the renderer re-sends its watch list
   * when the folders change), the dock's shells in the renderer before it
   * asks. A pty's teardown is not instant, hence the retries. Asked of the checkout's own project when there still is one, since
   * that is the repository the worktree is registered in; git finds it from
   * the checkout itself otherwise.
   */
  handle(IPC.removeWorktree, async (_event, folderId: string) => {
    const { folders } = await store.getWorkspace()
    const folder = folders.find((candidate) => candidate.id === folderId)
    if (!folder) throw new Error(`No such folder: ${folderId}`)
    if (!folder.worktreeOf) {
      throw new Error("Only a worktree made from a project can be removed.")
    }
    const dir = await store.resolveFolderDir(folderId)
    const repo = folders.some((candidate) => candidate.id === folder.worktreeOf)
      ? await store.resolveFolderDir(folder.worktreeOf)
      : dir

    tsServers.stopUnder(dir)
    watchers.closeAll()
    for (let attempt = 0; ; attempt += 1) {
      const failed = await removeWorktree(repo, dir)
      if (!failed) break
      if (attempt >= 3) throw new Error(failed.error)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return store.removeFolder(folderId)
  })

  handle(IPC.renameFolder, (_event, id: string, name: string) =>
    store.renameFolder(id, name)
  )

  handle(IPC.removeFolder, (_event, id: string) => store.removeFolder(id))

  handle(IPC.reorderFolders, (_event, ids: string[]) =>
    store.reorderFolders(ids)
  )

  handle(IPC.gitBranch, async (_event, folderId: string) =>
    currentBranch(await store.resolveFolderDir(folderId))
  )

  handle(IPC.gitStatus, async (_event, folderId: string) =>
    workingTree(await store.resolveFolderDir(folderId))
  )

  handle(IPC.gitChanges, async (_event, folderId: string) =>
    changes(await store.resolveFolderDir(folderId))
  )

  // A page of history rather than all of it: a repository's whole log is tens
  // of thousands of rows. Clamped here, since the numbers are the renderer's
  // and a page of `Infinity` is the whole log by another name.
  handle(
    IPC.gitLog,
    async (
      _event,
      folderId: string,
      limit: number,
      skip = 0,
      query: unknown = "",
      scope: unknown = null
    ) =>
      log(
        await store.resolveFolderDir(folderId),
        Math.max(1, Math.min(MAX_LOG_PAGE, Math.floor(limit) || 1)),
        Math.max(0, Math.floor(skip) || 0),
        typeof query === "string" ? query : "",
        logScopeOf(scope)
      )
  )

  handle(IPC.gitUpstream, async (_event, folderId: string) =>
    upstream(await store.resolveFolderDir(folderId))
  )

  // Reads of the object store in the folder's own repository, so no path gate:
  // what is named is a commit and a path *in* it, never a file on disk, and
  // `git.ts` refuses a hash or a path that is anything else.
  handle(
    IPC.gitCommitFiles,
    async (_event, folderId: string, hash: string, base?: string) =>
      commitFiles(
        await store.resolveFolderDir(folderId),
        String(hash),
        typeof base === "string" ? base : undefined
      )
  )

  handle(
    IPC.gitCommitFileDiff,
    async (
      _event,
      folderId: string,
      hash: string,
      file: string,
      from?: string,
      base?: string
    ) =>
      commitFileDiff(
        await store.resolveFolderDir(folderId),
        String(hash),
        String(file),
        typeof from === "string" ? from : undefined,
        typeof base === "string" ? base : undefined
      )
  )

  handle(
    IPC.gitCompareBase,
    async (_event, folderId: string, hash: string, against: unknown) =>
      compareBase(
        await store.resolveFolderDir(folderId),
        String(hash),
        against as GitCompareAgainst
      )
  )

  handle(IPC.gitCommitMessage, async (_event, folderId: string, hash: string) =>
    commitMessage(await store.resolveFolderDir(folderId), String(hash))
  )

  // The Git Graph menu's writes. The folder is the workspace's own and the
  // commit a hash `git.ts` checks, so there is no path to gate; each answers
  // with git's words rather than throwing.
  handle(
    IPC.gitCheckoutDetached,
    async (_event, folderId: string, hash: string) =>
      checkoutDetached(await store.resolveFolderDir(folderId), String(hash))
  )

  handle(
    IPC.gitCreateBranch,
    async (
      _event,
      folderId: string,
      name: string,
      hash: string,
      checkout: boolean
    ) =>
      createBranch(
        await store.resolveFolderDir(folderId),
        String(name),
        String(hash),
        checkout === true
      )
  )

  handle(
    IPC.gitCreateTag,
    async (
      _event,
      folderId: string,
      name: string,
      hash: string,
      message: string
    ) =>
      createTag(
        await store.resolveFolderDir(folderId),
        String(name),
        String(hash),
        typeof message === "string" ? message : ""
      )
  )

  handle(IPC.gitCherryPick, async (_event, folderId: string, hash: string) =>
    cherryPick(await store.resolveFolderDir(folderId), String(hash))
  )

  /*
   * The Changes list's three writes.
   *
   * Two gates, not one, and neither is redundant. `inWorkspace` is the same
   * check the eight `files:*` handlers pass through — an absolute path from the
   * renderer can name anything on the machine — and `git.ts` then refuses
   * anything that is not under the folder it was handed, so a path inside
   * *another* of the workspace's folders cannot be staged into this one's
   * repository.
   *
   * What comes back from a discard is the paths git had nothing to restore —
   * new files — and those are trashed here rather than in `git.ts`, which stays
   * free of `electron` so the tests can import it.
   */
  handle(IPC.gitStage, async (_event, folderId: string, paths: string[]) =>
    stage(
      await store.resolveFolderDir(folderId),
      await Promise.all(paths.map(inWorkspace))
    )
  )

  handle(IPC.gitUnstage, async (_event, folderId: string, paths: string[]) =>
    unstage(
      await store.resolveFolderDir(folderId),
      await Promise.all(paths.map(inWorkspace))
    )
  )

  handle(IPC.gitDiscard, async (_event, folderId: string, paths: string[]) => {
    const trash = await discard(
      await store.resolveFolderDir(folderId),
      await Promise.all(paths.map(inWorkspace))
    )
    await trashAll(trash)
  })

  handle(IPC.gitDiscardAll, async (_event, folderId: string) => {
    await trashAll(await discardAll(await store.resolveFolderDir(folderId)))
  })

  /*
   * The staged work, committed — the fourth git write, and the argument for it
   * is on `commit` in `git.ts` and in `docs/design.md` § Committing.
   *
   * The message is not touched on the way through: it is whatever the box held,
   * and `commit` refuses an empty one. Git's own error comes back as the
   * rejection, hooks included — a `pre-commit` that refused has said something
   * worth reading, and a sentence of this app's own in front of it would hide
   * it.
   */
  handle(IPC.gitCommit, async (_event, folderId: string, message: string) =>
    commit(await store.resolveFolderDir(folderId), message)
  )

  /*
   * The branch pushed, never prompting — `push` in `git.ts` has why. The env
   * is the login shell's merged in, as a spawned `claude` gets: an ssh agent
   * exported in a profile is what lets a passphrase-protected key push here at
   * all.
   */
  handle(IPC.gitPush, async (_event, folderId: string) =>
    push(await store.resolveFolderDir(folderId), await spawnEnvironment())
  )

  /*
   * A commit message drafted from the staged diff by the read-only `claude`.
   *
   * Settings › Claude's three, `profileId` resolved through `configDirOf`.
   * Answers rather than throws: a draft that did not arrive leaves the box exactly as it was, which is a message somebody
   * types themselves.
   */
  /** The draft running per folder, so `Stop` has something to abort. */
  const drafts = new Map<string, AbortController>()
  handle(
    IPC.draftCommitMessage,
    async (
      _event,
      folderId: string,
      model: string | null,
      effort: string | null,
      profileId: string | null,
      rules: string | null
    ) => {
      // A second press for the same folder replaces the first rather than
      // running beside it: the box has one message to put an answer in.
      drafts.get(folderId)?.abort()

      const controller = new AbortController()
      drafts.set(folderId, controller)
      try {
        return await draftCommitMessage({
          cwd: await store.resolveFolderDir(folderId),
          model,
          effort,
          configDir: await configDirOf(profileId),
          rules,
          signal: controller.signal,
        })
      } finally {
        if (drafts.get(folderId) === controller) drafts.delete(folderId)
      }
    }
  )

  handle(IPC.cancelCommitDraft, (_event, folderId: string) => {
    drafts.get(folderId)?.abort()
  })

  /**
   * The new files a discard could not restore, moved to the trash.
   *
   * One at a time and each failure swallowed: the trash refuses on a
   * volume with no trash, and a discard that restored eleven files and then
   * threw on the twelfth would leave the list saying nothing about the ten it
   * did. The row that is still there afterwards is the report.
   */
  async function trashAll(paths: string[]): Promise<void> {
    for (const target of paths) {
      await host.trash(target).catch((error: unknown) => {
        console.error(`Could not trash ${target}`, error)
      })
    }
  }

  /**
   * The committed side of a diff, and git's own patch for it.
   *
   * Through the same gate as every other read of a file, and then run in the
   * root that holds it: `HEAD:` is a path in one repository, so the folder the
   * path lives under is the one to ask.
   *
   * The two run together rather than one after the other — they are two
   * independent `git` processes and the pane waits for both before it draws
   * anything, so serialising them would be a second round trip's wait for the
   * same paint.
   */
  handle(IPC.fileDiff, async (_event, filePath: string): Promise<FileDiff> => {
    const target = await inWorkspace(filePath)
    const roots = await fileRoots()

    // The narrowest root that holds it, since one folder can be added inside
    // another — the same rule `rootOf` follows in the renderer.
    const root = roots
      .filter((candidate) => files.insideAny([candidate.path], target))
      .sort((a, b) => b.path.length - a.path.length)[0]
    if (!root) return { head: null, patch: null }

    const [head, patch] = await Promise.all([
      fileAtHead(root.path, target),
      fileDiff(root.path, target),
    ])
    return { head, patch }
  })

  handle(IPC.imageAtHead, async (_event, filePath: string) => {
    const target = await inWorkspace(filePath)
    const root = (await fileRoots())
      .filter((candidate) => files.insideAny([candidate.path], target))
      .sort((a, b) => b.path.length - a.path.length)[0]
    if (!root) return null

    // Over the ceiling is a failed read, so a committed 40MP photograph is
    // "nothing to compare against" rather than a base64 string over the bridge.
    const bytes = await fileBytesAtHead(
      root.path,
      target,
      MAX_IMAGE_PREVIEW_BYTES
    )
    if (!bytes) return null
    const mime = IMAGE_MIME_TYPES[path.extname(target).toLowerCase()]
    return `data:${mime ?? "application/octet-stream"};base64,${bytes.toString("base64")}`
  })

  // The narrowest root again, for the same reason as above.
  async function blameRoot(filePath: string) {
    const target = await inWorkspace(filePath)
    const root = (await fileRoots())
      .filter((candidate) => files.insideAny([candidate.path], target))
      .sort((a, b) => b.path.length - a.path.length)[0]
    return root ? { dir: root.path, target } : null
  }

  handle(IPC.gitBlame, async (_event, filePath: string, text: string) => {
    const root = await blameRoot(filePath)
    if (!root || typeof text !== "string") return null
    return blame(root.dir, root.target, text)
  })

  // `hash` and `path` are history rather than a file on disk; `git.ts`
  // refuses either being anything but a hash and a repository path.
  handle(
    IPC.gitLineHistory,
    async (
      _event,
      filePath: string,
      hash: string,
      file: string,
      line: number
    ) => {
      const root = await blameRoot(filePath)
      if (!root) return []
      return lineHistory(root.dir, String(hash), String(file), Number(line))
    }
  )

  /**
   * Every directory the Explorer may read: the workspace's folders.
   *
   * Read fresh on every call, like the workspace itself: a folder removed
   * between one read and the next has to stop being readable at once.
   *
   * Still its own function rather than a `getWorkspace()` at each call site
   * because it is the one list four things are answered from — the gate below,
   * the watchers, the palette's walk and the tsservers.
   */
  async function fileRoots(): Promise<{ path: string; folderId: string }[]> {
    const { folders } = await store.getWorkspace()
    return folders.map((folder) => ({ path: folder.path, folderId: folder.id }))
  }

  /**
   * The one gate in front of the Explorer's reads and writes.
   *
   * Every `files:*` handler goes through this before it touches anything: the
   * renderer sends an absolute path, and an absolute path can name anything on
   * the machine. The workspace's folders are what the user pointed the studio
   * at, so they are what the studio is allowed to open — a rule the renderer
   * cannot be trusted to keep for itself, since the whole point of the check is
   * the case where the renderer is wrong.
   *
   * Read fresh each time rather than cached: a folder removed from the
   * workspace has to stop being writable at once, and the manifest read is a
   * small file behind a queue.
   */
  async function inWorkspace(target: string): Promise<string> {
    if (
      !files.insideAny(
        (await fileRoots()).map((root) => root.path),
        target
      )
    ) {
      throw new Error(
        `${path.basename(target)} is outside the workspace's folders.`
      )
    }
    return target
  }

  handle(IPC.listDirectory, async (_event, dirPath: string) =>
    files.listDirectory(await inWorkspace(dirPath))
  )

  handle(IPC.readTextFile, async (_event, filePath: string) =>
    files.readTextFile(await inWorkspace(filePath))
  )

  handle(IPC.writeTextFile, async (_event, filePath: string, text: string) =>
    files.writeTextFile(await inWorkspace(filePath), text)
  )

  handle(IPC.createFile, async (_event, dir: string, name: string) =>
    files.createFile(await inWorkspace(dir), name)
  )

  handle(IPC.createDirectory, async (_event, dir: string, name: string) =>
    files.createDirectory(await inWorkspace(dir), name)
  )

  handle(IPC.renamePath, async (_event, target: string, name: string) =>
    files.renamePath(await inWorkspace(target), name)
  )

  handle(
    IPC.copyIntoDirectory,
    async (_event, dir: string, sources: string[]) =>
      files.copyInto(await inWorkspace(dir), sources)
  )

  handle(IPC.movePath, async (_event, target: string, dir: string) =>
    files.moveInto(await inWorkspace(target), await inWorkspace(dir))
  )

  handle(IPC.trashPath, async (_event, target: string) => {
    // The OS trash rather than `unlink`: this is somebody's source file, the
    // studio has no undo of its own, and every desktop already has one.
    await host.trash(await inWorkspace(target))
  })

  handle(IPC.revealPath, async (_event, target: string) => {
    await host.reveal(await inWorkspace(target))
  })

  handle(IPC.openInVscode, async (_event, target: string) => {
    await openInVscode(await inWorkspace(target))
  })

  handle(IPC.startDragPath, async (caller, target: string) => {
    await host.startDrag(caller, await inWorkspace(target))
  })

  handle(IPC.readImageFile, async (_event, filePath: string) =>
    // Under `imageDataUrl`'s size ceiling, which is what keeps a 40MP photograph from being turned into a
    // base64 string and posted across the bridge.
    imageDataUrl(await inWorkspace(filePath))
  )

  handle(
    IPC.writeImageFile,
    async (_event, filePath: string, dataUrl: string) =>
      files.writeImageFile(await inWorkspace(filePath), dataUrl)
  )

  handle(IPC.readImageRelative, async (_event, dir: string, relative: string) =>
    // The markdown preview's local pictures: `./logo.png` resolved against
    // the document's own directory — the renderer never joins paths — and
    // read under the same ceiling and the same folders' gate as any other
    // file the studio shows.
    imageDataUrl(await inWorkspace(path.resolve(dir, relative)))
  )

  handle(IPC.projectIcon, async (_event, folderId: string) => {
    // The chosen picture outranks the project's own: choosing one is how
    // somebody says the favicon found was the wrong one.
    const found =
      (await store.projectIconPath(folderId)) ??
      (await findFavicon(await store.resolveFolderDir(folderId)))
    return found ? imageDataUrl(found) : null
  })

  handle(IPC.pickProjectIcon, async (_event, folderId: string) => {
    const [picked] = await host.pickFiles({
      title: "Choose an icon",
      directory: await store.resolveFolderDir(folderId),
      single: true,
      filters: [
        {
          name: "Images",
          extensions: Object.keys(IMAGE_MIME_TYPES).map((ext) => ext.slice(1)),
        },
      ],
    })
    if (!picked) return false
    // The same ceiling `findFavicon` holds a found one to: this is drawn at
    // 16px and posted across the bridge on every launch.
    if ((await stat(picked)).size > MAX_FAVICON_BYTES) {
      throw new Error(`${path.basename(picked)} is too large for an icon.`)
    }
    await store.setProjectIcon(folderId, picked)
    return true
  })

  handle(IPC.resetProjectIcon, (_event, folderId: string) =>
    store.clearProjectIcon(folderId)
  )

  handle(IPC.appBackground, async () => {
    const found = await store.appBackgroundPath()
    return found ? imageDataUrl(found) : null
  })

  handle(IPC.pickAppBackground, async () => {
    const [picked] = await host.pickFiles({
      title: "Choose a background",
      single: true,
      filters: [
        {
          name: "Images",
          extensions: Object.keys(IMAGE_MIME_TYPES).map((ext) => ext.slice(1)),
        },
      ],
    })
    if (!picked) return false
    // The same ceiling `imageDataUrl` holds it to when it is read back on
    // every launch: a picture too big to preview is too big to be a backdrop.
    if ((await stat(picked)).size > MAX_IMAGE_PREVIEW_BYTES) {
      throw new Error(`${path.basename(picked)} is too large for a background.`)
    }
    await store.setAppBackground(picked)
    return true
  })

  handle(IPC.clearAppBackground, () => store.clearAppBackground())

  handle(
    IPC.resolveRelativePath,
    async (_event, dir: string, relative: string) => {
      // The markdown preview's links. A miss is an answer rather than a throw:
      // a README linking to a file that was never committed is ordinary.
      try {
        const target = await inWorkspace(path.resolve(dir, relative))
        return { path: target, directory: (await stat(target)).isDirectory() }
      } catch {
        return null
      }
    }
  )

  /*
   * One TypeScript server per workspace folder, started the first time a file
   * in that folder is opened — see `main/tsserver.ts`. It is handed a reader
   * for the folders rather than the store, since where the workspace points is
   * the only thing it needs to know.
   *
   * Every path is checked the same way the reads and writes above are: a hover
   * is a file being sent to a process, which is exactly the kind of call the
   * gate exists for.
   */
  // One server per root, since a root has its own `node_modules` and
  // `tsconfig.json` and resolving one folder's imports against another's copy
  // is how a hover ends up pointing at the wrong source. `serverFor` takes the
  // longest match, and each server is started only when a file in it is opened.
  const tsServers = new TsServers(async () =>
    (await fileRoots()).map((root) => root.path)
  )

  handle(IPC.tsOpen, async (_event, filePath: string, text: string) =>
    tsServers.open(await inWorkspace(filePath), text)
  )

  handle(IPC.tsChange, async (_event, filePath: string, text: string) =>
    tsServers.change(await inWorkspace(filePath), text)
  )

  handle(IPC.tsClose, async (_event, filePath: string) =>
    tsServers.close(await inWorkspace(filePath))
  )

  handle(
    IPC.tsHover,
    async (_event, filePath: string, line: number, column: number) =>
      tsServers.hover(await inWorkspace(filePath), line, column)
  )

  handle(
    IPC.tsDefinition,
    async (_event, filePath: string, line: number, column: number) =>
      // Definitions are deliberately *not* filtered to the workspace on the way
      // back: a symbol imported from a package is declared under
      // `node_modules`, which is inside the folder, but one from a linked
      // package may not be. The renderer opens what it is given through
      // `readTextFile`, which is checked in its own right — so a definition
      // outside the workspace is a tab that refuses to open rather than a read
      // that slipped through.
      tsServers.definition(await inWorkspace(filePath), line, column)
  )

  handle(IPC.tsUnused, async (_event, filePath: string) =>
    tsServers.unused(await inWorkspace(filePath))
  )

  /*
   * The tree follows the disk while it is open — see `main/watch.ts` for why
   * this watches the expanded directories and nothing above or below them.
   */
  const directoryWatchers = new DirectoryWatchers((dir) =>
    send(IPC.directoryChanged, { dir })
  )
  // And each root as a whole, so a write into a folder nobody has expanded
  // still reaches the `Changes` list — see `RootWatchers`.
  const rootWatchers = new RootWatchers((root, paths, overflow) =>
    send(IPC.treeChanged, { root, paths, overflow })
  )
  const watchers = {
    closeAll() {
      directoryWatchers.closeAll()
      rootWatchers.closeAll()
    },
  }

  handle(IPC.watchDirectories, async (_event, dirs: string[]) => {
    const roots = (await fileRoots()).map((root) => root.path)
    // Re-set on every call, and the renderer sends one when the folders
    // change as well as when the tree does.
    rootWatchers.set(roots)
    directoryWatchers.set([
      // Filtered rather than refused: this call carries a whole set, and one
      // directory belonging to a folder removed while the message was in
      // flight would otherwise cost the tree every other watcher it asked for.
      ...dirs.filter((dir) => files.insideAny(roots, dir)),
      // Each root's own `.git`, whatever the renderer asked for. A commit or a
      // checkout in the dock's shell changes the colour of every row and the
      // branch beside the folder, while touching no directory the tree is
      // watching. Added here rather than sent from the renderer because this
      // side is the one that joins a name to a path.
      ...roots.map((root) => path.join(root, ".git")),
    ])
  })

  handle(IPC.listWorkspaceFiles, async () => {
    // Sequential rather than `Promise.all`, so the budget is shared: two roots
    // walked at once would each take the whole cap and hand back twice what
    // the renderer agreed to hold.
    const found: FileIndexEntry[] = []
    for (const root of await fileRoots()) {
      if (found.length >= MAX_INDEXED_FILES) break
      found.push(
        ...(await files.indexFiles(
          root.path,
          root.folderId,
          MAX_INDEXED_FILES - found.length
        ))
      )
    }
    return found
  })

  handle(IPC.getSetting, (_event, key: string) => store.getSetting(key))

  handle(IPC.setSetting, (_event, key: string, value: string) =>
    store.setSetting(key, value)
  )

  handle(IPC.readDrawing, (_event, id: string) => store.readDrawing(id))

  handle(IPC.writeDrawing, (_event, id: string, scene: string) =>
    store.writeDrawing(id, scene)
  )

  handle(IPC.writeDrawingSvg, (_event, id: string, svg: string) =>
    store.writeDrawingSvg(id, svg)
  )

  handle(
    IPC.writeNoteFile,
    // A `Uint8Array` on the way in whatever the renderer built it from: an
    // `ArrayBuffer` survives structured clone as one, and writing it as-is
    // would put the string "[object ArrayBuffer]" in the file.
    (_event, fileName: string, bytes: Uint8Array | ArrayBuffer) =>
      store.writeNoteFile(
        fileName,
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      )
  )

  handle(
    IPC.terminalCreate,
    async (
      _event,
      folderId: string,
      cols: number,
      rows: number,
      shellId?: string,
      dir?: string
    ) => {
      const folderDir = await store.resolveFolderDir(folderId)
      // A directory inside the folder, when the tree asked for one: the same
      // containment as every read, and a file is refused rather than made the
      // cwd of a shell that would start somewhere it cannot be in.
      if (dir) {
        if (
          !files.insideAny([folderDir], dir) ||
          !(await stat(dir).catch(() => null))?.isDirectory()
        ) {
          throw new Error(`${path.basename(dir)} is not a folder in this one.`)
        }
      }
      const cwd = dir || folderDir
      // No command: an interactive shell, which is the only thing a pty is
      // started for now. The agent CLIs used to be started here too, with
      // their flags built alongside — what runs one is the agent SDK in
      // `chat.ts`, which spawns its own process and needs no pty.
      const picked = shellId
        ? (await installedShells()).find((profile) => profile.id === shellId)
        : undefined
      const shell = picked && { file: picked.file, args: picked.args }
      return terminals.create({ cwd, shell }, cols, rows)
    }
  )

  handle(IPC.terminalShells, async () =>
    (await installedShells()).map(({ id, name }) => ({ id, name }))
  )

  handle(IPC.terminalWrite, (_event, terminalId: string, data: string) =>
    terminals.write(terminalId, data)
  )

  handle(
    IPC.terminalResize,
    (_event, terminalId: string, cols: number, rows: number) =>
      terminals.resize(terminalId, cols, rows)
  )

  handle(IPC.terminalKill, (_event, terminalId: string) =>
    terminals.kill(terminalId)
  )

  handle(IPC.terminalCwd, (_event, terminalId: string) =>
    terminals.cwd(terminalId)
  )

  /*
   * The plugins: what is on disk, and the one file each may write. Which are
   * switched on is a setting the renderer keeps, and the renderer is where they
   * run — see `main/plugins.ts` and `docs/design.md` § Plugins.
   */
  const pluginsDir = path.join(dataDir(), WORKSPACE_DIR, PLUGINS_DIR)
  const pluginDataDir = path.join(dataDir(), WORKSPACE_DIR, PLUGIN_DATA_DIR)
  const pluginRoots = { bundled: host.bundledPluginsDir, user: pluginsDir }

  handle(IPC.listPlugins, () => listAllPlugins(pluginRoots))

  handle(IPC.readPluginData, (_event, id: string) =>
    readPluginData(pluginDataDir, id)
  )

  handle(IPC.writePluginData, (_event, id: string, data: unknown) =>
    writePluginData(pluginDataDir, id, data)
  )

  /*
   * Installing is a picker and a copy — see `main/plugin-install.ts`. Two
   * sources rather than one picker taking both, because only macOS lets one
   * dialog choose a folder *or* a file.
   */
  handle(IPC.installPlugin, async (_event, source: PluginSource) => {
    let files: PluginFiles
    if (source === "folder") {
      const dir = await host.pickDirectory({
        title: "Install a plugin from a folder",
        buttonLabel: "Install",
      })
      if (!dir) return null
      files = await readPluginFolder(dir)
    } else if (source === "zip") {
      const [zip] = await host.pickFiles({
        title: "Install a plugin from a .zip",
        single: true,
        filters: [{ name: "Plugin archive", extensions: ["zip"] }],
      })
      if (!zip) return null
      files = readPluginZip(await readFile(zip))
    } else {
      throw new Error(`Not a plugin source: ${String(source)}`)
    }
    return installPlugin(pluginRoots, files)
  })

  // To the trash, the way every delete in this app goes. Its saved data is
  // left where it is, so installing it again picks up where it was.
  handle(IPC.removePlugin, async (_event, id: string) => {
    await host.trash(await installedPluginDir(pluginRoots, id))
  })

  /*
   * Each project's ClickUp inbox — `main/clickup-inbox.ts`. The key, or the
   * sign-in that stands for one, is one for the workspace, sealed like a
   * custom API's and never handed back.
   */
  const clickupToken = async (): Promise<string> => {
    const sealed = await store.getSetting(CLICKUP_KEY)
    return (sealed && host.unseal(sealed)) || ""
  }
  const clickupGrant = async (): Promise<McpGrant | null> => {
    const sealed = await store.getSetting(CLICKUP_GRANT)
    const json = (sealed && host.unseal(sealed)) || ""
    if (!json) return null
    try {
      return grantOf(JSON.parse(json))
    } catch {
      return null
    }
  }
  const saveGrant = (grant: McpGrant) =>
    store.setSetting(CLICKUP_GRANT, host.seal(JSON.stringify(grant)))
  const clickupMcp = new ClickupMcp({
    fetch: host.fetch,
    grant: clickupGrant,
    saveGrant,
  })
  const clickupSource = async () => {
    const grant = await clickupGrant()
    if (grant) return mcpSource(clickupMcp, `mcp:${grant.clientId}`)
    const token = await clickupToken()
    return token ? restSource(host.fetch, token) : null
  }
  /** One browser step at a time: a second click joins the first. */
  let signingIn: Promise<void> | null = null
  let cancelSignIn: AbortController | null = null
  const inbox = new ClickupInbox({
    source: clickupSource,
    read: () => store.readClickupInbox(),
    write: (records) => store.writeClickupInbox(records),
    folderIds: async () =>
      (await store.getWorkspace()).folders.map((folder) => folder.id),
    onChange: (inboxes) => send(IPC.inboxChanged, inboxes),
  })
  inbox.start()

  handle(IPC.inboxes, () => inbox.list())
  handle(IPC.inboxAuth, async () =>
    (await clickupGrant()) ? "clickup" : (await clickupToken()) ? "key" : "none"
  )
  handle(IPC.inboxSetKey, async (_event, token: unknown) => {
    const key = typeof token === "string" ? token.trim() : ""
    if (!key) throw new Error("Paste a ClickUp personal key.")
    const checked = await checkKey(host.fetch, key)
    if ("error" in checked) throw new Error(checked.error)
    cancelSignIn?.abort()
    await store.setSetting(CLICKUP_KEY, host.seal(key))
    await store.setSetting(CLICKUP_GRANT, "")
    clickupMcp.reset()
    void inbox.poll()
  })
  handle(IPC.inboxSignIn, () => {
    if (!signingIn) {
      const controller = new AbortController()
      cancelSignIn = controller
      signingIn = (async () => {
        const grant = await signIn(
          host.fetch,
          (url) => host.openExternal(url),
          controller.signal
        )
        // Cancelled while the code was being exchanged: nothing is kept.
        if (controller.signal.aborted) throw new Error(CANCELLED)
        await saveGrant(grant)
        await store.setSetting(CLICKUP_KEY, "")
        clickupMcp.reset()
        void inbox.poll()
      })().finally(() => {
        signingIn = null
        cancelSignIn = null
      })
    }
    return signingIn
  })
  handle(IPC.inboxCancelSignIn, () => {
    cancelSignIn?.abort()
  })
  // The key or the grant, whichever there is, forgotten here only: ClickUp
  // publishes no revocation endpoint, so a grant lapses on its own and a key
  // stays valid in ClickUp until it is regenerated there. The inboxes stay,
  // unpolled, for the next sign-in.
  handle(IPC.inboxSignOut, async () => {
    cancelSignIn?.abort()
    await store.setSetting(CLICKUP_GRANT, "")
    await store.setSetting(CLICKUP_KEY, "")
    clickupMcp.reset()
  })
  handle(IPC.inboxConnect, (_event, folderId: string, list: string) =>
    inbox.connect(String(folderId), String(list))
  )
  handle(IPC.inboxDisconnect, (_event, folderId: string) =>
    inbox.disconnect(String(folderId))
  )
  handle(
    IPC.inboxMarkRead,
    (_event, folderId: string, itemIds: string[] | null) =>
      inbox.markRead(
        String(folderId),
        Array.isArray(itemIds) ? itemIds.map(String) : null
      )
  )
  handle(IPC.inboxRefresh, (_event, folderId: string) =>
    inbox.poll(String(folderId))
  )
  handle(IPC.inboxSetSettings, (_event, folderId: string, settings: unknown) =>
    inbox.setSettings(String(folderId), settings)
  )

  handle(IPC.systemUsage, () => systemUsage(host.appShare))

  handle(IPC.listPorts, () => listeningPorts())
  handle(IPC.stopPortProcess, (_event, pid: number, force: boolean) =>
    stopListener(pid, force === true)
  )

  handle(IPC.checkForUpdate, () =>
    checkForUpdate(host.version, process.platform)
  )

  handle(IPC.appVersion, () => host.version)

  handle(IPC.releaseNotes, (_event, since: string | null) =>
    releaseNotes(typeof since === "string" ? since : null, host.version)
  )

  handle(IPC.installUpdate, async (_event, version: string) => {
    const platform = process.platform
    if (platform !== "darwin" && platform !== "win32") {
      throw new Error(
        "There is no in-app installer for this platform — open the release page instead."
      )
    }
    if (platform === "darwin" && !host.macUpdate) {
      throw new Error(
        "This build updates from its checkout — pull and restart instead."
      )
    }
    // A version reaching a URL and a file name, from the renderer, off the
    // network: checked here rather than trusted, even though the only thing
    // that ever sends one is the answer `checkForUpdate` just gave.
    if (!/^[0-9A-Za-z.+-]{1,64}$/.test(version)) {
      throw new Error(`Not a version: ${version}`)
    }
    // This is the long phase and the only one with a window left to draw in.
    // A failure throws, and the renderer is still there to show it.
    const onProgress = (received: number, total: number) =>
      send(IPC.updateProgress, {
        stage: "downloading",
        version,
        received,
        total,
      })
    const installing = () =>
      send(IPC.updateProgress, { stage: "installing", version })
    if (platform === "darwin") {
      await host.macUpdate!({
        version,
        feedUrl: releaseFeedUrl(version),
        onProgress,
        onInstalling: installing,
      })
      return
    }
    const installer = await downloadUpdate({
      version,
      platform,
      arch: process.arch,
      onProgress,
    })
    installing()
    // The app quits itself and the installer starts after — see
    // `windowsInstallerArgs` for why in that order.
    host.quitAndRun(() => startWindowsInstaller(installer, true))
  })

  return {
    handlers,
    telemetry,
    allChats,
    terminals,
    tsServers,
    watchers,
    /** For the `note-file://` handler, which is not an IPC call and so cannot
     * reach the store any other way — see `serveNoteFiles`. */
    noteFilePath: (fileName: string) => store.noteFilePath(fileName),
    /** For the `vsc-plugin://` handler, the same way — see `servePlugins`. */
    pluginFilePath: (id: string, file: PluginFile) =>
      pluginFilePath(pluginRootOf(pluginRoots, id), id, file),
  }
}

/** An endpoint's host, for the row's caption. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/** What a failure says, for a result the renderer shows as it is. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
