import { create } from "zustand"

import { TELEMETRY_KEY, type ChatEffort } from "@shared/api"
import {
  DEFAULT_APPEARANCE,
  isAccentPalette,
  isDensity,
  isFontSize,
  isMonoFont,
  isSansFont,
  type Appearance,
} from "./appearance"
import { isLanguageChoice, type LanguageChoice } from "./i18n"
import { recall, remember } from "./tab-memory"
import { getSetting, setSetting } from "./workspace"

/** Where the studio's own preferences live, beside the strip's arrangement. */
const SETTINGS_KEY = "workbench.settings"

type Stored = {
  /**
   * The diff view's two: the committed side beside the working one or the two
   * interleaved, and whether whitespace is drawn.
   *
   * Here rather than per file, because it is how somebody reads a diff rather
   * than something about a particular one — and here rather than in the Settings
   * dialog, because the control is the toolbar over the diff itself, where the
   * effect of the click is the thing being looked at.
   */
  diffSideBySide: boolean
  diffWhitespace: boolean
  /**
   * Whether the `Changes` pane shows every changed file's diff in one scroll,
   * GitHub's "Files changed", rather than the one picked in the list. How
   * somebody reviews rather than something about a checkout, so one setting.
   * On by default. Not `changesAll`, its first name: that shipped off, and the
   * bag is written whole, so a `false` for it was on disk before anyone chose
   * it — a new key is what lets the default be the default.
   */
  changesStacked: boolean
  /** Whether the Explorer's tree lists dotfiles — the eye in its toolbar. */
  showHiddenFiles: boolean
  /**
   * `--model`, `--effort` and the `CLAUDE_CONFIG_DIR` profile the read-only
   * one-turn agent runs on — `draftCommitMessage` in `main/one-turn-agent.ts`.
   *
   * A setting rather than a picker beside each button: unlike a chat, one of
   * these turns is not something anybody sits in front of for the length of a
   * conversation — it is a button pressed once in a while — so a picker beside
   * it is a control mostly seen once and then in the way. Chosen here instead
   * and left alone until it is changed again. Null on both is the same "leave
   * it alone" a chat's `Inherit` row means.
   *
   * Named `review*` because the agent review these were introduced for is what
   * first needed them, and the names are what is **already on disk** under
   * `workbench.settings`: renaming them would silently reset the choice for
   * everybody who had made one. See `docs/design.md` § Comments.
   */
  reviewModel: string | null
  reviewEffort: ChatEffort | null
  reviewProfileId: string | null
  /**
   * What a drafted commit message must follow — a convention, a ticket prefix,
   * a language — as the user wrote it. Empty for none, which leaves the draft
   * to the style of the recent subjects alone.
   */
  commitRules: string
  /**
   * Whether the first-launch tour has been seen through or skipped. Written
   * here with the preferences rather than in its own key because Settings has
   * the button that unsets it — **Replay the tour** — and a flag the dialog
   * can flip belongs in the bag the dialog edits.
   */
  onboarded: boolean
  /**
   * The build whose release notes were last shown — or, on a fresh install,
   * the build that was installed. Null on anything written before the notes
   * existed. `lib/whats-new.ts` reads it.
   */
  seenVersion: string | null
  /**
   * The faint `who, when • why` after the caret's line in a file, and its hover
   * — `lib/editor-git-blame.ts`. On by default: it is the editor saying what
   * it knows about a line, and somebody who finds it noise turns it off once.
   */
  gitBlame: boolean
  /**
   * Every project's tabs in the strip at once, rather than only the project
   * being worked in (`inScope` in `lib/panels.ts`). Off by default: per project
   * is how the strip has always been, and nothing closes either way — turning
   * it back off only stops drawing the other projects' tabs.
   */
  allProjectTabs: boolean
  /**
   * The chat composer's field, dragged taller by its top edge — in pixels, or
   * null for the height its text gives it. One for every chat rather than per
   * chat: it is how much room somebody likes to write in, not something about a
   * conversation.
   */
  composerHeight: number | null
  /**
   * The projects column's Accounts foot, dragged taller or shorter by its top
   * edge — in pixels, or null for its own height up to a share of the column.
   */
  accountsHeight: number | null
  /** The Accounts foot folded down to its heading. */
  accountsCollapsed: boolean
  /**
   * What the default login is called, when somebody has named it — null for
   * its address (`defaultAccountName`). Here rather than with the profiles
   * because it is not one: it has no record of its own, being `~/.claude`.
   */
  defaultAccountLabel: string | null
  /**
   * The language the UI is drawn in — `lib/i18n`. `system` by default, so a
   * machine set to Vietnamese opens in Vietnamese without anybody finding the
   * row first.
   */
  language: LanguageChoice
} & Appearance

