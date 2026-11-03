import { useState, type FormEvent, type ReactNode } from "react"
import { Info } from "lucide-react"

import type { ClaudeProfile } from "@shared/api"
import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useClaudeProfiles } from "@/lib/chat/claude-profiles"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Endpoints somebody is likely to have a key for, as a click that fills the
 * base URL. Only the URL: model names move faster than this list would, and
 * several of these map Claude's names themselves — the fields under it say
 * where to look.
 */
const PRESETS: { name: string; baseUrl: string }[] = [
  { name: "Z.ai (GLM)", baseUrl: "https://api.z.ai/api/anthropic" },
  { name: "Kimi", baseUrl: "https://api.moonshot.ai/anthropic" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/anthropic" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api" },
]

/**
 * A custom API profile's form, in the login dialog — for a new one, or the
 * one on a row (`profile`). Saved through main, which seals the key and
 * checks the address; its sentence is shown under the fields.
 *
 * Editing leaves the key empty: it never comes back from main, and an empty
 * field keeps the one sealed there.
 */
export function ApiForm({
  title,
  profile,
  onDone,
  onCancel,
}: {
  title: string
  profile: ClaudeProfile | null
  onDone: () => void
  onCancel: () => void
}) {
  const t = useT()
  const saveApi = useClaudeProfiles((state) => state.saveApi)
  const [name, setName] = useState(profile?.name ?? "")
  const [baseUrl, setBaseUrl] = useState(profile?.api?.baseUrl ?? "")
  const [token, setToken] = useState("")
  const [model, setModel] = useState(profile?.api?.model ?? "")
  const [fastModel, setFastModel] = useState(profile?.api?.fastModel ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = baseUrl.trim() !== "" && (profile !== null || token.trim())

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready || saving) return
    setSaving(true)
    setError(null)
    saveApi({
      id: profile?.id ?? crypto.randomUUID(),
      name: name.trim() || hostOf(baseUrl) || "API",
      api: { baseUrl, model, fastModel },
      token: token.trim() || null,
    })
      .then(onDone)
      .catch((reason: unknown) => {
        // Main's own sentence, past Electron's "Error invoking remote
        // method …:" wrapper.
        const message =
          reason instanceof Error ? reason.message : String(reason)
        setError(
          message.replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ""
          )
        )
      })
      .finally(() => setSaving(false))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="truncate pr-6">{title}</DialogTitle>
        <DialogDescription>{t("projects.api.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.baseUrl}
            type="button"
            onClick={() => {
              setBaseUrl(preset.baseUrl)
              if (!name.trim()) setName(preset.name)
            }}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50",
              baseUrl === preset.baseUrl && "border-primary/60 bg-accent/60"
            )}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Field id="api-name" label={t("projects.api.name")}>
          <Input
            id="api-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={hostOf(baseUrl) ?? t("projects.api.namePlaceholder")}
          />
        </Field>
        <Field id="api-url" label={t("projects.api.baseUrl")}>
          <Input
            id="api-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://…"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs placeholder:font-sans"
          />
        </Field>
        <Field id="api-key" label={t("projects.api.key")}>
          <Input
            id="api-key"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              profile
                ? t("projects.api.keyKeep")
                : t("projects.api.keyPlaceholder")
            }
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs placeholder:font-sans"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field id="api-model" label={t("projects.api.model")}>
            <Input
              id="api-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={t("projects.api.modelPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs placeholder:font-sans"
            />
          </Field>
          <Field id="api-fast" label={t("projects.api.fastModel")}>
            <Input
              id="api-fast"
              value={fastModel}
              onChange={(event) => setFastModel(event.target.value)}
              placeholder={model.trim() || t("projects.api.modelPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs placeholder:font-sans"
            />
          </Field>
        </div>
      </div>

      <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t("projects.api.note")}
      </p>

      {error && (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!ready || saving}>
          {saving ? t("projects.api.saving") : t("projects.api.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  )
}

function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).host || null
  } catch {
    return null
  }
}
