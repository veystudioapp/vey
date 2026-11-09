import {
  lazy,
  Suspense,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  ArrowRight,
  CheckCheck,
  ExternalLink,
  Inbox,
  MoreHorizontal,
  RefreshCw,
  Settings2,
} from "lucide-react"

import type { InboxItem, ProjectInbox, WorkspaceFolder } from "@shared/api"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Spinner } from "@/components/ui/spinner"
import { dateTimeOf, since, timeOf } from "@/lib/chat/since"
import { useT } from "@/lib/i18n"
import {
  filterItems,
  NO_FILTER,
  tasksOf,
  type TaskGroup,
} from "@/lib/inbox/filter"
import { unreadOf, useInbox } from "@/lib/inbox/store"
import { useSettings } from "@/lib/settings"
import { useStudio } from "@/lib/store"
import { cn } from "@/lib/utils"
import { IconButton } from "../icon-button"
import { InboxFilterBar } from "./inbox-filter-bar"
import { KindIcon } from "./kind-icon"
import { InboxSettingsDialog } from "./inbox-settings-dialog"

/**
 * A project's `Inbox` tab: what has changed in the ClickUp list it follows on
 * the left, and on the right the one change picked — what it was and what it
 * became, a diff for a text. Read-only; the task itself is `Open in ClickUp`.
 * `docs/design.md` § The ClickUp inbox.
 */
export function InboxPane() {
  const t = useT()
  const openIds = useInbox((state) => state.openIds)
  const selectedId = useInbox((state) => state.selectedId)
  const folderId =
    selectedId && openIds.includes(selectedId) ? selectedId : null
  const project = useStudio((state) =>
    state.folders.find((folder) => folder.id === folderId)
  )

  if (!project) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>{t("inbox.goneTitle")}</EmptyTitle>
          <EmptyDescription>{t("inbox.goneDetail")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return <InboxView key={project.id} project={project} />
}

function InboxView({ project }: { project: WorkspaceFolder }) {
  const inbox = useInbox((state) => state.byFolder[project.id])
  const hasKey = useInbox((state) => state.hasKey)
  const editing = useInbox((state) => state.editing.includes(project.id))

  if (hasKey === null) return null
  if (!inbox || editing || !hasKey) {
    return (
      <ConnectForm
        folderId={project.id}
        inbox={inbox ?? null}
        needKey={!hasKey}
      />
    )
  }
  return <Connected inbox={inbox} />
}

/** Electron puts `Error invoking remote method '…':` ahead of main's sentence. */
function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ""
  )
}

/**
 * The key, once for every project, and the list this project follows. With a
 * key already saved its field stays folded behind `Use another key`.
 */
