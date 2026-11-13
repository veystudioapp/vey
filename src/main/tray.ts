import {
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  type MenuItemConstructorOptions,
} from "electron"

import type { AttentionChat, Bot } from "../shared/api"
import {
  trayMenuOf,
  trayTitleOf,
  trayTooltipOf,
  type TrayItem,
} from "./tray-menu"
import trayIcon from "../../resources/tray.png"
import trayIcon2x from "../../resources/tray@2x.png"
import badgeLight from "../../resources/tray-badge-light.png"
import badgeLight2x from "../../resources/tray-badge-light@2x.png"
import badgeDark from "../../resources/tray-badge-dark.png"
import badgeDark2x from "../../resources/tray-badge-dark@2x.png"

/** One image out of its two sizes, so a Retina menu bar draws the @2x. */
function imageOf(at1x: string, at2x: string, template: boolean) {
  const image = nativeImage.createFromDataURL(at1x)
  image.addRepresentation({ scaleFactor: 2, dataURL: at2x })
  image.setTemplateImage(template)
  return image
}

/**
 * The menu bar icon: what keeps the app reachable once its window is closed
 * and its dock icon gone, so the bots can go on running
 * (`docs/design.md` § The menu bar, for bots). macOS only — `main.ts` is what
 * hides the window rather than closing it, and only there.
 *
 * The icon is the mark, with a red dot while a chat wants somebody — the same
 * chats the dock badge counts — and beside it the number of bots switched
 * on, nothing when none is. Clean, it is a template image and macOS inks
 * it; badged it cannot be, a template has no red, so it is inked off
 * `nativeTheme` (`scripts/tray-icon.mjs`).
 *
 * The menu is built on the click rather than kept set, so a bot's next run is
 * worked out when somebody looks rather than whenever the list last changed.
 */
export class MenuBarTray {
  /** Held here, not in a local: an unreferenced Tray is collected and the
   * icon leaves the menu bar some seconds later, with nothing in any log. */
  private readonly tray: Tray
  private attention: AttentionChat[] = []
  private bots: Bot[] = []
  private projects: Record<string, string> = {}

  constructor(
    private readonly actions: {
      /** Brings the studio back, dock icon and all. */
      show: () => void
      /** The studio, scrolled to one chat — what a notification's click does. */
      reveal: (chatId: string) => void
      quit: () => void
    }
  ) {
    this.tray = new Tray(this.image())
    this.tray.setToolTip(trayTooltipOf([], []))
    const open = () => this.tray.popUpContextMenu(this.menu())
    this.tray.on("click", open)
    this.tray.on("right-click", open)
    nativeTheme.on("updated", () => this.tray.setImage(this.image()))
  }

  setAttention(chats: AttentionChat[]): void {
    const before = this.attention.length > 0
    this.attention = chats
    this.tray.setToolTip(trayTooltipOf(chats, this.bots))
    if (before !== chats.length > 0) this.tray.setImage(this.image())
  }

  /** Every change to a bot's runs comes through here — a run starting and
   * settling are both writes (`Bots.update`), and so is switching one on or
   * off — so neither the number beside the icon nor the menu's running count
   * is a poll. */
  setBots(bots: Bot[], projects: Record<string, string>): void {
    this.bots = bots
    this.projects = projects
    // Tabular digits, so the icon does not shift as the number changes.
    this.tray.setTitle(trayTitleOf(bots), { fontType: "monospacedDigit" })
    this.tray.setToolTip(trayTooltipOf(this.attention, bots))
  }

  destroy(): void {
    this.tray.destroy()
  }

  private image() {
    if (this.attention.length === 0) return imageOf(trayIcon, trayIcon2x, true)
    return nativeTheme.shouldUseDarkColors
      ? imageOf(badgeDark, badgeDark2x, false)
      : imageOf(badgeLight, badgeLight2x, false)
  }

  private menu(): Menu {
    const items = trayMenuOf({
      attention: this.attention,
      bots: this.bots,
      projects: this.projects,
      now: new Date(),
    })
    return Menu.buildFromTemplate(items.map((item) => this.itemOf(item)))
  }

  private itemOf(item: TrayItem): MenuItemConstructorOptions {
    switch (item.kind) {
      case "open":
        return { label: "Open Vey", click: () => this.actions.show() }
      case "heading":
        return { label: item.label, enabled: false }
      case "chat":
        return {
          label: item.label,
          click: () => this.actions.reveal(item.chatId),
        }
      case "bot":
        // Into the studio, where its tab is: the menu says when, the tab
        // says everything else.
        return { label: item.label, click: () => this.actions.show() }
      case "note":
        return { label: item.label, enabled: false }
      case "separator":
        return { type: "separator" }
      case "quit":
        return {
          label: "Quit Vey",
          accelerator: "CommandOrControl+Q",
          click: () => this.actions.quit(),
        }
    }
  }
}
