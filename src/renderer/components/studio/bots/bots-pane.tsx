import { useMemo, useState } from "react"
import {
  Bot as BotIcon,
  ClipboardList,
  GitPullRequest,
  MoreHorizontal,
  Play,
  Plus,
  Sunrise,
  type LucideIcon,
} from "lucide-react"

import type { Bot, BotRun, WorkspaceFolder } from "@shared/api"
import { nextDue } from "@shared/bots"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { botsOf, useBots } from "@/lib/bots/store"
import { BOT_TEMPLATES, type BotTemplate } from "@/lib/bots/templates"
import { useChats } from "@/lib/chat/store"
import { useLocale, useT } from "@/lib/i18n"
import { useStudio } from "@/lib/store"
import { cn } from "@/lib/utils"
import { IconButton } from "../icon-button"
import { BotDialog } from "./bot-dialog"
import { useScheduleText } from "./schedule-text"

/**
 * A project's `Bots` tab — `docs/design.md` § Bots: its bots, each with its
 * schedule, a `Run now`, its switch and its last runs, every run a link to
 * the chat it opened. Empty, it offers the three starting points.
 */
export function BotsPane() {
  const t = useT()
  const openIds = useBots((state) => state.openIds)
  const selectedId = useBots((state) => state.selectedId)
  const projectId =
    selectedId && openIds.includes(selectedId) ? selectedId : null
  const project = useStudio((state) =>
    state.folders.find((folder) => folder.id === projectId)
  )

  if (!project) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BotIcon />
          </EmptyMedia>
          <EmptyTitle>{t("bots.goneTitle")}</EmptyTitle>
          <EmptyDescription>{t("bots.goneDetail")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return <ProjectBots key={project.id} project={project} />
}

function ProjectBots({ project }: { project: WorkspaceFolder }) {
  const t = useT()
  const all = useBots((state) => state.bots)
  const form = useBots((state) => state.form)
  const bots = useMemo(() => botsOf(all, project.id), [all, project.id])
  const newBot = () =>
    useBots.getState().edit({ projectId: project.id, bot: null })

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 items-center gap-2 border-b py-1.5 pr-2 pl-3">
        <BotIcon className="size-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <span className="truncate font-medium">{project.name}</span>
          <span className="ml-2 truncate text-muted-foreground">
            {t("bots.header.caption")}
          </span>
        </div>
        {bots.length > 0 && (
          <Button size="xs" variant="outline" onClick={newBot}>
            <Plus />
            {t("bots.header.new")}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {bots.length === 0 ? (
          <Starting projectId={project.id} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
            {bots.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
          </div>
        )}
      </div>

      <BotDialog
        project={project}
        form={form?.projectId === project.id ? form : null}
        onClose={() => useBots.getState().edit(null)}
      />
    </div>
  )
}

const TEMPLATE_ICONS: Record<BotTemplate["id"], LucideIcon> = {
  brief: Sunrise,
  reviews: GitPullRequest,
  standup: ClipboardList,
}

/** The empty tab: what a bot is, honestly about where it runs, and the
 * three starting points as the way in. */
function Starting({ projectId }: { projectId: string }) {
  const t = useT()
  const start = (template: BotTemplate | null) =>
    useBots.getState().edit({
      projectId,
      bot: null,
      draft: template
        ? { ...template.draft, name: t(`bots.templates.${template.id}.name`) }
        : undefined,
    })
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
          <BotIcon className="size-4.5" />
        </div>
        <h2 className="text-sm font-medium">{t("bots.empty.title")}</h2>
        <p className="text-muted-foreground">{t("bots.empty.detail")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[0.6875rem] font-medium text-muted-foreground uppercase">
          {t("bots.empty.startFrom")}
        </span>
        {BOT_TEMPLATES.map((template) => {
          const Icon = TEMPLATE_ICONS[template.id]
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => start(template)}
              className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-left hover:border-primary/40 hover:bg-primary/5"
            >
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {t(`bots.templates.${template.id}.name`)}
                </span>
                <span className="block truncate text-muted-foreground">
                  {t(`bots.templates.${template.id}.detail`)}
                </span>
              </span>
            </button>
          )
        })}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => start(null)}
        >
          <Plus />
          {t("bots.empty.blank")}
        </Button>
      </div>
    </div>
  )
}

