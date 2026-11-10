/**
 * What each running plugin has put into the studio, so switching it off can
 * take all of it back out.
 *
 * Obsidian's bargain: a plugin never removes what it added — everything it
 * registers through the app is recorded against it here, and `unload` undoes
 * the lot in reverse. A plugin that forgot to unsubscribe from the chats is
 * then still a plugin that stops when it is switched off.
 *
 * Pure, with no store and no `window.desktop`, so `test/plugin-registry.ts` can
 * drive it; `lib/plugins/store.ts` holds one and `lib/plugins/app.ts` builds
 * what a plugin is handed on top of it.
 */

/**
 * The marks a plugin's menu item may carry, by name: a plugin cannot hand the
 * studio a React component, and an item with no mark sits misaligned in a menu
 * where every other one has one. `lib/plugins/icons.ts` draws them.
 */
export const PLUGIN_ICONS = [
  "copy",
  "download",
  "code",
  "file",
  "share",
  "chart",
  "network",
  "puzzle",
] as const
export type PluginIcon = (typeof PLUGIN_ICONS)[number]

/** One item a plugin added to a chat row's context menu. */
export type PluginChatMenuItem = {
  /** `<plugin id>:<the plugin's own id>`, so two plugins can both call an
   * item `export` without one replacing the other. */
  id: string
  pluginId: string
  name: string
  icon: PluginIcon
  run: (chatId: string) => void | Promise<void>
}

/** One button a plugin added to the window's rail, at its foot above Terminal. */
export type PluginRailButton = {
  id: string
  pluginId: string
  label: string
  icon: PluginIcon
  run: () => void | Promise<void>
}

/**
 * One button a plugin added to the system bar, at its right beside Feedback —
 * a tool wanted rarely and at a moment, which the rail's foot is too loud for.
 */
export type PluginStatusBarItem = {
  id: string
  pluginId: string
  label: string
  /** The tooltip; the label when absent. */
  title: string
  icon: PluginIcon
  run: () => void | Promise<void>
}

/** A position in the text a linter was handed: 1-based line and column, the
 * way ESLint, tsserver and every other linter count. */
export type PluginTextPosition = { line: number; column: number }

/**
 * One problem a plugin's linter found, as the editor draws it.
 *
 * Positions rather than CodeMirror offsets so a plugin never has to hold an
 * editor — it is handed text and answers about text — and `fixes` as edits to
 * that same text, by offset, which the editor applies only while the document
 * is still the one that was linted.
 */
export type PluginDiagnostic = {
  from: PluginTextPosition
  /** Absent for a point — a parse error has no extent. */
  to?: PluginTextPosition
  severity: "error" | "warning" | "info" | "hint"
  message: string
  /** Shown after the message — `eslint(no-unused-vars)`. */
  source?: string
  fixes?: {
    name: string
    edits: { from: number; to: number; insert: string }[]
  }[]
}

/** A source of squiggles in the file editor, for files with one of
 * `extensions`. */
export type PluginLinter = {
  id: string
  pluginId: string
  name: string
  /** Lower case, no dot. */
  extensions: string[]
  /**
   * What is wrong with `text`, the editor's buffer for `path`. Null for "no
   * answer this time" — a timeout, a crash — which keeps what is drawn rather
   * than wiping it; an empty list is "nothing is wrong".
   */
  lint: (input: {
    path: string
    text: string
  }) => Promise<PluginDiagnostic[] | null>
}

/** What a line annotator writes after the caret's line, and the card behind
 * the words. */
export type PluginLineAnnotation = {
  text: string
  /**
   * Draws the card shown when the words are hovered into `host`, and answers
   * with the way to take it down. Absent for words with nothing behind them.
   * `remeasure` is for a card that has grown — something it fetched arrived.
   */
  card?: (
    host: HTMLElement,
    context: { close: () => void; remeasure: () => void }
  ) => () => void
}

/**
 * Faint words after the caret's line in the file editor — what GitLens calls
 * its current-line blame, the built-in `git-blame` plugin's.
 */
export type PluginLineAnnotator = {
  id: string
  pluginId: string
  name: string
  /**
   * Asked when the editor opens, when it is focused again and a moment after
   * typing stops, with the buffer as it stands. Answers with what to write at
   * each line (1-based), or null for nothing in this file. An answer is drawn
   * only while the buffer is still the text it was asked about.
   */
  annotate: (input: {
    path: string
    text: string
  }) => Promise<((line: number) => PluginLineAnnotation | null) | null>
}

