import { useEffect, useState } from "react"

import {
  CHAT_MODEL_FALLBACK,
  DEFAULT_CHAT_EFFORT,
  type AgentModel,
  type ChatEffort,
} from "@shared/api"

import { useClaudeProfiles } from "./claude-profiles"
import { modelLabel } from "./usage"

/**
 * The models the user's own `claude` offers, for the composer's toolbar.
 *
 * A hook rather than a store because there is nothing to keep: the list is
 * whatever the CLI said, it does not change while the app is running, and
 * nothing writes to it. Main holds the answer for the run (`agent-models.ts`)
 * and this holds it for the window, so the second composer to mount gets it
 * without a round trip and the picker has its labels before it is opened —
 * which is the reason this runs on mount rather than on the menu opening: the
 * toolbar button draws the *name* of the chosen model, and a button that says
 * `opus` until somebody clicks it is a button that was waiting for nothing.
 *
 * The fallback stands in whenever the ask came back with nothing — a `claude`
 * that is not installed yet, or a spawn that timed out — because a picker with
 * no rows is a chat nobody can change the model of. It is deliberately three
 * aliases and not a guess at this machine's list; see `CHAT_MODEL_FALLBACK`.
 */

/** Shared by every composer in the window, by profile (`""` for none) and its
 * endpoint: the promise, so two mounting at once make one call, and the
 * answer, so a later one makes none. Per profile because `default` resolves
 * per account — see `main/agent-models.ts`. */
const asked = new Map<string, Promise<AgentModel[]>>()
const held = new Map<string, AgentModel[]>()
/** Profiles whose list is being asked again, for the picker's spinner. */
const reloading = new Set<string>()
/** Every mounted `useAgentModels`, so a reload redraws all of them — the
 * composer that asked and any other on the same account. */
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

/**
 * Asks `claude` again, past both holds — the picker's reload button.
 *
 * An empty answer keeps the list already drawn rather than dropping to the
 * fallback: a reload that timed out is not news that the account lost its
 * models.
 */
export async function reloadAgentModels(
  profileId: string | null
): Promise<void> {
  const key = profileId ?? ""
  if (reloading.has(key)) return
  reloading.add(key)
  changed()
  try {
    const answer = await window.desktop.agentModels(profileId, true)
    if (answer.length > 0 || !held.has(key)) {
      held.set(key, mergeModels(CHAT_MODEL_FALLBACK, answer))
    }
  } catch (error: unknown) {
    console.error("Could not reload the model list", error)
  } finally {
    reloading.delete(key)
    changed()
  }
}

export function isReloadingModels(profileId: string | null): boolean {
  return reloading.has(profileId ?? "")
}

/**
 * What the CLI answered, with the preset's own trimmings where a row matches.
 *
 * **The CLI's list is the list**, and the preset is only what stands in when
 * there is no answer at all. It was the other way round — every preset row kept,
 * the answer used only to correct their effort levels — and what that did was
 * put models on the picker that the account does not have: `Sonnet 5 1M` and
 * five other invented aliases were offered on every machine, and picking one
 * failed the turn on its argument list, because `--model sonnet-5-1m` names
 * nothing. Which models exist is a property of the account and the CLI version
 * behind it (see `AgentModel`), so it is not something this file can hold a copy
 * of.
 *
 * A preset row is still read for the two things the CLI does not send — the
 * picker's `order` and its badges — and only where the `value` matches, so it
 * decorates rather than adds.
 */
export function mergeModels(
  preset: AgentModel[],
  discovered: AgentModel[]
): AgentModel[] {
  if (discovered.length === 0) return preset
  const presets = new Map(preset.map((model) => [model.value, model]))
  return discovered.map((model) => {
    const known = presets.get(model.value)
    if (!known) return model
    return {
      ...model,
      ...(known.order !== undefined ? { order: known.order } : {}),
    }
  })
}