/** How many runs a card lists; the rest are in the project's column. */
const SHOWN_RUNS = 5

function BotCard({ bot }: { bot: Bot }) {
  const t = useT()
  const locale = useLocale()
  const scheduleText = useScheduleText()
  const [deleting, setDeleting] = useState(false)
  const [starting, setStarting] = useState(false)
  const running = bot.runs.some((run) => run.state === "running")

  const next = bot.enabled ? nextDue(bot.schedule, new Date()) : null
  const when = next
    ? t("bots.card.next", {
        when: new Intl.DateTimeFormat(locale, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(next),
      })
    : bot.enabled
      ? t("bots.card.noNext")
      : t("bots.card.paused")

  async function runNow() {
    setStarting(true)
    try {
      await window.desktop.runBot(bot.id)
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-muted/20">
      <header className="flex items-center gap-2 px-3 py-2">
        <BotIcon
          className={cn(
            "size-3.5 shrink-0",
            bot.enabled ? "text-primary" : "text-muted-foreground"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{bot.name}</div>
          <div className="truncate text-[0.6875rem] text-muted-foreground">
            {scheduleText(bot.schedule)} · {when}
          </div>
        </div>
        <Button
          size="xs"
          variant="outline"
          disabled={starting || running}
          onClick={() => void runNow()}
        >
          {starting || running ? <Spinner /> : <Play />}
          {t("bots.card.runNow")}
        </Button>
        <Switch
          aria-label={t("bots.card.enabled")}
          checked={bot.enabled}
          onCheckedChange={(enabled) =>
            void window.desktop.saveBot({ ...bot, enabled })
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton label={t("bots.card.menu")} className="size-6">
                <MoreHorizontal />
              </IconButton>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() =>
                useBots.getState().edit({ projectId: bot.projectId, bot })
              }
            >
              {t("bots.card.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleting(true)}
            >
              {t("bots.card.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="divide-y border-t bg-background/40">
        {bot.runs.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground">
            {t("bots.card.noRuns")}
          </p>
        ) : (
          bot.runs
            .slice(0, SHOWN_RUNS)
            .map((run) => <RunRow key={run.id} run={run} />)
        )}
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("bots.delete.title", { name: bot.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("bots.delete.detail")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("bots.form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleting(false)
                void window.desktop.deleteBot(bot.id)
              }}
            >
              {t("bots.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

const RUN_TONES: Record<BotRun["state"], string> = {
  running: "text-primary",
  reported: "text-foreground",
  quiet: "text-muted-foreground",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
}

/** One run: when, what came of it, and — where it opened one — its chat. */
function RunRow({ run }: { run: BotRun }) {
  const t = useT()
  const locale = useLocale()
  const chat = useChats((state) =>
    run.chatId
      ? state.chats.find((entry) => entry.id === run.chatId)
      : undefined
  )
  const unread = useChats((state) =>
    run.chatId ? state.unread[run.chatId] === true : false
  )
  const at = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(run.at))
  const trigger =
    run.trigger === "manual"
      ? t("bots.run.manual")
      : run.trigger === "catch-up"
        ? t("bots.run.catchUp")
        : null

  const body = (
    <>
      <span className="w-36 shrink-0 text-muted-foreground tabular-nums">
        {at}
      </span>
      <span
        className={cn(
          "flex w-32 shrink-0 items-center gap-1.5",
          RUN_TONES[run.state]
        )}
      >
        {run.state === "running" && <Spinner className="size-3" />}
        {t(`bots.run.${run.state}`)}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {[
          trigger,
          run.note,
          run.chatId && !chat ? t("bots.card.goneChat") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
    </>
  )

  if (!chat) {
    return <div className="flex h-8 items-center gap-2 px-3">{body}</div>
  }
  return (
    <button
      type="button"
      title={chat.title}
      onClick={() => useChats.getState().select(chat.id)}
      className={cn(
        "flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-accent/40",
        unread && "font-medium"
      )}
    >
      {body}
    </button>
  )
}