function ConnectForm({
  folderId,
  inbox,
  needKey,
}: {
  folderId: string
  inbox: ProjectInbox | null
  needKey: boolean
}) {
  const t = useT()
  const [key, setKey] = useState("")
  const [list, setList] = useState(inbox?.list.id ?? "")
  const [showKey, setShowKey] = useState(needKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const askKey = needKey || showKey
  const ready = list.trim() !== "" && (!askKey || key.trim() !== "")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      if (askKey) {
        await window.desktop.inboxSetKey(key)
        useInbox.getState().setHasKey(true)
      }
      await window.desktop.inboxConnect(folderId, list)
      useInbox.getState().setEditing(folderId, false)
    } catch (caught) {
      setError(reasonOf(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-8">
      <form
        onSubmit={(event) => void submit(event)}
        className="flex w-full max-w-md flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4 text-primary" />
            {t("inbox.connect.title")}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("inbox.connect.detail")}
          </p>
        </div>

        {askKey ? (
          <Field
            id="inbox-key"
            label={t("inbox.connect.key")}
            hint={t("inbox.connect.keyHint")}
          >
            <Input
              id="inbox-key"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="pk_…"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              className="font-mono text-xs placeholder:font-sans"
            />
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("inbox.connect.keySaved")}{" "}
            <button
              type="button"
              onClick={() => setShowKey(true)}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {t("inbox.connect.changeKey")}
            </button>
          </p>
        )}

        <Field
          id="inbox-list"
          label={t("inbox.connect.list")}
          hint={t("inbox.connect.listHint")}
        >
          <Input
            id="inbox-list"
            value={list}
            onChange={(event) => setList(event.target.value)}
            placeholder="https://app.clickup.com/…/v/li/…"
            spellCheck={false}
            autoComplete="off"
            autoFocus={!askKey}
            className="font-mono text-xs placeholder:font-sans"
          />
        </Field>

        {error && (
          <p role="alert" className="text-xs leading-5 text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {inbox && (
            <Button
              type="button"
              variant="outline"
              onClick={() => useInbox.getState().setEditing(folderId, false)}
            >
              {t("inbox.connect.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={!ready || busy}>
            {busy && <Spinner />}
            {busy ? t("inbox.connect.connecting") : t("inbox.connect.submit")}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      <p className="text-[0.6875rem] leading-4 text-muted-foreground">{hint}</p>
    </div>
  )
}

function Connected({ inbox }: { inbox: ProjectInbox }) {
  const t = useT()
  const folderId = inbox.folderId
  const pickedId = useInbox((state) => state.picked[folderId] ?? null)
  const picked = inbox.items.find((item) => item.id === pickedId) ?? null
  const unread = unreadOf(inbox)
  const filter = useInbox((state) => state.filters[folderId] ?? NO_FILTER)
  const items = filterItems(inbox.items, filter)
  const view = useInbox((state) => state.views[folderId] ?? "updates")
  const pickedTaskId = useInbox((state) => state.pickedTask[folderId] ?? null)
  // Grouped after filtering, so a task shows the changes the filter keeps.
  const tasks = view === "tasks" ? tasksOf(items) : []
  const pickedTask = tasks.find((group) => group.taskId === pickedTaskId)
  const [refreshing, setRefreshing] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  // Read once, for the panel's first size; a drag is the panel's own until
  // it is released and written back.
  const [savedWidth] = useState(() => useSettings.getState().inboxListWidth)
  const listWidth = useRef<number | null>(null)

  async function refresh() {
    setRefreshing(true)
    try {
      await window.desktop.inboxRefresh(folderId)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 items-center gap-2 border-b py-1.5 pr-2 pl-3">
        <Inbox className="size-3.5 shrink-0 text-primary" />
        <span className="truncate font-medium">{inbox.list.name}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            inbox.error ? "text-destructive" : "text-muted-foreground"
          )}
          title={inbox.error ?? undefined}
        >
          {inbox.error ??
            (inbox.polledAt
              ? t("inbox.header.checked", { when: timeOf(inbox.polledAt) })
              : t("inbox.header.neverChecked"))}
        </span>
        <IconButton
          label={t("inbox.header.refresh")}
          side="bottom"
          disabled={refreshing}
          onClick={() => void refresh()}
          className="size-6"
        >
          {refreshing ? <Spinner /> : <RefreshCw />}
        </IconButton>
        <IconButton
          label={t("inbox.header.markAllRead")}
          side="bottom"
          disabled={unread === 0}
          onClick={() => useInbox.getState().markAllRead(folderId)}
          className="size-6"
        >
          <CheckCheck />
        </IconButton>
        <IconButton
          label={t("inbox.header.settings")}
          side="bottom"
          onClick={() => setConfiguring(true)}
          className="size-6"
        >
          <Settings2 />
        </IconButton>
        <InboxSettingsDialog
          inbox={inbox}
          open={configuring}
          onOpenChange={setConfiguring}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton
                label={t("inbox.header.more")}
                side="bottom"
                className="size-6"
              >
                <MoreHorizontal />
              </IconButton>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => useInbox.getState().setEditing(folderId, true)}
            >
              {t("inbox.header.changeList")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void window.desktop.inboxDisconnect(folderId)}
            >
              {t("inbox.header.disconnect")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {inbox.items.length > 0 && (
        <InboxFilterBar
          folderId={folderId}
          items={inbox.items}
          shown={items.length}
          view={view}
        />
      )}

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        onLayoutChanged={(_layout, meta) => {
          // Written once, on release: every write is the whole settings bag.
          if (meta.isUserInteraction && listWidth.current !== null) {
            useSettings.getState().setInboxListWidth(listWidth.current)
          }
        }}
      >
        <ResizablePanel
          defaultSize={savedWidth ?? LIST_WIDTH}
          minSize={220}
          maxSize={720}
          onResize={(size) => {
            listWidth.current = Math.round(size.inPixels)
          }}
        >
          <ul className="h-full overflow-y-auto">
            {inbox.items.length === 0 ? (
              <li className="p-3 leading-5 text-muted-foreground">
                {t("inbox.list.empty", {
                  list: inbox.list.name,
                  minutes: inbox.settings.intervalMinutes,
                })}
              </li>
            ) : items.length === 0 ? (
              <li className="flex flex-col items-start gap-2 p-3 leading-5 text-muted-foreground">
                {t("inbox.filter.nothing")}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => useInbox.getState().clearFilter(folderId)}
                >
                  {t("inbox.filter.clear")}
                </Button>
              </li>
            ) : view === "tasks" ? (
              tasks.map((group) => (
                <li key={group.taskId}>
                  <TaskRow
                    group={group}
                    picked={group.taskId === pickedTaskId}
                    onPick={() =>
                      useInbox.getState().pickTask(folderId, group.taskId)
                    }
                  />
                </li>
              ))
            ) : (
              items.map((item) => (
                <li key={item.id}>
                  <ItemRow
                    item={item}
                    picked={item.id === pickedId}
                    onPick={() => useInbox.getState().pick(folderId, item.id)}
                  />
                </li>
              ))
            )}
          </ul>
        </ResizablePanel>
        <ResizableHandle
          title={t("inbox.list.resize")}
          className="data-[separator=active]:bg-ring/60 data-[separator=hover]:bg-ring/60"
        />
        <ResizablePanel minSize={280}>
          <div className="h-full min-w-0 overflow-y-auto">
            {view === "tasks" ? (
              pickedTask ? (
                <TaskHistory key={pickedTask.taskId} group={pickedTask} />
              ) : (
                <p className="p-4 text-muted-foreground">
                  {t("inbox.tasks.pick")}
                </p>
              )
            ) : picked ? (
              <ChangeDetail key={picked.id} item={picked} />
            ) : (
              <p className="p-4 text-muted-foreground">
                {t("inbox.detail.pick")}
              </p>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

/** The list's width before anybody drags it — what `w-80` was. */
const LIST_WIDTH = 320

/** What happened, as the row's second line and the detail's first. */
function ChangeLine({
  item,
  className,
}: {
  item: InboxItem
  className?: string
}) {
  const t = useT()
  const text = {
    created: () =>
      item.by
        ? t("inbox.list.createdBy", { by: item.by })
        : t("inbox.list.created"),
    status: () =>
      t("inbox.list.status", { from: item.from ?? "", to: item.to ?? "" }),
    renamed: () => t("inbox.list.renamed", { from: item.from ?? "" }),
    description: () => t("inbox.list.description"),
    comment: () =>
      t("inbox.list.comment", {
        by: item.by ?? t("inbox.list.someone"),
        text: item.text ?? "",
      }),
    "comment-edited": () =>
      t("inbox.list.commentEdited", {
        by: item.by ?? t("inbox.list.someone"),
        text: item.text ?? "",
      }),
    mention: () =>
      t("inbox.list.mention", {
        by: item.by ?? t("inbox.list.someone"),
        text: item.text ?? "",
      }),
    priority: () =>
      t("inbox.list.priority", {
        from: item.from ?? t("inbox.list.none"),
        to: item.to ?? t("inbox.list.none"),
      }),
    due: () =>
      t("inbox.list.due", {
        from: dayOf(item.from) ?? t("inbox.list.none"),
        to: dayOf(item.to) ?? t("inbox.list.none"),
      }),
    tags: () => t("inbox.list.tags"),
    assigned: () => t("inbox.list.assigned"),
    "assigned-me": () => t("inbox.list.assignedMe"),
  }[item.kind]()
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <KindIcon item={item} />
      <span className="truncate">{text}</span>
    </span>
  )
}

function StatusDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted-foreground/50"
      // Checked as a `#hex` in main (`hexColor`) before it gets here.
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

function ItemRow({
  item,
  picked,
  onPick,
}: {
  item: InboxItem
  picked: boolean
  onPick: () => void
}) {
  const at = new Date(item.at).toISOString()
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full gap-2 border-b px-3 py-2 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent/60",
        picked && "bg-accent"
      )}
    >
      <span className="flex h-4 w-1.5 shrink-0 items-center">
        {!item.read && <span className="size-1.5 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              item.read ? "text-foreground/80" : "font-semibold"
            )}
          >
            {item.taskName}
          </span>
          <span
            className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums"
            title={dateTimeOf(at)}
          >
            {since(at)}
          </span>
        </span>
        <ChangeLine item={item} className="text-muted-foreground" />
      </span>
    </button>
  )
}

const TextDiff = lazy(() => import("./text-diff"))

/**
 * One item opened: the change itself, before and after — not the task, which
 * is ClickUp's to show and one click away.
 */
/** What an item is, as the detail's heading over it. */
function useChangeTitle(item: InboxItem): string {
  const t = useT()
  const by = item.by ?? t("inbox.list.someone")
  return {
    created: () =>
      item.by
        ? t("inbox.detail.createdBy", { by: item.by })
        : t("inbox.detail.created"),
    status: () => t("inbox.detail.status"),
    renamed: () => t("inbox.detail.renamed"),
    description: () => t("inbox.detail.description"),
    comment: () => t("inbox.detail.comment", { by }),
    "comment-edited": () => t("inbox.detail.commentEdited", { by }),
    mention: () => t("inbox.detail.mention", { by }),
    priority: () => t("inbox.detail.priority"),
    due: () => t("inbox.detail.due"),
    tags: () => t("inbox.detail.tags"),
    assigned: () => t("inbox.detail.assigned"),
    "assigned-me": () => t("inbox.detail.assignedMe"),
  }[item.kind]()
}

/** `target="_blank"` reaches `setWindowOpenHandler`, which hands the URL to
 * the system browser. */
function OpenInClickUp({ url }: { url: string }) {
  const t = useT()
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "outline", size: "xs" })}
    >
      <ExternalLink />
      {t("inbox.detail.open")}
    </a>
  )
}