function isStored(value: unknown): value is Stored {
  // Every field is optional since `tabsPlacement` went, so this is the whole of
  // what tells a bag from a stored `null` — which would otherwise pass and be
  // spread over the defaults as though it had parsed. A leftover
  // `tabsPlacement` or `groupTabs` key is ignored rather than rejected: what is
  // on disk is left alone, and the next `save()` stops writing it.
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<Stored>
  return (
    // Absent from anything written before the diff flags existed, which is read
    // as the default.
    (record.diffSideBySide === undefined ||
      typeof record.diffSideBySide === "boolean") &&
    (record.diffWhitespace === undefined ||
      typeof record.diffWhitespace === "boolean") &&
    (record.changesStacked === undefined ||
      typeof record.changesStacked === "boolean") &&
    (record.showHiddenFiles === undefined ||
      typeof record.showHiddenFiles === "boolean") &&
    (record.reviewModel === undefined ||
      record.reviewModel === null ||
      typeof record.reviewModel === "string") &&
    (record.reviewEffort === undefined ||
      record.reviewEffort === null ||
      typeof record.reviewEffort === "string") &&
    (record.reviewProfileId === undefined ||
      record.reviewProfileId === null ||
      typeof record.reviewProfileId === "string") &&
    (record.commitRules === undefined ||
      typeof record.commitRules === "string") &&
    // The appearance choices are checked against their lists rather than as
    // strings: a name this build has no rule for would leave `data-palette`
    // pointing at nothing and the picker with no row lit.
    (record.palette === undefined || isAccentPalette(record.palette)) &&
    (record.fontSans === undefined || isSansFont(record.fontSans)) &&
    (record.fontMono === undefined || isMonoFont(record.fontMono)) &&
    (record.fontSize === undefined || isFontSize(record.fontSize)) &&
    (record.density === undefined || isDensity(record.density)) &&
    (record.onboarded === undefined || typeof record.onboarded === "boolean") &&
    (record.seenVersion === undefined ||
      record.seenVersion === null ||
      typeof record.seenVersion === "string") &&
    (record.gitBlame === undefined || typeof record.gitBlame === "boolean") &&
    (record.allProjectTabs === undefined ||
      typeof record.allProjectTabs === "boolean") &&
    (record.composerHeight === undefined ||
      record.composerHeight === null ||
      typeof record.composerHeight === "number") &&
    (record.accountsHeight === undefined ||
      record.accountsHeight === null ||
      typeof record.accountsHeight === "number") &&
    (record.accountsCollapsed === undefined ||
      typeof record.accountsCollapsed === "boolean") &&
    (record.defaultAccountLabel === undefined ||
      record.defaultAccountLabel === null ||
      typeof record.defaultAccountLabel === "string") &&
    (record.language === undefined || isLanguageChoice(record.language))
  )
}

type SettingsState = Stored & {
  /** Read from disk yet. The dialog waits on it rather than showing the
   * default for a frame and correcting itself. */
  loaded: boolean

  /** Whether the anonymous usage counts are sent. Outside `Stored` because
   * main reads it, and a bag only the renderer parses is not a thing both
   * sides can name; on by default — `TELEMETRY_KEY`. */
  telemetry: boolean

  setTelemetry: (on: boolean) => void
  setDiffSideBySide: (sideBySide: boolean) => void
  setDiffWhitespace: (show: boolean) => void
  setChangesStacked: (all: boolean) => void
  setShowHiddenFiles: (show: boolean) => void
  /** Sets the model and its effort together, the way a chat's `ModelMenu`
   * hands them over. */
  setReviewModel: (model: string | null, effort: ChatEffort | null) => void
  setReviewProfileId: (profileId: string | null) => void
  setCommitRules: (rules: string) => void
  /** The appearance choices, applied to the document by `applyAppearance`
   * (`lib/appearance.ts`) through a subscription rather than from here. */
  setPalette: (palette: Appearance["palette"]) => void
  setFontSans: (font: Appearance["fontSans"]) => void
  setFontMono: (font: Appearance["fontMono"]) => void
  setFontSize: (size: Appearance["fontSize"]) => void
  setDensity: (density: Appearance["density"]) => void
  setOnboarded: (onboarded: boolean) => void
  setSeenVersion: (version: string) => void
  setGitBlame: (on: boolean) => void
  setComposerHeight: (height: number | null) => void
  setAccountsHeight: (height: number | null) => void
  setAccountsCollapsed: (collapsed: boolean) => void
  /** Null gives the default login its address back. */
  setDefaultAccountLabel: (label: string | null) => void
  setAllProjectTabs: (on: boolean) => void
  /** Applied to the UI by `applyLanguage` through a subscription, the way
   * the appearance is. */
  setLanguage: (language: LanguageChoice) => void
  /** Reads the stored preferences. Called once, at launch. */
  restore: () => Promise<void>
}

/**
 * The preferences the Settings dialog edits.
 *
 * Separate from `lib/store.ts`, which holds what the workbench *is* doing —
 * the pane on screen, the folders, the strip's order. What is here is what the
 * user asked the studio to be like, which outlives any of that and is the list
 * the dialog is built from.
 */
