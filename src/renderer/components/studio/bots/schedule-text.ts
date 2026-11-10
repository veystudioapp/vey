import { useCallback } from "react"

import type { BotSchedule } from "@shared/api"
import { useLocale, useT } from "@/lib/i18n"

/** The week as the form and the card list it: Monday first, Sunday last. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** A `getDay()` number's short name in `locale` — 2026-11-08 is a Sunday. */
export function weekdayName(locale: string, day: number): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    new Date(2026, 10, 8 + day)
  )
}

/** A schedule in a line: `weekdays at 08:30`, `Every 3 hours · every day`. */
export function useScheduleText(): (schedule: BotSchedule) => string {
  const t = useT()
  const locale = useLocale()
  return useCallback(
    (schedule) => {
      const days = [...schedule.days].sort().join(",")
      const named =
        days === "0,1,2,3,4,5,6"
          ? t("bots.schedule.everyDay")
          : days === "1,2,3,4,5"
            ? t("bots.schedule.weekdays")
            : days === "0,6"
              ? t("bots.schedule.weekends")
              : WEEK_ORDER.filter((day) => schedule.days.includes(day))
                  .map((day) => weekdayName(locale, day))
                  .join(", ")
      if (schedule.kind === "daily") {
        const text = t("bots.schedule.daily", {
          days: named,
          time: schedule.time,
        })
        return text.charAt(0).toUpperCase() + text.slice(1)
      }
      return t("bots.schedule.every", {
        hours: schedule.hours,
        count: schedule.hours,
        days: named,
      })
    },
    [t, locale]
  )
}
