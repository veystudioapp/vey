import { create } from "zustand"

import type { PlanUsage, PlanWindow } from "@shared/api"
import { t, type MessageKey } from "@/lib/i18n"

/**
 * The composer's plan-usage meter: how much of the claude.ai plan's five-hour
 * and seven-day windows the chat's account has used. The asking is main's
 * (`main/plan-usage.ts`); the words and the store are here, the words tested in
 * `test/plan-usage.ts`.
 */

/** A window's name as a person says it. A key this build has never heard of
 * is drawn as the CLI wrote it, underscores opened up, rather than not at all. */
export function windowLabel(id: string): string {
  const known: Record<string, MessageKey> = {
    five_hour: "chat.planUsage.window.fiveHour",
    seven_day: "chat.planUsage.window.sevenDay",
    seven_day_opus: "chat.planUsage.window.sevenDayOpus",
    seven_day_sonnet: "chat.planUsage.window.sevenDaySonnet",
    seven_day_oauth_apps: "chat.planUsage.window.sevenDayApps",
  }
  const key = known[id]
  return key ? t(key) : id.replace(/_/g, " ")
}

/** The short form on the toolbar button — `5h`, `7d`, or the long label. */
export function windowShort(id: string): string {
  if (id === "five_hour") return t("chat.planUsage.short.fiveHour")
  if (id === "seven_day") return t("chat.planUsage.short.sevenDay")
  return windowLabel(id)
}

/**
 * The window the button shows: the five-hour one when there is one, because it
 * is the one that stops a working afternoon — and otherwise whichever is
 * fullest, since that is the limit that will be hit first.
 */
export function headlineWindow(windows: PlanWindow[]): PlanWindow | null {
  if (windows.length === 0) return null
  return (
    windows.find((window) => window.id === "five_hour") ??
    [...windows].sort((a, b) => b.utilization - a.utilization)[0]!
  )
}

/** How worried to look: amber from 80%, red from 95%. */
export function usageTone(utilization: number): "ok" | "warn" | "high" {
  if (utilization >= 95) return "high"
  if (utilization >= 80) return "warn"
  return "ok"
}

/** `42%` — whole percents, since the CLI's own figure is no finer than that. */
export function percent(utilization: number): string {
  return `${Math.round(utilization)}%`
}

/**
 * When a window resets, as somebody planning around it wants it said: in
 * hours and minutes while that is under a day, and as a weekday and time past
 * that — "resets in 3d 4h" is arithmetic, "resets Thu 14:00" is a plan.
 */
export function resetLabel(resetsAt: string | null, now: Date): string | null {
  if (!resetsAt) return null
  const at = new Date(resetsAt)
  const ms = at.getTime() - now.getTime()
  if (Number.isNaN(ms)) return null
  if (ms <= 0) return t("chat.planUsage.resetsNow")
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return t("chat.planUsage.resetsInMinutes", { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0
      ? t("chat.planUsage.resetsInHours", { hours })
      : t("chat.planUsage.resetsInHoursMinutes", { hours, minutes: rest })
  }
  const day = at.toLocaleDateString(undefined, { weekday: "short" })
  const time = at.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
  return t("chat.planUsage.resetsAt", { day, time })
}

/** Whether a window's reset is already behind `now` — asked of the time rather
 * than of `resetLabel`'s words, which are in whatever language is showing. */
export function isResetDue(resetsAt: string | null, now: Date): boolean {
  if (!resetsAt) return false
  const ms = new Date(resetsAt).getTime() - now.getTime()
  return !Number.isNaN(ms) && ms <= 0
}

/**
 * The `limit` line: `Stopped. you@example.com reached its 5-hour limit ·
 * resets in 3h 8m`. Without a window, the CLI's own sentence after `Stopped.`
 * — it is the only account there is of which limit — and the reset only when
 * it is still ahead: a line read back the next day is about a limit long gone,
 * and "resets now" under it would read as a promise.
 */
export function limitSentence(
  who: string,
  limit: { window: string | null; resetsAt: string | null; text: string },
  now: Date
): string {
  const what = limit.window
    ? t("chat.planUsage.reached", { who, window: windowLabel(limit.window) })
    : `${who}: ${limit.text}`
  const reset = limit.resetsAt ? resetLabel(limit.resetsAt, now) : null
  return reset && !isResetDue(limit.resetsAt, now)
    ? t("chat.planUsage.stoppedReset", { what, reset })
    : t("chat.planUsage.stopped", { what })
}

/** A plan's name, capitalised — `max` → `Max`. */
export function planName(subscription: string | null): string | null {
  if (!subscription) return null
  return subscription.charAt(0).toUpperCase() + subscription.slice(1)
}

/**
 * The last answer per account, so switching between chats on the same profile
 * draws the meter at once rather than asking again. Keyed by profile id, `""`
 * for the default login. Main holds its own minute as well; this is only what
 * the renderer has already been told.
 */
type PlanUsageState = {
  byProfile: Record<string, PlanUsage>
  loading: string[]
  load: (profileId: string | null, fresh?: boolean) => Promise<void>
}

export const usePlanUsage = create<PlanUsageState>((set, get) => ({
  byProfile: {},
  loading: [],

  async load(profileId, fresh = false) {
    const key = profileId ?? ""
    if (get().loading.includes(key)) return
    set({ loading: [...get().loading, key] })
    try {
      const answer = await window.desktop.planUsage(profileId, fresh)
      set({ byProfile: { ...get().byProfile, [key]: answer } })
    } catch (error) {
      console.error("Could not read plan usage", error)
    } finally {
      set({ loading: get().loading.filter((entry) => entry !== key) })
    }
  },
}))
