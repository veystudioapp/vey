import { chat } from "./chat"
import { common } from "./common"
import { files } from "./files"
import { nav } from "./nav"
import { onboarding } from "./onboarding"
import { projects } from "./projects"
import { settings } from "./settings"
import { transcript } from "./transcript"

/**
 * The English dictionary, which is the shape every other one must match: a
 * namespace per area of the window, one file each, so the areas can be
 * translated without stepping on one another.
 */
export const en = {
  common,
  settings,
  nav,
  projects,
  chat,
  transcript,
  files,
  onboarding,
}

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }

export type Messages = Widen<typeof en>
