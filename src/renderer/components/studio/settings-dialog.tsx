import { useEffect, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  ArrowUpCircle,
  Columns2,
  ExternalLink,
  Keyboard,
  PanelTop,
  Play,
  Palette,
  RefreshCw,
  type LucideIcon,
} from "lucide-react"

import {
  ACCENT_PALETTES,
  isDensity,
  isFontSize,
  isMonoFont,
  isSansFont,
  MONO_FONT_LABELS,
  monoFontFamily,
  PALETTE_LABELS,
  SANS_FONT_LABELS,
  sansFontFamily,
} from "@/lib/appearance"
import { useAppBackground } from "@/lib/app-background"
import { FEEDBACK_REPO } from "@/lib/feedback"
import type { ClaudeVersions } from "@shared/api"
import { useSettings } from "@/lib/settings"
import {
  isLanguageChoice,
  LOCALE_NAMES,
  LOCALES,
  useT,
  type MessageKey,
} from "@/lib/i18n"
import { resolveSoundPack } from "@/lib/typing-sounds/choice"
import { previewSounds } from "@/lib/typing-sounds/engine"
import { useSoundPacks } from "@/lib/typing-sounds/store"
import { installLabel, pendingUpdate, useUpdates } from "@/lib/updates"
import type { SoundPackKind, SoundPackSource } from "@shared/sound-packs"
import { UpdateProgressBar } from "./update-progress"