/**
 * One item opened: the change itself, before and after — not the task, which
 * is ClickUp's to show and one click away.
 */
function ChangeDetail({ item }: { item: InboxItem }) {
  const title = useChangeTitle(item)
  const at = new Date(item.at).toISOString()
  return (
    <article className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[0.6875rem] text-muted-foreground">
            {title} · {dateTimeOf(at)}
          </p>
          <h2 className="text-sm leading-5 font-semibold">{item.taskName}</h2>
        </div>
        <OpenInClickUp url={item.url} />
      </header>
      <ChangeBody item={item} />
    </article>
  )
}

/**
 * One task opened in the `Tasks` view: every change the inbox holds for it,
 * newest first, each drawn as `ChangeDetail` draws one — a history of the
 * task as this inbox saw it, not ClickUp's, which it has no access to.
 */
function TaskHistory({ group }: { group: TaskGroup }) {
  return (
    <article className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 text-sm leading-5 font-semibold">
          {group.taskName}
        </h2>
        <OpenInClickUp url={group.url} />
      </header>
      <ol className="flex flex-col">
        {group.items.map((item, index) => (
          <HistoryEntry
            key={item.id}
            item={item}
            last={index === group.items.length - 1}
          />
        ))}
      </ol>
    </article>
  )
}

function HistoryEntry({ item, last }: { item: InboxItem; last: boolean }) {
  const title = useChangeTitle(item)
  const at = new Date(item.at).toISOString()
  return (
    <li className={cn("relative flex gap-3", !last && "pb-5")}>
      {/* The timeline's thread, stopping at the last entry. */}
      {!last && (
        <span
          aria-hidden
          className="absolute top-6 bottom-0 left-[11px] w-px bg-border"
        />
      )}
      <span className="flex size-[23px] shrink-0 items-center justify-center rounded-full border bg-background">
        <KindIcon item={item} className="size-3" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <p className="text-[0.6875rem] text-muted-foreground">
          <span className="font-medium text-foreground">{title}</span> ·{" "}
          <span title={dateTimeOf(at)}>{since(at)}</span>
        </p>
        <ChangeBody item={item} />
      </div>
    </li>
  )
}

