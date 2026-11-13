import { create } from "zustand"

import type {
  SoundPackInfo,
  SoundPackInstall,
  SoundPackSource,
} from "@shared/sound-packs"

type SoundPacksState = {
  /** Null until first asked — only once the sounds are on, or Settings opens
   * its section. */
  packs: SoundPackInfo[] | null
  /**
   * Bumped by an import, so the engine re-reads a pack imported again over the
   * one it is playing rather than keeping the old recording decoded.
   */
  revision: number
  refresh: () => Promise<void>
  /** Null when the picker was cancelled; throws with main's reason. */
  install: (source: SoundPackSource) => Promise<SoundPackInstall | null>
  remove: (id: string) => Promise<void>
}

/** The Mechvibes packs on disk — `main/sound-packs.ts`. */
export const useSoundPacks = create<SoundPacksState>((set, get) => ({
  packs: null,
  revision: 0,

  async refresh() {
    try {
      set({ packs: await window.desktop.soundPacks() })
    } catch (error) {
      console.error("Could not list the sound packs", error)
      set({ packs: [] })
    }
  },

  async install(source) {
    const installed = await window.desktop.installSoundPack(source)
    if (installed) {
      set({ revision: get().revision + 1 })
      await get().refresh()
    }
    return installed
  },

  async remove(id) {
    await window.desktop.removeSoundPack(id)
    await get().refresh()
  },
}))