/**
 * The studio's preferences — **Settings…** in the application menu, ⌘,.
 *
 * A dialog rather than a panel with a tab of its own: what is here is about
 * the workbench itself rather than about anything in the workspace, and a
 * preference read once and closed does not want a place in the strip beside
 * the files it is being read about. It is also the only honest home for a
 * setting whose effect *is* the strip — a tab is a poor place to be holding
 * the switch that moves the tabs.
 *
 * Laid out the way every settings window of this shape is: sections down the
 * left, one section's rows on the right, each row a name and a sentence with
 * its control at the far end. That is not decoration — it is what keeps the
 * dialog the same size as it grows. A single scrolling column is fine for the
 * three settings there are today and stops being fine at ten, and a list of
 * sections is also the only thing that says what *kinds* of preference exist
 * without reading all of them.
 *
 * There is no Save: a preference applies as it is picked, which is what makes
 * the studio behind the dialog its own preview. Everything written here goes
 * through `lib/settings.ts` and lands in the workspace's own settings, so it
 * survives a relaunch the way the strip's arrangement does.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [section, setSection] = useState<SectionId>("appearance")

  const current = SECTIONS.find((candidate) => candidate.id === section)!

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="grid h-[34rem] max-h-[85vh] w-full grid-cols-[12rem_1fr] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <nav
          aria-label={t("settings.sectionsLabel")}
          className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r bg-muted/30 p-2"
        >
          <p className="px-2 pt-1 pb-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            {t("settings.options")}
          </p>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              // `aria-current` rather than `role="tab"`: these are pages of a
              // dialog, not tabs of a panel, and the panel beside them is not
              // a tabpanel anyone should be able to arrow through.
              aria-current={id === section ? "page" : undefined}
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                id === section
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{t(label)}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-col">
          {/* `pr-12` clears the close button, which the dialog draws in the
              corner over whatever is there. */}
          <header className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>{t(current.label)}</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              {t(current.blurb)}
            </DialogDescription>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {section === "appearance" ? (
              <AppearanceSection onReplayTour={onClose} />
            ) : section === "tabs" ? (
              <TabsSection />
            ) : section === "background" ? (
              <BackgroundSection />
            ) : section === "sounds" ? (
              <SoundsSection />
            ) : (
              <UpdatesSection />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type SectionId = "appearance" | "tabs" | "sounds" | "background" | "updates"

/** The sections, in the order they are listed. Each one is a heading, a line
 * saying what it covers, and the rows below — kept together so adding a
 * section is one entry rather than three edits. */
const SECTIONS: {
  id: SectionId
  label: MessageKey
  blurb: MessageKey
  icon: LucideIcon
}[] = [
  {
    id: "appearance",
    label: "settings.sections.appearance",
    blurb: "settings.sections.appearanceBlurb",
    icon: Palette,
  },
  {
    id: "tabs",
    label: "settings.sections.tabs",
    blurb: "settings.sections.tabsBlurb",
    icon: Columns2,
  },
  {
    id: "sounds",
    label: "settings.sections.sounds",
    blurb: "settings.sections.soundsBlurb",
    icon: Keyboard,
  },
  {
    id: "background",
    label: "settings.sections.background",
    blurb: "settings.sections.backgroundBlurb",
    icon: PanelTop,
  },
  {
    id: "updates",
    label: "settings.sections.updates",
    blurb: "settings.sections.updatesBlurb",
    icon: ArrowUpCircle,
  },
]

/**
 * How the studio looks. Every row here applies as it is picked — the window
 * behind the dialog is the preview — through `applyAppearance`, which the
 * workbench subscribes to the settings store with; nothing in this section
 * touches the document itself.
 */
function AppearanceSection({ onReplayTour }: { onReplayTour: () => void }) {
  // `theme` is the choice, `resolvedTheme` what it came out as — the choice is
  // what a settings row is asking about, so `system` stays visible as `system`
  // rather than as whichever of the two it happens to be right now.
  const t = useT()
  const { theme, setTheme } = useTheme()
  const language = useSettings((state) => state.language)
  const setLanguage = useSettings((state) => state.setLanguage)
  const palette = useSettings((state) => state.palette)
  const setPalette = useSettings((state) => state.setPalette)
  const fontSans = useSettings((state) => state.fontSans)
  const setFontSans = useSettings((state) => state.setFontSans)
  const fontMono = useSettings((state) => state.fontMono)
  const setFontMono = useSettings((state) => state.setFontMono)
  const fontSize = useSettings((state) => state.fontSize)
  const setFontSize = useSettings((state) => state.setFontSize)
  const density = useSettings((state) => state.density)
  const setDensity = useSettings((state) => state.setDensity)
  const setOnboarded = useSettings((state) => state.setOnboarded)
  const backgroundImage = useAppBackground((state) => state.image)
  const chooseBackground = useAppBackground((state) => state.choose)
  const clearBackground = useAppBackground((state) => state.clear)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <Card>
        <Row
          title={t("settings.appearance.language")}
          description={t("settings.appearance.languageDescription")}
        >
          <Segmented
            value={language}
            options={[
              {
                value: "system",
                label: t("settings.appearance.languageSystem"),
              },
              ...LOCALES.map((locale) => ({
                value: locale,
                label: LOCALE_NAMES[locale],
              })),
            ]}
            onPick={(value) => {
              if (isLanguageChoice(value)) setLanguage(value)
            }}
          />
        </Row>
        <Row
          title={t("settings.appearance.theme")}
          description={t("settings.appearance.themeDescription")}
        >
          <Segmented
            value={theme ?? "system"}
            options={[
              {
                value: "system",
                label: t("settings.appearance.themeSystem"),
              },
              { value: "light", label: t("settings.appearance.themeLight") },
              { value: "dark", label: t("settings.appearance.themeDark") },
            ]}
            onPick={setTheme}
          />
        </Row>
        <Row
          title={t("settings.appearance.accent")}
          description={t("settings.appearance.accentDescription")}
        >
          <div role="radiogroup" className="flex items-center gap-1.5">
            {ACCENT_PALETTES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={candidate === palette}
                aria-label={PALETTE_LABELS[candidate]}
                title={PALETTE_LABELS[candidate]}
                // The swatch is the palette's own `--primary`: the same
                // `[data-palette]` rule the window reads, on a span instead of
                // `<html>`, so there is no second table of colours to keep in
                // step. It is the light accent in both modes, since the dark
                // rule wants `.dark` on the same element.
                data-palette={candidate}
                onClick={() => setPalette(candidate)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  candidate === palette
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                    : "ring-1 ring-border"
                )}
              >
                <span className="size-4 rounded-full bg-primary" />
              </button>
            ))}
          </div>
        </Row>
      </Card>

      <Card>
        <Row
          title={t("settings.appearance.font")}
          description={t("settings.appearance.fontDescription")}
        >
          <FontPicker
            value={fontSans}
            labels={SANS_FONT_LABELS}
            onPick={(value) => {
              if (isSansFont(value)) setFontSans(value)
            }}
          />
        </Row>
        <Row
          title={t("settings.appearance.monoFont")}
          description={t("settings.appearance.monoFontDescription")}
        >
          <FontPicker
            value={fontMono}
            labels={MONO_FONT_LABELS}
            onPick={(value) => {
              if (isMonoFont(value)) setFontMono(value)
            }}
          />
        </Row>
        <Row
          title={t("settings.appearance.fontSize")}
          description={t("settings.appearance.fontSizeDescription")}
        >
          <Segmented
            value={fontSize}
            options={[
              { value: "small", label: t("settings.appearance.sizeSmall") },
              {
                value: "default",
                label: t("settings.appearance.sizeDefault"),
              },
              { value: "large", label: t("settings.appearance.sizeLarge") },
            ]}
            onPick={(value) => {
              if (isFontSize(value)) setFontSize(value)
            }}
          />
        </Row>
        <Row
          title={t("settings.appearance.density")}
          description={t("settings.appearance.densityDescription")}
        >
          <Segmented
            value={density}
            options={[
              {
                value: "compact",
                label: t("settings.appearance.densityCompact"),
              },
              {
                value: "comfortable",
                label: t("settings.appearance.densityComfortable"),
              },
              {
                value: "spacious",
                label: t("settings.appearance.densitySpacious"),
              },
            ]}
            onPick={(value) => {
              if (isDensity(value)) setDensity(value)
            }}
          />
        </Row>
      </Card>

      <Card>
        <Row
          title={t("settings.appearance.background")}
          description={
            backgroundError ? (
              <span className="text-destructive">{backgroundError}</span>
            ) : (
              t("settings.appearance.backgroundDescription")
            )
          }
        >
          <div className="flex items-center gap-1.5">
            {backgroundImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void clearBackground()}
              >
                {t("common.remove")}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBackgroundError(null)
                chooseBackground().catch((error: unknown) =>
                  setBackgroundError(messageOfError(error))
                )
              }}
            >
              {backgroundImage
                ? t("settings.appearance.changePicture")
                : t("settings.appearance.choosePicture")}
            </Button>
          </div>
        </Row>
      </Card>

      <Card>
        <Row
          title={t("settings.appearance.tour")}
          description={t("settings.appearance.tourDescription")}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Unset first, then close: the tour is mounted by the workbench
              // off this flag, and it has to land over a window with no
              // dialog still holding focus.
              setOnboarded(false)
              onReplayTour()
            }}
          >
            {t("settings.appearance.replayTour")}
          </Button>
        </Row>
      </Card>
    </div>
  )
}