export const useSettings = create<SettingsState>((set, get) => {
  /** Strict Mode mounts effects twice, so restoring has to be idempotent. */
  let restorePromise: Promise<void> | null = null

  /**
   * Writes the whole bag, from whatever the store now holds.
   *
   * One writer rather than each setter naming its neighbours: they share a key,
   * so a setter that listed two of the three fields would have written the
   * third back as absent — and absent reads as the default, which is a
   * preference silently undone by changing an unrelated one.
   */
  const save = () => {
    const {
      diffSideBySide,
      diffWhitespace,
      changesStacked,
      showHiddenFiles,
      reviewModel,
      reviewEffort,
      reviewProfileId,
      commitRules,
      palette,
      fontSans,
      fontMono,
      fontSize,
      density,
      onboarded,
      seenVersion,
      gitBlame,
      allProjectTabs,
      composerHeight,
      accountsHeight,
      accountsCollapsed,
      defaultAccountLabel,
      language,
    } = get()
    remember(SETTINGS_KEY, {
      diffSideBySide,
      diffWhitespace,
      changesStacked,
      showHiddenFiles,
      reviewModel,
      reviewEffort,
      reviewProfileId,
      commitRules,
      palette,
      fontSans,
      fontMono,
      fontSize,
      density,
      onboarded,
      seenVersion,
      gitBlame,
      allProjectTabs,
      composerHeight,
      accountsHeight,
      accountsCollapsed,
      defaultAccountLabel,
      language,
    })
  }

  return {
    // Side by side is what a diff is for — two columns to compare — and the
    // toolbar is one click away for a pane too narrow to hold them.
    diffSideBySide: true,
    diffWhitespace: false,
    changesStacked: true,
    // Shown, as the tree always has: a `.env` or `.github` is often the file
    // being looked for.
    showHiddenFiles: true,
    reviewModel: null,
    reviewEffort: null,
    reviewProfileId: null,
    commitRules: "",
    ...DEFAULT_APPEARANCE,
    // False until the tour has been seen: absent from anything written before
    // the tour existed, which is read as "show it once" rather than as a
    // preference somebody already made.
    onboarded: false,
    seenVersion: null,
    gitBlame: true,
    allProjectTabs: false,
    composerHeight: null,
    accountsHeight: null,
    accountsCollapsed: false,
    defaultAccountLabel: null,
    language: "system",
    telemetry: true,
    loaded: false,

    setTelemetry(telemetry) {
      set({ telemetry })
      void setSetting(TELEMETRY_KEY, telemetry ? "on" : "off")
    },

    setDiffSideBySide(diffSideBySide) {
      set({ diffSideBySide })
      save()
    },

    setDiffWhitespace(diffWhitespace) {
      set({ diffWhitespace })
      save()
    },

    setChangesStacked(changesStacked) {
      set({ changesStacked })
      save()
    },

    setShowHiddenFiles(showHiddenFiles) {
      set({ showHiddenFiles })
      save()
    },

    setReviewModel(reviewModel, reviewEffort) {
      set({ reviewModel, reviewEffort })
      save()
    },

    setReviewProfileId(reviewProfileId) {
      set({ reviewProfileId })
      save()
    },

    setCommitRules(commitRules) {
      set({ commitRules })
      save()
    },

    setPalette(palette) {
      set({ palette })
      save()
    },

    setFontSans(fontSans) {
      set({ fontSans })
      save()
    },

    setFontMono(fontMono) {
      set({ fontMono })
      save()
    },

    setFontSize(fontSize) {
      set({ fontSize })
      save()
    },

    setDensity(density) {
      set({ density })
      save()
    },

    setOnboarded(onboarded) {
      set({ onboarded })
      save()
    },

    setSeenVersion(seenVersion) {
      set({ seenVersion })
      save()
    },

    setGitBlame(gitBlame) {
      set({ gitBlame })
      save()
    },

    setAllProjectTabs(allProjectTabs) {
      set({ allProjectTabs })
      save()
    },

    setComposerHeight(composerHeight) {
      set({ composerHeight })
      save()
    },

    setAccountsHeight(accountsHeight) {
      set({ accountsHeight })
      save()
    },

    setAccountsCollapsed(accountsCollapsed) {
      set({ accountsCollapsed })
      save()
    },

    setDefaultAccountLabel(label) {
      set({ defaultAccountLabel: label?.trim() || null })
      save()
    },

    setLanguage(language) {
      set({ language })
      save()
    },

    restore() {
      restorePromise ??= (async () => {
        const [stored, telemetry] = await Promise.all([
          recall(SETTINGS_KEY, isStored),
          getSetting(TELEMETRY_KEY).catch(() => null),
        ])
        set({
          // Nothing stored is the default, not a failure: the spread of a null
          // leaves the initial state as it stands.
          ...stored,
          // Only `"off"` switches it off, so an unreadable or absent key is on
          // — the same reading main does, and the two must agree or the switch
          // would show one thing while the counts did another.
          telemetry: telemetry !== "off",
          loaded: true,
        })
      })()
      return restorePromise
    },
  }
})
