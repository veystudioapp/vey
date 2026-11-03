import type { Messages } from "../en"
import { chat } from "./chat"
import { common } from "./common"
import { files } from "./files"
import { nav } from "./nav"
import { onboarding } from "./onboarding"
import { projects } from "./projects"
import { settings } from "./settings"
import { transcript } from "./transcript"

/** Typed as the English shape, so a key missing here fails `typecheck`. */
export const vi: Messages = {
  common,
  settings,
  nav,
  projects,
  chat,
  transcript,
  files,
  onboarding,
}