/** What `main.js` has to export as its default. */
export type PluginModule<App> = {
  onload: (app: App) => void | Promise<void>
  onunload?: () => void | Promise<void>
}

export class PluginRegistry {
  private readonly disposers = new Map<string, (() => void)[]>()
  private readonly chatMenuItems = new Map<string, PluginChatMenuItem>()
  private readonly railButtons = new Map<string, PluginRailButton>()
  private readonly statusBarItems = new Map<string, PluginStatusBarItem>()
  private readonly linters = new Map<string, PluginLinter>()
  private readonly lineAnnotators = new Map<string, PluginLineAnnotator>()
  private readonly modules = new Map<string, PluginModule<unknown>>()
  private readonly listeners = new Set<() => void>()

  /** Records something to undo when `pluginId` is unloaded. */
  track(pluginId: string, dispose: () => void): void {
    const list = this.disposers.get(pluginId) ?? []
    list.push(dispose)
    this.disposers.set(pluginId, list)
  }

  addChatMenuItem(
    pluginId: string,
    item: {
      id: string
      name: string
      icon?: string
      run: PluginChatMenuItem["run"]
    }
  ): void {
    if (typeof item?.run !== "function") {
      throw new Error("A menu item needs a `run` function.")
    }
    const id = `${pluginId}:${String(item.id)}`
    this.chatMenuItems.set(id, {
      id,
      pluginId,
      name: String(item.name || item.id),
      icon: iconOf(item.icon),
      run: item.run,
    })
    this.track(pluginId, () => {
      // Only if it is still this one: a plugin re-adding the same id replaced
      // it, and the first registration's undo must not take the second away.
      if (this.chatMenuItems.get(id)?.run === item.run) {
        this.chatMenuItems.delete(id)
      }
    })
    this.changed()
  }

  /** Every chat menu item, in the order they were added. */
  chatMenuList(): PluginChatMenuItem[] {
    return [...this.chatMenuItems.values()]
  }

  addRailButton(
    pluginId: string,
    button: {
      id: string
      label: string
      icon?: string
      run: PluginRailButton["run"]
    }
  ): void {
    if (typeof button?.run !== "function") {
      throw new Error("A rail button needs a `run` function.")
    }
    const id = `${pluginId}:${String(button.id)}`
    this.railButtons.set(id, {
      id,
      pluginId,
      label: String(button.label || button.id),
      icon: iconOf(button.icon),
      run: button.run,
    })
    this.track(pluginId, () => {
      if (this.railButtons.get(id)?.run === button.run) {
        this.railButtons.delete(id)
      }
    })
    this.changed()
  }

  /** Every rail button, in the order they were added. */
  railButtonList(): PluginRailButton[] {
    return [...this.railButtons.values()]
  }

  addStatusBarItem(
    pluginId: string,
    item: {
      id: string
      label: string
      title?: string
      icon?: string
      run: PluginStatusBarItem["run"]
    }
  ): void {
    if (typeof item?.run !== "function") {
      throw new Error("A status bar item needs a `run` function.")
    }
    const id = `${pluginId}:${String(item.id)}`
    const label = String(item.label || item.id)
    this.statusBarItems.set(id, {
      id,
      pluginId,
      label,
      title: item.title ? String(item.title) : label,
      icon: iconOf(item.icon),
      run: item.run,
    })
    this.track(pluginId, () => {
      if (this.statusBarItems.get(id)?.run === item.run) {
        this.statusBarItems.delete(id)
      }
    })
    this.changed()
  }

  /** Every status bar item, in the order they were added. */
  statusBarItemList(): PluginStatusBarItem[] {
    return [...this.statusBarItems.values()]
  }

