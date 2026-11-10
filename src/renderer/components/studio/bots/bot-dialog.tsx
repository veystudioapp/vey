import { useId, useState, type FormEvent, type ReactNode } from "react"

import {
  DEFAULT_CHAT_OPTIONS,
  type BotInput,
  type BotSchedule,
  type ChatPermission,
  type WorkspaceFolder,
} from "@shared/api"
import { BOT_HOURS, BOT_PERMISSIONS, clockOf } from "@shared/bots"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { BotForm } from "@/lib/bots/store"
import { useClaudeProfiles } from "@/lib/chat/claude-profiles"
import { useAgentModels } from "@/lib/chat/models"
import { useLocale, useT } from "@/lib/i18n"
import { checkoutsOf } from "@/lib/project-checkouts"
import { useStudio } from "@/lib/store"
import { cn } from "@/lib/utils"
import { WEEK_ORDER, weekdayName } from "./schedule-text"

/**
 * A bot's form: what it says, when, and the toolbar its chats open on. A
 * draft until Save; main narrows it (`botInputOf`) and pushes the list back.
 */
export function BotDialog({
  project,
  form,
  onClose,
}: {
  project: WorkspaceFolder
  form: BotForm | null
  onClose: () => void
}) {
  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {/* Mounted per opening, so the draft starts from what is saved. */}
        {form && <Form project={project} form={form} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** Electron puts `Error invoking remote method '…':` ahead of main's sentence. */
function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ""
  )
}

const WEEKDAYS = [1, 2, 3, 4, 5]
/** The default account, as a `Select` value — its items cannot be null. */
const NO_PROFILE = "__default"

