import { useId, useState, type FormEvent, type ReactNode } from "react"
import {
  Clock,
  Filter,
  ListTodo,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { InboxKind, ProjectInbox } from "@shared/api"
import { INBOX_INTERVALS, INBOX_KIND_GROUPS, INBOX_KINDS } from "@shared/inbox"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n"

/**
 * One project's inbox settings: which kinds it lists, two filters, and how
 * often its list is checked. A draft until Save — main narrows what it is
 * sent (`inboxSettingsOf`) and pushes the inbox back, so nothing here is the
 * stored copy. What each choice means at the edges is in `docs/design.md`
 * § The ClickUp inbox rather than in the dialog, which was a page of it.
 */
export function InboxSettingsDialog({
  inbox,
  open,
  onOpenChange,
}: {
  inbox: ProjectInbox
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Header and footer fixed and the body scrolling, the way Settings is,
          so a short window cannot cut off Save. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Mounted per opening, so the draft starts from what is saved. */}
        {open && <Form inbox={inbox} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  task: ListTodo,
  people: Users,
  comments: MessageSquare,
}

function Form({ inbox, onDone }: { inbox: ProjectInbox; onDone: () => void }) {
  const t = useT()
  const [kinds, setKinds] = useState<InboxKind[]>(inbox.settings.kinds)
  const [minutes, setMinutes] = useState(inbox.settings.intervalMinutes)
  const [onlyMine, setOnlyMine] = useState(inbox.settings.onlyMine)
  const [hideOwn, setHideOwn] = useState(inbox.settings.hideOwn)
  const [saving, setSaving] = useState(false)

  /** Kinds switched on or off, kept in `INBOX_KINDS`' order. */
  const turn = (some: InboxKind[], on: boolean) =>
    setKinds((current) =>
      INBOX_KINDS.filter((kind) =>
        some.includes(kind) ? on : current.includes(kind)
      )
    )

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await window.desktop.inboxSetSettings(inbox.folderId, {
        kinds,
        intervalMinutes: minutes,
        onlyMine,
        hideOwn,
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogHeader className="gap-0.5 px-5 pt-5 pr-12 pb-3">
        <DialogTitle>{t("inbox.settings.title")}</DialogTitle>
        <DialogDescription className="truncate text-xs">
          {inbox.list.name}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5">
        {INBOX_KIND_GROUPS.map((group) => {
          const on = group.kinds.filter((kind) => kinds.includes(kind))
          const name = t(`inbox.settings.group.${group.id as "task"}`)
          return (
            <Card
              key={group.id}
              icon={GROUP_ICONS[group.id] ?? ListTodo}
              title={name}
              aside={
                <>
                  <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                    {on.length}/{group.kinds.length}
                  </span>
                  <Switch
                    aria-label={t("inbox.settings.groupAll", { group: name })}
                    checked={on.length === group.kinds.length}
                    onCheckedChange={(next) => turn(group.kinds, next)}
                  />
                </>
              }
            >
              {group.kinds.map((kind) => (
                <Row
                  key={kind}
                  label={t(`inbox.settings.kind.${kind}`)}
                  on={kinds.includes(kind)}
                  onChange={(next) => turn([kind], next)}
                />
              ))}
            </Card>
          )
        })}

        <Card icon={Filter} title={t("inbox.settings.filters")}>
          <Row
            label={t("inbox.settings.onlyMine")}
            on={onlyMine}
            onChange={setOnlyMine}
          />
          <Row
            label={t("inbox.settings.hideOwn")}
            on={hideOwn}
            onChange={setHideOwn}
          />
        </Card>

        <Card
          icon={Clock}
          title={t("inbox.settings.interval")}
          aside={
            <Select
              value={String(minutes)}
              items={Object.fromEntries(
                INBOX_INTERVALS.map((each) => [
                  String(each),
                  t("inbox.settings.minutes", { count: each }),
                ])
              )}
              onValueChange={(next) => {
                if (typeof next === "string") setMinutes(Number(next))
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("inbox.settings.interval")}
                className="h-7 w-28 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {INBOX_INTERVALS.map((each) => (
                  <SelectItem
                    key={each}
                    value={String(each)}
                    className="text-xs"
                  >
                    {t("inbox.settings.minutes", { count: each })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>

      <DialogFooter className="m-0 rounded-b-xl px-5 py-3">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t("inbox.settings.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {t("inbox.settings.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** A rounded group: its heading with whatever acts on all of it, and its
 * rows divided by hairlines. */
function Card({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: LucideIcon
  title: string
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    // `shrink-0`: in the scrolling column a card would otherwise be squeezed
    // to fit, and `overflow-hidden` then cut its rows off instead of scrolling.
    <section className="shrink-0 overflow-hidden rounded-lg border bg-muted/20">
      <header className="flex h-10 items-center gap-2 px-3">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium">{title}</h3>
        {aside}
      </header>
      {children && (
        <div className="divide-y border-t bg-background/40">{children}</div>
      )}
    </section>
  )
}

/** One choice: its name, and the switch for it — the whole row is the
 * switch's label, so a click anywhere on it turns it. */
function Row({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex h-9 cursor-pointer items-center gap-3 px-3 pl-[2.125rem] text-xs hover:bg-accent/40"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Switch id={id} checked={on} onCheckedChange={onChange} />
    </label>
  )
}
