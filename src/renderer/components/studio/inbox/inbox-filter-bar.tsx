import { Search, X } from "lucide-react"

import type { InboxItem } from "@shared/api"
import { INBOX_KIND_GROUPS } from "@shared/inbox"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/lib/i18n"
import {
  assigneesIn,
  isFiltered,
  NO_FILTER,
  type InboxFilter,
} from "@/lib/inbox/filter"
import { useInbox, type InboxView } from "@/lib/inbox/store"
import { cn } from "@/lib/utils"

/** Select values cannot be null, so "any" stands for it here and only here. */
const ANY = "*"

/**
 * The inbox tab's filter bar — `lib/inbox/filter.ts` is what it means. Over
 * the whole width rather than the list's: five controls do not fit a column
 * of rows.
 */
export function InboxFilterBar({
  folderId,
  items,
  shown,
  view,
}: {
  folderId: string
  items: InboxItem[]
  shown: number
  view: InboxView
}) {
  const t = useT()
  const filter = useInbox((state) => state.filters[folderId] ?? NO_FILTER)
  const set = (patch: Partial<InboxFilter>) =>
    useInbox.getState().setFilter(folderId, patch)

  const people = assigneesIn(items)
  const assigneeItems: Record<string, string> = {
    [ANY]: t("inbox.filter.anyone"),
    me: t("inbox.filter.me"),
    none: t("inbox.filter.nobody"),
    ...Object.fromEntries(people.map((name) => [name, name])),
  }
  const sinceItems: Record<InboxFilter["since"], string> = {
    all: t("inbox.filter.anyTime"),
    today: t("inbox.filter.today"),
    week: t("inbox.filter.week"),
    month: t("inbox.filter.month"),
    range: t("inbox.filter.range"),
  }
  const groupItems: Record<string, string> = {
    [ANY]: t("inbox.filter.anyKind"),
    ...Object.fromEntries(
      INBOX_KIND_GROUPS.map((group) => [
        group.id,
        t(`inbox.settings.group.${group.id as "task"}`),
      ])
    ),
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
      <div
        role="radiogroup"
        aria-label={t("inbox.tasks.view")}
        className="flex h-7 items-center rounded-md border p-0.5"
      >
        {(["updates", "tasks"] as const).map((each) => (
          <button
            key={each}
            type="button"
            role="radio"
            aria-checked={view === each}
            onClick={() => useInbox.getState().setView(folderId, each)}
            className={cn(
              "h-full rounded-sm px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              view === each
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`inbox.tasks.${each}`)}
          </button>
        ))}
      </div>
      <div className="relative w-52">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder={t("inbox.filter.search")}
          aria-label={t("inbox.filter.search")}
          className="h-7 pl-7 text-xs"
        />
      </div>
      <Pick
        label={t("inbox.filter.when")}
        value={filter.since}
        items={sinceItems}
        onChange={(since) => set({ since: since as InboxFilter["since"] })}
      />
      {filter.since === "range" && (
        <div className="flex items-center gap-1.5">
          <DateField
            label={t("inbox.filter.from")}
            value={filter.from}
            max={filter.to}
            onChange={(from) => set({ from })}
          />
          <span className="text-muted-foreground">–</span>
          <DateField
            label={t("inbox.filter.to")}
            value={filter.to}
            min={filter.from}
            onChange={(to) => set({ to })}
          />
        </div>
      )}
      <Pick
        label={t("inbox.filter.assignee")}
        value={filter.assignee ?? ANY}
        items={assigneeItems}
        onChange={(assignee) =>
          set({ assignee: assignee === ANY ? null : assignee })
        }
      />
      <Pick
        label={t("inbox.filter.kind")}
        value={filter.group ?? ANY}
        items={groupItems}
        onChange={(group) => set({ group: group === ANY ? null : group })}
      />
      <Label className="flex items-center gap-1.5 text-xs font-normal">
        <Checkbox
          checked={filter.unread}
          onCheckedChange={(checked) => set({ unread: checked === true })}
        />
        {t("inbox.filter.unread")}
      </Label>
      {isFiltered(filter) && (
        <>
          <span className="ml-auto text-[0.6875rem] text-muted-foreground tabular-nums">
            {t("inbox.filter.count", { shown, total: items.length })}
          </span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => useInbox.getState().clearFilter(folderId)}
          >
            <X />
            {t("inbox.filter.clear")}
          </Button>
        </>
      )}
    </div>
  )
}

/**
 * Chromium's own date input, whose calendar opens on a click: the app has no
 * date picker of its own, and this one needs no dependency. `color-scheme`
 * is what makes that calendar dark in the dark theme; nothing sets it app-wide.
 */
function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min?: string
  max?: string
  onChange: (value: string) => void
}) {
  return (
    <Input
      type="date"
      aria-label={label}
      title={label}
      value={value}
      min={min || undefined}
      max={max || undefined}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 w-32 px-2 text-xs dark:[color-scheme:dark]"
    />
  )
}

function Pick({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value: string
  items: Record<string, string>
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={value}
      items={items}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className="h-7 max-w-44 min-w-0 text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([key, text]) => (
          <SelectItem key={key} value={key} className="text-xs">
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