function Form({
  project,
  form,
  onDone,
}: {
  project: WorkspaceFolder
  form: BotForm
  onDone: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const start: Partial<BotInput> = form.bot ?? form.draft ?? {}
  const folders = useStudio((state) => state.folders)
  const checkouts = checkoutsOf(folders, project)
  const profiles = useClaudeProfiles((state) => state.profiles)

  const [name, setName] = useState(start.name ?? "")
  const [prompt, setPrompt] = useState(start.prompt ?? "")
  const [schedule, setSchedule] = useState<BotSchedule>(
    start.schedule ?? { kind: "daily", time: "09:00", days: WEEKDAYS }
  )
  const [folderId, setFolderId] = useState(start.folderId ?? project.id)
  const [options, setOptions] = useState(() => ({
    ...DEFAULT_CHAT_OPTIONS,
    permission: "read" as ChatPermission,
    ...start.options,
  }))
  const [quiet, setQuiet] = useState(start.quiet ?? true)
  const [enabled, setEnabled] = useState(start.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const models = useAgentModels(options.profileId ?? null)

  const ready =
    name.trim() !== "" &&
    prompt.trim() !== "" &&
    schedule.days.length > 0 &&
    // A time field emptied by its own clear button reads as "".
    (schedule.kind !== "daily" || clockOf(schedule.time) !== null)

  const toggleDay = (day: number) =>
    setSchedule((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((each) => each !== day)
        : [...current.days, day],
    }))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      await window.desktop.saveBot({
        id: form.bot?.id ?? crypto.randomUUID(),
        projectId: project.id,
        folderId,
        name,
        prompt,
        schedule,
        options,
        quiet,
        enabled,
      })
      onDone()
    } catch (caught) {
      setError(reasonOf(caught))
    } finally {
      setSaving(false)
    }
  }

  const hoursLabel = (hours: number) => t("bots.form.hours", { count: hours })
  const modelItems = Object.fromEntries(
    models.map((model) => [model.value, model.label])
  )
  // A saved model this account's list no longer has still has to draw.
  if (options.model && !(options.model in modelItems)) {
    modelItems[options.model] = options.model
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogHeader className="gap-0.5 px-5 pt-5 pr-12 pb-3">
        <DialogTitle>
          {form.bot ? t("bots.form.editTitle") : t("bots.form.newTitle")}
        </DialogTitle>
        <DialogDescription className="truncate text-xs">
          {project.name}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 text-xs">
        <Field label={t("bots.form.name")}>
          {(id) => (
            <Input
              id={id}
              value={name}
              autoFocus={!form.bot}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("bots.form.prompt")} hint={t("bots.form.promptHint")}>
          {(id) => (
            <Textarea
              id={id}
              value={prompt}
              rows={6}
              className="max-h-64 font-mono text-xs"
              onChange={(event) => setPrompt(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("bots.form.when")}>
          {() => (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Select
                  value={schedule.kind}
                  items={{
                    daily: t("bots.form.daily"),
                    every: t("bots.form.every"),
                  }}
                  onValueChange={(next) =>
                    setSchedule((current) =>
                      next === "every"
                        ? { kind: "every", hours: 3, days: current.days }
                        : next === "daily"
                          ? { kind: "daily", time: "09:00", days: current.days }
                          : current
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={t("bots.form.when")}
                    className="h-8 w-44 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily" className="text-xs">
                      {t("bots.form.daily")}
                    </SelectItem>
                    <SelectItem value="every" className="text-xs">
                      {t("bots.form.every")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {schedule.kind === "daily" ? (
                  <Input
                    type="time"
                    aria-label={t("bots.form.when")}
                    value={schedule.time}
                    className="h-8 w-28 text-xs"
                    onChange={(event) =>
                      setSchedule({ ...schedule, time: event.target.value })
                    }
                  />
                ) : (
                  <Select
                    value={String(schedule.hours)}
                    items={Object.fromEntries(
                      BOT_HOURS.map((hours) => [
                        String(hours),
                        hoursLabel(hours),
                      ])
                    )}
                    onValueChange={(next) => {
                      if (typeof next === "string") {
                        setSchedule({ ...schedule, hours: Number(next) })
                      }
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t("bots.form.every")}
                      className="h-8 w-28 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOT_HOURS.map((hours) => (
                        <SelectItem
                          key={hours}
                          value={String(hours)}
                          className="text-xs"
                        >
                          {hoursLabel(hours)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div
                className="flex gap-1"
                role="group"
                aria-label={t("bots.form.days")}
              >
                {WEEK_ORDER.map((day) => {
                  const on = schedule.days.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "h-7 min-w-10 rounded-md border px-2 text-[0.6875rem]",
                        on
                          ? "border-primary/50 bg-primary/15 text-foreground"
                          : "text-muted-foreground hover:bg-accent/40"
                      )}
                    >
                      {weekdayName(locale, day)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Field>

        {checkouts.length > 1 && (
          <Field label={t("bots.form.checkout")}>
            {() => (
              <Select
                value={folderId}
                items={Object.fromEntries(
                  checkouts.map((folder) => [folder.id, folder.name])
                )}
                onValueChange={(next) => {
                  if (typeof next === "string") setFolderId(next)
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {checkouts.map((folder) => (
                    <SelectItem
                      key={folder.id}
                      value={folder.id}
                      className="text-xs"
                    >
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label={t("bots.form.account")}>
            {() => (
              <Select
                value={options.profileId ?? NO_PROFILE}
                items={{
                  [NO_PROFILE]: t("bots.form.defaultAccount"),
                  ...Object.fromEntries(
                    profiles.map((profile) => [profile.id, profile.name])
                  ),
                }}
                onValueChange={(next) => {
                  if (typeof next !== "string") return
                  setOptions({
                    ...options,
                    profileId: next === NO_PROFILE ? null : next,
                  })
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROFILE} className="text-xs">
                    {t("bots.form.defaultAccount")}
                  </SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem
                      key={profile.id}
                      value={profile.id}
                      className="text-xs"
                    >
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label={t("bots.form.model")}>
            {() => (
              <Select
                value={options.model ?? "default"}
                items={modelItems}
                onValueChange={(next) => {
                  if (typeof next === "string") {
                    setOptions({ ...options, model: next })
                  }
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modelItems).map(([value, label]) => (
                    <SelectItem key={value} value={value} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label={t("bots.form.permission")}>
            {() => (
              <Select
                value={options.permission}
                items={Object.fromEntries(
                  BOT_PERMISSIONS.map((permission) => [
                    permission,
                    t(`chat.permission.${permission}.label`),
                  ])
                )}
                onValueChange={(next) => {
                  if (BOT_PERMISSIONS.includes(next as ChatPermission)) {
                    setOptions({
                      ...options,
                      permission: next as ChatPermission,
                    })
                  }
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-72">
                  {BOT_PERMISSIONS.map((permission) => (
                    <SelectItem
                      key={permission}
                      value={permission}
                      className="text-xs"
                    >
                      <span className="flex flex-col">
                        <span>{t(`chat.permission.${permission}.label`)}</span>
                        <span className="text-[0.6875rem] text-muted-foreground">
                          {t(`chat.permission.${permission}.detail`)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>

        <SwitchRow
          label={t("bots.form.quiet")}
          hint={t("bots.form.quietHint")}
          on={quiet}
          onChange={setQuiet}
        />
        <SwitchRow
          label={t("bots.form.enabled")}
          on={enabled}
          onChange={setEnabled}
        />

        {error && <p className="text-destructive">{error}</p>}
      </div>

      <DialogFooter className="m-0 rounded-b-xl px-5 py-3">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t("bots.form.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!ready || saving}>
          {saving ? t("bots.form.saving") : t("bots.form.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** A label over its control, and a line under it where one helps. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SwitchRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint?: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && (
          <span className="block text-[0.6875rem] text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <Switch id={id} checked={on} onCheckedChange={onChange} />
    </label>
  )
}