/** One of a short list of typefaces, each drawn in itself so the list is its
 * own preview — and so a family that is not installed is visibly the fallback
 * before it is picked. */
function FontPicker<Value extends string>({
  value,
  labels,
  onPick,
}: {
  value: Value
  labels: Record<Value, string>
  onPick: (value: string) => void
}) {
  const values = Object.keys(labels) as Value[]
  return (
    <Select
      value={value}
      items={labels}
      onValueChange={(next) => {
        if (typeof next === "string") onPick(next)
      }}
    >
      <SelectTrigger size="sm" className="w-52 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {values.map((candidate) => (
          <SelectItem
            key={candidate}
            value={candidate}
            className="text-xs"
            style={{ fontFamily: previewFamily(candidate) }}
          >
            {labels[candidate]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The stack a row is drawn in: a key is a sans or a mono name, never both. */
function previewFamily(value: string): string {
  if (isMonoFont(value) && value !== "system") return monoFontFamily(value)
  if (isSansFont(value) && value !== "system") return sansFontFamily(value)
  return "inherit"
}

function TabsSection() {
  const allProjectTabs = useSettings((state) => state.allProjectTabs)
  const setAllProjectTabs = useSettings((state) => state.setAllProjectTabs)
  const t = useT()

  return (
    <Card>
      <Row
        title={t("settings.tabs.allProjectTabs")}
        description={t("settings.tabs.allProjectTabsDescription")}
      >
        <Switch checked={allProjectTabs} onCheckedChange={setAllProjectTabs} />
      </Row>
    </Card>
  )
}

/**
 * Running in the menu bar, for the bots (`docs/design.md` § The menu bar, for
 * bots). Closing the window into the menu bar has no switch — it is what
 * keeps a bot running, and ⌘Q is the way out — so its row only says so.
 * `Open at login` is the OS's own login item, asked of main each time the
 * section opens rather than kept as a setting, since System Settings can
 * take it away without telling anybody.
 */
function BackgroundSection() {
  const t = useT()
  // `undefined` while asking, `null` where it cannot be offered.
  const [atLogin, setAtLogin] = useState<boolean | null | undefined>()

  useEffect(() => {
    void window.desktop.openAtLogin().then(setAtLogin)
  }, [])

  return (
    <Card>
      <Row
        title={t("settings.background.closing")}
        description={t("settings.background.closingDescription")}
      />
      <Row
        title={t("settings.background.openAtLogin")}
        description={
          atLogin === null
            ? t("settings.background.openAtLoginUnavailable")
            : t("settings.background.openAtLoginDescription")
        }
      >
        <Switch
          checked={atLogin === true}
          disabled={atLogin == null}
          onCheckedChange={(on) =>
            void window.desktop.setOpenAtLogin(on).then(setAtLogin)
          }
        />
      </Row>
    </Card>
  )
}

/**
 * The typing and click sounds (`lib/typing-sounds/`, `docs/design.md`
 * § Typing sounds): a card for the keyboard and one for the mouse — each on or
 * off, its Mechvibes pack and its volume — then what both share, and
 * importing more. Picking a pack plays it, so the list is its own preview — the
 * way the font picker draws each family in itself.
 */
function SoundsSection() {
  const t = useT()
  const typing = useSettings((state) => state.typingSounds)
  const release = useSettings((state) => state.typingSoundRelease)
  const setRelease = useSettings((state) => state.setTypingSoundRelease)
  const pitch = useSettings((state) => state.typingSoundPitch)
  const setPitch = useSettings((state) => state.setTypingSoundPitch)
  const setTypingPack = useSettings((state) => state.setTypingSoundPack)
  const setMousePack = useSettings((state) => state.setMouseSoundPack)
  const packs = useSoundPacks((state) => state.packs)
  const install = useSoundPacks((state) => state.install)
  const remove = useSoundPacks((state) => state.remove)
  const [importNote, setImportNote] = useState<{
    text: string
    error: boolean
  } | null>(null)

  useEffect(() => {
    void useSoundPacks.getState().refresh()
  }, [])

  const imported = packs?.filter((pack) => !pack.builtin) ?? []

  const importFrom = (source: SoundPackSource) => {
    setImportNote(null)
    install(source)
      .then((installed) => {
        if (!installed) return
        setImportNote({
          text: t(
            installed.replaced
              ? "settings.sounds.replacedPack"
              : "settings.sounds.importedPack",
            { name: installed.name }
          ),
          error: false,
        })
        // `install` has listed the packs again, so the new one's kind is
        // known — and it is picked in its own card, not the other's.
        const kind = useSoundPacks
          .getState()
          .packs?.find((pack) => pack.id === installed.id)?.kind
        if (!kind) return
        if (kind === "mouse") setMousePack(installed.id)
        else setTypingPack(installed.id)
        void previewSounds(kind, installed.id)
      })
      .catch((error: unknown) =>
        setImportNote({ text: messageOfError(error), error: true })
      )
  }

  return (
    <div className="space-y-4">
      <SoundKindCard kind="keyboard" />
      <SoundKindCard kind="mouse" />

      <Card>
        <Row
          title={t("settings.sounds.release")}
          description={t("settings.sounds.releaseDescription")}
        >
          <Switch checked={release} onCheckedChange={setRelease} />
        </Row>
        <Row
          title={t("settings.sounds.pitch")}
          description={t("settings.sounds.pitchDescription")}
        >
          <Switch checked={pitch} onCheckedChange={setPitch} />
        </Row>
        <Row title={t("settings.sounds.tryIt")} description="">
          <Input
            disabled={!typing}
            placeholder={t("settings.sounds.tryItPlaceholder")}
            className="h-8 w-56 text-xs"
          />
        </Row>
      </Card>

      <Card>
        <Row
          title={t("settings.sounds.importTitle")}
          description={
            importNote ? (
              <span className={cn(importNote.error && "text-destructive")}>
                {importNote.text}
              </span>
            ) : (
              t("settings.sounds.importDescription")
            )
          }
        >
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => importFrom("folder")}
            >
              {t("settings.sounds.importFolder")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importFrom("zip")}
            >
              {t("settings.sounds.importZip")}
            </Button>
          </div>
        </Row>
        {imported.map((pack) => (
          <Row
            key={pack.id}
            title={pack.name}
            description={[
              t(
                pack.kind === "mouse"
                  ? "settings.sounds.kindMouse"
                  : "settings.sounds.kindKeyboard"
              ),
              pack.author
                ? t("settings.sounds.by", { author: pack.author })
                : pack.id,
            ].join(" · ")}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImportNote(null)
                remove(pack.id).catch((error: unknown) =>
                  setImportNote({ text: messageOfError(error), error: true })
                )
              }}
            >
              {t("common.remove")}
            </Button>
          </Row>
        ))}
      </Card>
    </div>
  )
}