/** A task in the `Tasks` view's list: its name, how many changes and how
 * many unread, and its newest change's line. */
function TaskRow({
  group,
  picked,
  onPick,
}: {
  group: TaskGroup
  picked: boolean
  onPick: () => void
}) {
  const t = useT()
  const at = new Date(group.at).toISOString()
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full gap-2 border-b px-3 py-2 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent/60",
        picked && "bg-accent"
      )}
    >
      <span className="flex h-4 w-1.5 shrink-0 items-center">
        {group.unread > 0 && (
          <span className="size-1.5 rounded-full bg-primary" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              group.unread > 0 ? "font-semibold" : "text-foreground/80"
            )}
          >
            {group.taskName}
          </span>
          <span
            className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums"
            title={dateTimeOf(at)}
          >
            {since(at)}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <ChangeLine item={group.items[0]!} className="min-w-0 flex-1" />
          <span className="shrink-0 text-[0.6875rem] tabular-nums">
            {t("inbox.tasks.count", { count: group.items.length })}
          </span>
        </span>
      </span>
    </button>
  )
}

function ChangeBody({ item }: { item: InboxItem }) {
  const t = useT()
  switch (item.kind) {
    case "status":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill name={item.from} color={item.fromColor} faded />
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <StatusPill name={item.to} color={item.color} />
        </div>
      )
    case "priority":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Chip faded>{item.from ?? t("inbox.detail.none")}</Chip>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <Chip>{item.to ?? t("inbox.detail.none")}</Chip>
        </div>
      )
    case "due":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Chip faded>{dayOf(item.from) ?? t("inbox.detail.none")}</Chip>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <Chip>{dayOf(item.to) ?? t("inbox.detail.none")}</Chip>
        </div>
      )
    case "tags":
    case "assigned":
    case "assigned-me":
      return <ListChange from={item.from} to={item.to} />
    case "mention":
      return <Quote text={item.after ?? item.text ?? ""} />
    case "renamed":
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-xs text-muted-foreground">
            {t("inbox.detail.before")}
          </dt>
          <dd className="text-muted-foreground line-through">{item.from}</dd>
          <dt className="text-xs text-muted-foreground">
            {t("inbox.detail.after")}
          </dt>
          <dd>{item.to}</dd>
        </dl>
      )
    case "description":
    case "comment-edited":
      // An item recorded before its texts were kept has neither.
      if (item.before == null || item.after == null) {
        return (
          <p className="text-muted-foreground">{t("inbox.detail.notKept")}</p>
        )
      }
      return (
        <Suspense fallback={<Spinner />}>
          <TextDiff before={item.before} after={item.after} />
        </Suspense>
      )
    case "comment":
      return <Quote text={item.after ?? item.text ?? ""} />
    case "created":
      return (
        <>
          <StatusPill name={item.to} color={item.color} />
          <section className="flex flex-col gap-1.5">
            <h3 className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              {t("inbox.detail.descriptionLabel")}
            </h3>
            {item.after?.trim() ? (
              <Quote text={item.after} />
            ) : (
              <p className="text-muted-foreground">
                {t("inbox.detail.noDescription")}
              </p>
            )}
          </section>
        </>
      )
  }
}