  addLinter(
    pluginId: string,
    linter: {
      id: string
      name: string
      extensions: string[]
      lint: PluginLinter["lint"]
    }
  ): void {
    if (typeof linter?.lint !== "function") {
      throw new Error("A linter needs a `lint` function.")
    }
    if (!Array.isArray(linter.extensions)) {
      throw new Error("A linter needs the `extensions` it reads.")
    }
    const id = `${pluginId}:${String(linter.id)}`
    this.linters.set(id, {
      id,
      pluginId,
      name: String(linter.name || linter.id),
      extensions: linter.extensions.map((extension) =>
        String(extension).toLowerCase().replace(/^\./, "")
      ),
      lint: linter.lint,
    })
    this.track(pluginId, () => {
      if (this.linters.get(id)?.lint === linter.lint) this.linters.delete(id)
    })
    this.changed()
  }

  /** Every linter, in the order they were added. */
  linterList(): PluginLinter[] {
    return [...this.linters.values()]
  }

  addLineAnnotation(
    pluginId: string,
    annotator: {
      id: string
      name: string
      annotate: PluginLineAnnotator["annotate"]
    }
  ): void {
    if (typeof annotator?.annotate !== "function") {
      throw new Error("A line annotation needs an `annotate` function.")
    }
    const id = `${pluginId}:${String(annotator.id)}`
    this.lineAnnotators.set(id, {
      id,
      pluginId,
      name: String(annotator.name || annotator.id),
      annotate: annotator.annotate,
    })
    this.track(pluginId, () => {
      if (this.lineAnnotators.get(id)?.annotate === annotator.annotate) {
        this.lineAnnotators.delete(id)
      }
    })
    this.changed()
  }

  /** Every line annotator, in the order they were added. The editor draws
   * the first: the end of one line has room for one sentence. */
  lineAnnotatorList(): PluginLineAnnotator[] {
    return [...this.lineAnnotators.values()]
  }

  isLoaded(pluginId: string): boolean {
    return this.modules.has(pluginId)
  }

  /**
   * Runs a plugin's `onload`. A plugin whose `onload` throws is unloaded again
   * at once — whatever it managed to register before the throw is taken back —
   * and the error is rethrown for the caller to show.
   */
  async load<App>(
    pluginId: string,
    exported: unknown,
    app: App
  ): Promise<void> {
    if (this.modules.has(pluginId)) await this.unload(pluginId)

    const module = moduleOf<App>(exported)
    this.modules.set(pluginId, module as PluginModule<unknown>)
    try {
      await module.onload(app)
    } catch (error) {
      await this.unload(pluginId)
      throw error
    }
  }

  /**
   * Calls `onunload`, then undoes everything the plugin registered, newest
   * first. Never throws: a plugin failing on its way out is still out, and the
   * errors come back for the caller to log.
   */
  async unload(pluginId: string): Promise<unknown[]> {
    const errors: unknown[] = []
    const module = this.modules.get(pluginId)
    this.modules.delete(pluginId)

    if (module?.onunload) {
      try {
        await module.onunload()
      } catch (error) {
        errors.push(error)
      }
    }

    const list = this.disposers.get(pluginId) ?? []
    this.disposers.delete(pluginId)
    for (const dispose of list.reverse()) {
      try {
        dispose()
      } catch (error) {
        errors.push(error)
      }
    }

    this.changed()
    return errors
  }

  /** Called whenever what plugins contribute changes. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(): void {
    for (const listener of this.listeners) listener()
  }
}

/** A mark by name, or the puzzle piece for a name that is not one of ours. */
function iconOf(name: string | undefined): PluginIcon {
  return (PLUGIN_ICONS as readonly string[]).includes(name ?? "")
    ? (name as PluginIcon)
    : "puzzle"
}

/**
 * The plugin out of what its `main.js` exported.
 *
 * Either an object with `onload` or a class whose instances have one — the
 * second is how an Obsidian plugin is written, and costs nothing to accept.
 */
export function moduleOf<App>(exported: unknown): PluginModule<App> {
  const candidate =
    exported && typeof exported === "object" && "default" in exported
      ? (exported as { default: unknown }).default
      : exported

  if (typeof candidate === "function") {
    const instance: unknown = new (candidate as new () => unknown)()
    return moduleOf<App>(instance)
  }

  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as { onload?: unknown }).onload === "function"
  ) {
    const plugin = candidate as PluginModule<App>
    return {
      onload: (app) => plugin.onload(app),
      ...(typeof plugin.onunload === "function"
        ? { onunload: () => plugin.onunload!() }
        : {}),
    }
  }

  throw new Error("main.js must `export default` an object with an `onload`.")
}