/** One kind's three rows — on, which pack, how loud — over its own settings. */
function SoundKindCard({ kind }: { kind: SoundPackKind }) {
  const t = useT()
  const keyboard = kind === "keyboard"
  const enabled = useSettings((state) =>
    keyboard ? state.typingSounds : state.mouseSounds
  )
  const setEnabled = useSettings((state) =>
    keyboard ? state.setTypingSounds : state.setMouseSounds
  )
  const chosen = useSettings((state) =>
    keyboard ? state.typingSoundPack : state.mouseSoundPack
  )
  const setChosen = useSettings((state) =>
    keyboard ? state.setTypingSoundPack : state.setMouseSoundPack
  )
  const volume = useSettings((state) =>
    keyboard ? state.typingSoundVolume : state.mouseSoundVolume
  )
  const setVolume = useSettings((state) =>
    keyboard ? state.setTypingSoundVolume : state.setMouseSoundVolume
  )
  const packs = useSoundPacks((state) => state.packs)
  // The slider's own value while it is dragged: the setting is written once,
  // on letting go, rather than as a settings file per pixel.
  const [dragged, setDragged] = useState<number | null>(null)

  const ofKind = packs?.filter((pack) => pack.kind === kind) ?? null
  const current = packs ? resolveSoundPack(chosen, packs, kind) : null
  const builtIn = ofKind?.filter((pack) => pack.builtin) ?? []
  const imported = ofKind?.filter((pack) => !pack.builtin) ?? []
  const labels = Object.fromEntries(
    (ofKind ?? []).map((pack) => [pack.id, pack.name])
  )
  const preview = (id: string | null) => {
    if (id) void previewSounds(kind, id)
  }

  const commitVolume = () => {
    if (dragged === null) return
    setVolume(dragged)
    setDragged(null)
    preview(current)
  }

  return (
    <Card>
      <Row
        title={t(
          keyboard ? "settings.sounds.enabled" : "settings.sounds.mouseEnabled"
        )}
        description={t(
          keyboard
            ? "settings.sounds.enabledDescription"
            : "settings.sounds.mouseEnabledDescription"
        )}
      >
        <Switch
          checked={enabled}
          onCheckedChange={(on) => {
            setEnabled(on)
            if (on) preview(current)
          }}
        />
      </Row>
      <Row
        title={t("settings.sounds.pack")}
        description={t(
          keyboard
            ? "settings.sounds.packDescription"
            : "settings.sounds.mousePackDescription"
        )}
      >
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings.sounds.preview")}
            title={t("settings.sounds.preview")}
            disabled={!current}
            onClick={() => preview(current)}
          >
            <Play className="size-3.5" />
          </Button>
          <Select
            value={current ?? ""}
            items={labels}
            disabled={!ofKind || ofKind.length === 0}
            onValueChange={(next) => {
              if (typeof next !== "string" || !next) return
              setChosen(next)
              preview(next)
            }}
          >
            <SelectTrigger size="sm" className="w-56 text-xs">
              <SelectValue
                placeholder={
                  packs
                    ? t("settings.sounds.noPacks")
                    : t("settings.sounds.packLoading")
                }
              />
            </SelectTrigger>
            <SelectContent align="end">
              {builtIn.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{t("settings.sounds.builtIn")}</SelectLabel>
                  {builtIn.map((pack) => (
                    <SelectItem
                      key={pack.id}
                      value={pack.id}
                      className="text-xs"
                    >
                      {pack.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {imported.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{t("settings.sounds.imported")}</SelectLabel>
                  {imported.map((pack) => (
                    <SelectItem
                      key={pack.id}
                      value={pack.id}
                      className="text-xs"
                    >
                      {pack.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
      </Row>
      <Row
        title={t("settings.sounds.volume")}
        description={t(
          keyboard
            ? "settings.sounds.volumeDescription"
            : "settings.sounds.mouseVolumeDescription"
        )}
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            aria-label={t("settings.sounds.volume")}
            value={Math.round((dragged ?? volume) * 100)}
            onChange={(event) =>
              setDragged(Number(event.currentTarget.value) / 100)
            }
            onPointerUp={commitVolume}
            onKeyUp={commitVolume}
            onBlur={commitVolume}
            className="w-40 accent-primary"
          />
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
            {Math.round((dragged ?? volume) * 100)}%
          </span>
        </div>
      </Row>
    </Card>
  )
}

/** What crossed the bridge as an error, without Electron's `Error invoking
 * remote method '…':` in front of the sentence main wrote. */
function messageOfError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
}

/**
 * Which build this is, and the button that replaces it.
 *
 * The same store the status bar's pill reads, and the same install — this page
 * exists because a pill that only appears when there is news cannot answer
 * "am I up to date?", and because somebody who skipped a version needs
 * somewhere to change their mind. So the dismissal is deliberately ignored
 * here: a section headed Updates is not a place to hide one.
 *
 * There is no "check automatically" switch. The check is one request every six
 * hours against a public endpoint, carrying nothing about the user — a
 * preference for that is a decision nobody has enough information to make, and
 * every setting costs a line somebody has to read.
 */
function UpdatesSection() {
  const check = useUpdates((state) => state.check)
  const checking = useUpdates((state) => state.checking)
  const installing = useUpdates((state) => state.installing)
  const progress = useUpdates((state) => state.progress)
  const error = useUpdates((state) => state.error)
  const refresh = useUpdates((state) => state.refresh)
  const install = useUpdates((state) => state.install)
  // Dismissal is the pill's business, not this page's.
  const update = useUpdates((state) => pendingUpdate(state, false))
  const [versions, setVersions] = useState<ClaudeVersions | null>(null)
  const telemetry = useSettings((state) => state.telemetry)
  const setTelemetry = useSettings((state) => state.setTelemetry)
  const t = useT()

  const askVersions = () =>
    void window.desktop.claudeVersions().then(setVersions)
  // Asked on open rather than at launch: the CLI updates itself, so the answer
  // is worth having only when somebody is looking at it.
  useEffect(askVersions, [])

  return (
    <Card>
      <Row
        title={t("settings.updates.version")}
        description={
          !check
            ? t("common.checking")
            : t(
                check.status === "current"
                  ? "settings.updates.latest"
                  : "settings.updates.current",
                { version: check.current }
              )
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={checking}
          onClick={() => {
            askVersions()
            void refresh()
          }}
        >
          <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
          {t("settings.updates.checkNow")}
        </Button>
      </Row>

      <Row
        title={t("settings.updates.claudeCode")}
        description={
          !versions
            ? t("common.checking")
            : `CLI ${versions.cli ?? t("settings.updates.cliNotFound")} · Agent SDK ${versions.sdk}${
                versions.error ? ` — ${versions.error}` : ""
              }`
        }
      />

      {update ? (
        <Row
          title={t("settings.updates.available", { version: update.version })}
          description={
            installing ? (
              // The bar takes the description's place rather than sitting under
              // the button: it is what this row is about while it is on screen,
              // and the sentence it replaces is one the user has just acted on.
              <span className="mt-1.5 block max-w-xs">
                <UpdateProgressBar progress={progress} />
              </span>
            ) : update.installable ? (
              t("settings.updates.restartNote")
            ) : (
              t("settings.updates.notInstallable")
            )
          }
        >
          <div className="flex items-center gap-2">
            <a
              href={update.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t("settings.updates.whatsNew")}
              <ExternalLink className="size-3" />
            </a>
            {update.installable && (
              <Button
                size="sm"
                disabled={installing}
                onClick={() => void install()}
              >
                {installLabel(installing, progress)}
              </Button>
            )}
          </div>
        </Row>
      ) : (
        check?.status === "unknown" && (
          // Said out loud rather than left as silence: "no update" and "could
          // not ask" look identical otherwise, and only one of them means the
          // version on screen is worth trusting.
          <Row
            title={t("settings.updates.couldNotCheck")}
            description={check.error}
          >
            <a
              href={`${FEEDBACK_REPO}/releases`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t("settings.updates.releases")}
              <ExternalLink className="size-3" />
            </a>
          </Row>
        )
      )}

      {error && (
        <p className="px-4 pb-3 text-xs leading-relaxed text-destructive">
          {error} {t("settings.updates.installerLog")}{" "}
          <code className="font-mono">~/.veystudio/update.log</code>.
        </p>
      )}

      {/* Beside the version because it is the other thing this app says to a
          server on its own, and the sentence under it is the whole of what is
          sent — see `main/telemetry.ts`. */}
      <Row
        title={t("settings.updates.telemetry")}
        description={t("settings.updates.telemetryDescription")}
      >
        <Switch checked={telemetry} onCheckedChange={setTelemetry} />
      </Row>
    </Card>
  )
}

/** The box a section's rows sit in — one border around the group rather than
 * one per row, so a section of three reads as three rows of one thing. */
function Card({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-lg border">{children}</div>
}

/** One setting: what it is, what it does, and the control at the end of the
 * line. There was a `stacked` variant for a control too big for that — the tab
 * strip's two placement pictures — and it went with them. */
function Row({
  title,
  description,
  children,
}: {
  title: string
  /** A sentence, all but always — `ReactNode` because the update row swaps its
   * own for a progress bar while an install runs. */
  description: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex gap-6 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm leading-none font-medium">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  )
}

/** A handful of exclusive choices, short enough to show all at once. */
function Segmented({
  value,
  options,
  onPick,
}: {
  value: string
  options: { value: string; label: string }[]
  onPick: (value: string) => void
}) {
  return (
    <div role="radiogroup" className="flex rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(option.value)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-background font-medium text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