/** A due date's ms, carried as text, as the local day; null for none. */
function dayOf(ms: string | null): string | null {
  if (ms === null) return null
  const at = new Date(Number(ms))
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString()
}

/** `, `-joined names or tags as a list. */
function listOf(text: string | null): string[] {
  return text ? text.split(", ").filter((each) => each !== "") : []
}

/** A set that changed — assignees, tags — as who or what came and went, and
 * what it is now. */
function ListChange({ from, to }: { from: string | null; to: string | null }) {
  const t = useT()
  const before = listOf(from)
  const after = listOf(to)
  const added = after.filter((each) => !before.includes(each))
  const removed = before.filter((each) => !after.includes(each))
  const row = (label: string, entries: string[], faded = false) =>
    entries.length > 0 && (
      <>
        <dt className="pt-0.5 text-xs text-muted-foreground">{label}</dt>
        <dd className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <Chip key={entry} faded={faded}>
              {entry}
            </Chip>
          ))}
        </dd>
      </>
    )
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
      {row(t("inbox.detail.added"), added)}
      {row(t("inbox.detail.removed"), removed, true)}
      {after.length > 0 ? (
        row(t("inbox.detail.now"), after)
      ) : (
        <>
          <dt className="text-xs text-muted-foreground">
            {t("inbox.detail.now")}
          </dt>
          <dd className="text-muted-foreground">{t("inbox.detail.none")}</dd>
        </>
      )}
    </dl>
  )
}

function Chip({
  children,
  faded = false,
}: {
  children: ReactNode
  faded?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        faded && "text-muted-foreground line-through"
      )}
    >
      {children}
    </span>
  )
}

function StatusPill({
  name,
  color,
  faded = false,
}: {
  name: string | null
  color: string | null
  faded?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium uppercase",
        faded && "text-muted-foreground"
      )}
    >
      <StatusDot color={color} />
      {name}
    </span>
  )
}

/** A text from ClickUp as it was written — plain, line breaks kept. */
function Quote({ text }: { text: string }) {
  return (
    <p className="rounded-md border bg-muted/30 px-3 py-2 leading-5 whitespace-pre-wrap">
      {text}
    </p>
  )
}
