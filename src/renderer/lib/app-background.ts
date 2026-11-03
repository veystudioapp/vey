import type { CSSProperties } from "react"
import { create } from "zustand"

/**
 * The picture behind the studio — the canvas the cards sit on, which is what
 * shows in the gaps between them and under the title bar and the rail.
 *
 * The picture lives in main (a copy under the workspace, read back as a
 * `data:` URL), not in `workbench.settings`: it is a file, and the settings bag
 * is rewritten whole on every change. Here only the bytes the window is
 * drawing are held, so the store is `image` and nothing about where it came
 * from.
 */
type AppBackgroundState = {
  /** A `data:` URL, or null for the plain canvas. */
  image: string | null
  restore: () => Promise<void>
  /** Asks for a picture in the OS picker. Throws what main threw — a file too
   * large to be a backdrop. Does nothing on cancel. */
  choose: () => Promise<void>
  clear: () => Promise<void>
}

export const useAppBackground = create<AppBackgroundState>((set) => ({
  image: null,
  async restore() {
    // A picture that cannot be read is no picture: the canvas stays plain
    // rather than the studio failing to open over a backdrop.
    const image = await window.desktop.appBackground().catch(() => null)
    set({ image })
  },
  async choose() {
    if (!(await window.desktop.pickAppBackground())) return
    await useAppBackground.getState().restore()
  },
  async clear() {
    await window.desktop.clearAppBackground()
    set({ image: null })
  },
}))

/**
 * The inline style for the studio's root: the picture covering the window,
 * centred, with the canvas colour under it for the frame before it is read.
 * Empty for no picture, so the root draws exactly what it did.
 */
export function backgroundStyle(image: string | null): CSSProperties {
  if (!image) return {}
  return {
    backgroundImage: `url("${image}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  }
}