export function useAgentModels(profileId: string | null): AgentModel[] {
  // A custom API profile's endpoint is part of what its list is — see `keyOf`
  // in `main/agent-models.ts` — so an edit to it is asked again here too.
  const endpoint = useClaudeProfiles((state) => {
    const api = state.profiles.find((profile) => profile.id === profileId)?.api
    return api ? [api.baseUrl, api.model, api.fastModel].join("\0") : ""
  })
  const key = `${profileId ?? ""}\0${endpoint}`
  // Only to draw again once the answer is in `held`, which is what is read.
  const [, answered] = useState(0)

  useEffect(() => {
    const listener = () => answered((count) => count + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (held.has(key)) return
    let mounted = true
    let asking = asked.get(key)
    if (!asking) {
      asking = window.desktop.agentModels(profileId)
      asked.set(key, asking)
    }
    void asking
      .then((answer) => {
        // A reload that landed first is the newer answer.
        if (!held.has(key)) {
          held.set(key, mergeModels(CHAT_MODEL_FALLBACK, answer))
        }
        if (mounted) answered((count) => count + 1)
      })
      .catch((error: unknown) => {
        asked.delete(key)
        console.error("Could not read the model list", error)
      })
    return () => {
      mounted = false
    }
  }, [key, profileId])

  const other = held.values().next().value
  if (held.has(key) || !other) return held.get(key) ?? CHAT_MODEL_FALLBACK
  // Kept per list so a render returns the same array as the last: callers
  // put this in effect dependencies.
  let shown = standIns.get(other)
  if (!shown) {
    shown = standIn(other)
    standIns.set(other, shown)
  }
  return shown
}

const standIns = new WeakMap<AgentModel[], AgentModel[]>()

/**
 * What a profile not asked about yet draws for the second its ask takes.
 *
 * Another account's list, with what its `default` resolves to taken off. The
 * rows themselves can differ too — a Team login listed thirteen where a
 * personal one listed five — but a row this account lacks is on screen for the
 * second the ask takes, while a wrong default name is what the toolbar draws:
 * left on, a switch from that Team login to the personal one drew `Haiku 5.5`
 * over a chat about to answer on Opus. Off, the toolbar says
 * `Default (recommended)` for that second, a missing name rather than a wrong
 * one.
 */
export function standIn(other: AgentModel[]): AgentModel[] {
  return other.map((entry) => {
    if (entry.value !== "default") return entry
    const unnamed = { ...entry }
    delete unnamed.resolvedModel
    return unnamed
  })
}

/**
 * The order the picker draws them in.
 *
 * The CLI answers in an order of its own — `default`, `sonnet`, `fable`,
 * `opus[1m]`, `haiku`, `opus` on the machine this was written on — which reads
 * as a bug in a menu. So `default` keeps the top, because it is the CLI's own
 * recommendation and the row a new chat is on, and the rest go by name. By name
 * rather than by capability on purpose: this app knows nothing about which model
 * is the strongest, and an order implying it would be a ranking somebody trusts.
 */
export function orderedModels(models: AgentModel[]): AgentModel[] {
  return [...models].sort((left, right) => {
    if (left.value === "default") return -1
    if (right.value === "default") return 1
    if (left.order !== undefined && right.order !== undefined) {
      return left.order - right.order
    }
    if (left.order !== undefined) return -1
    if (right.order !== undefined) return 1
    return left.label.localeCompare(right.label)
  })
}

/**
 * What `Default (recommended)` is, in the name of a model somebody recognises.
 *
 * The CLI's `default` row is a recommendation rather than a model: its label
 * names nothing, so a picker that drew it alone put its tick on a word, and the
 * one question the menu exists to answer — which model is answering — had no
 * answer anywhere on screen. `resolvedModel` is the wire id behind a row, so the
 * alias row sharing the default's is the default under a name (`Sonnet`).
 *
 * Null wherever that cannot be said honestly: a CLI old enough not to send the
 * field, and a default whose id no other row carries. Both draw the row as it
 * was, which is the failure this is allowed to have — a missing suffix, not a
 * wrong one. The row itself is deliberately **not** replaced by the alias: they
 * are the same model today and `default` is the one that follows the account.
 */
export function defaultModelAlias(models: AgentModel[]): string | null {
  const fallback = models.find((entry) => entry.value === "default")
  if (!fallback?.resolvedModel) return null
  const named = models.find(
    (entry) =>
      entry.value !== "default" &&
      entry.resolvedModel === fallback.resolvedModel
  )
  return named?.label ?? null
}

/**
 * The name of the model a chat's CLI reports answering, for a `default` chat.
 *
 * The picker's row that carries the same wire id is the name the menu already
 * uses for it. When no row does — a model the picker was not asked about, or a
 * CLI old enough not to send `resolvedModel` — the id is read into a name the
 * way the usage line reads it (`claude-opus-5-5` as `Opus 5.5`). Null when no
 * answer has come yet, so the caller falls back to `defaultModelAlias`.
 */
export function answeringName(
  models: AgentModel[],
  answering: string | undefined
): string | null {
  if (!answering) return null
  const row = models.find(
    (entry) => entry.value !== "default" && entry.resolvedModel === answering
  )
  return row?.label ?? modelLabel(answering)
}

/**
 * The level a pick lands on, given the levels the model in question takes.
 *
 * Every pick goes through this rather than through a `Default` row, which is
 * the whole of that change: the record carries a level the toolbar can tick and
 * main can pass, instead of a null that meant "ask the CLI" and read on screen
 * as nothing at all. Keeps the level already chosen where the new model accepts
 * it — switching Sonnet to Opus is not a reason to lose `Very high` — and falls
 * to `DEFAULT_CHAT_EFFORT` otherwise, or to the strongest level below it for a
 * model whose list stops short.
 */
export function effortFor(
  levels: ChatEffort[],
  effort: ChatEffort | null
): ChatEffort | null {
  if (levels.length === 0) return null
  if (effort && levels.includes(effort)) return effort
  if (levels.includes(DEFAULT_CHAT_EFFORT)) return DEFAULT_CHAT_EFFORT
  // The list is weakest first, so the last one is as close as this model gets.
  return levels[levels.length - 1] ?? null
}
