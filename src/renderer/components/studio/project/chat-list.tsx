import { useEffect, useState } from "react"
import { Clock, Pencil, ShieldQuestion, Trash2 } from "lucide-react"

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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { t as translate, useT, type Translate } from "@/lib/i18n"
import { useProjects } from "@/lib/projects"
import { useShells } from "@/lib/shell/store"
import { useChats } from "@/lib/chat/store"
import { since } from "@/lib/chat/since"
import { chatStateOf, type ChatState } from "@/lib/chat/column"
import { resetLabel, windowLabel } from "@/lib/chat/plan-usage"
import { PLUGIN_ICON_COMPONENTS } from "@/lib/plugins/icons"
import type { PluginChatMenuItem } from "@/lib/plugins/registry"
import { usePlugins } from "@/lib/plugins/store"
import type { Chat } from "@shared/api"
import { RenameRow, useMenuFocusHandoff } from "../rename-row"
import { SideRow } from "../side-row"
import { useLimitWayOut } from "../chat/chat-limit"

/**
 * One plugin's chat menu item. A throw is reported in the plugin's name rather
 * than left to the console: the menu has closed by then, and the click would
 * otherwise have done nothing visible.
 */
async function runChatMenuItem(
  item: PluginChatMenuItem,
  chatId: string
): Promise<void> {
  try {
    await item.run(chatId)
  } catch (error) {
    console.error(`[plugin ${item.pluginId}]`, error)
    usePlugins.getState().notify(
      item.pluginId,
      translate("projects.chatList.pluginFailed", {
        name: item.name,
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }
}

/** The clock a limit's countdown is read against, moved once a minute — a
 * reset that said "in 3h" when the list was drawn must not still say it at
 * lunch. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(tick)
  }, [])
  return now
}

/**
 * A list of chat rows, with the one rename field and the one delete
 * confirmation the rows share — both here rather than on a row, since a dialog
 * mounted inside a row is unmounted by the deletion it is confirming.
 */
export function ChatList({ chats }: { chats: Chat[] }) {
  const selectedId = useChats((state) => state.selectedId)
  const sending = useChats((state) => state.sending)
  // Which chats are stopped on a question — see the note in `tab-items.tsx`
  // about why that is not the same thing as one that is working.
  const asks = useChats((state) => state.asks)
  // Which have answered since anybody looked — see `lib/chat/unread.ts`.
  const unread = useChats((state) => state.unread)
  const remove = useChats((state) => state.remove)
  const rename = useChats((state) => state.rename)
  const chatMenuItems = usePlugins((state) => state.chatMenuItems)
  const now = useMinuteClock()
  const t = useT()

  /** Which chat's name is a field right now. In place, the way every other
   * sidebar in the studio renames — see `RenameRow`. */
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Chat | null>(null)
  const menuFocus = useMenuFocusHandoff()

  return (
    <>
      {chats.map((chat) => {
        // Outside the menu while it is a field: a right-click on a text field
        // belongs to the field, not to the row it stands in for.
        if (renamingId === chat.id) {
          return (
            <RenameRow
              key={chat.id}
              name={chat.title}
              indent={0}
              label={t("projects.chatList.chatName")}
              onRename={async (name) => {
                rename(chat.id, name)
                setRenamingId(null)
                return null
              }}
              onCancel={() => setRenamingId(null)}
            />
          )
        }

        const state = chatStateOf(chat, sending, asks, unread)
        const active = selectedId === chat.id

        return (
          <ContextMenu key={chat.id}>
            <ContextMenuTrigger
              render={
                state === "limited" ? (
                  <LimitedRow chat={chat} active={active} now={now} />
                ) : (
                  <ChatRow chat={chat} state={state} active={active} />
                )
              }
            />
            <ContextMenuContent
              className="w-52"
              // Rename hands focus to the field it opens — see
              // `useMenuFocusHandoff`.
              finalFocus={menuFocus.finalFocus}
            >
              <ContextMenuItem
                onClick={() => {
                  menuFocus.handOff()
                  setRenamingId(chat.id)
                }}
              >
                <Pencil />
                {t("common.rename")}
              </ContextMenuItem>
              <ContextMenuSeparator />
              {/* What plugins add — the transcript as a document is the
                  built-in `chat-export` plugin's (`plugins/chat-export/`). */}
              {chatMenuItems.length > 0 && (
                <>
                  {chatMenuItems.map((item) => {
                    const Icon = PLUGIN_ICON_COMPONENTS[item.icon]
                    return (
                      <ContextMenuItem
                        key={item.id}
                        onClick={() => void runChatMenuItem(item, chat.id)}
                      >
                        <Icon />
                        {item.name}
                      </ContextMenuItem>
                    )
                  })}
                  <ContextMenuSeparator />
                </>
              )}
              {/* The conversation is on disk, so this is the one way it goes —
                  and there is no undo, which is why it asks. */}
              <ContextMenuItem
                variant="destructive"
                onClick={() => setDeleting(chat)}
              >
                <Trash2 />
                {t("projects.chatList.deleteChat")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projects.chatList.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("projects.chatList.deleteDescription", {
                title: deleting?.title ?? "",
              })}
              {/* Said only when it is true: main kills a turn still running
                  in a chat it deletes, and that is the one part of this that
                  reaches past the transcript. */}
              {deleting && sending.includes(deleting.id)
                ? ` ${t("projects.chatList.deleteStillWorking")}`
                : ""}{" "}
              {t("projects.chatList.deleteFilesStay")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void remove(deleting.id)
                setDeleting(null)
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Opens a chat, and points the dock's shell and Explorer at its project the
 * way the rail does — a chat editing one project with a terminal pointed at
 * another is a trap, not an inconvenience. Nothing to point for an ungrouped
 * chat, which has no directory. */
function openChat(chat: Chat) {
  useChats.getState().select(chat.id)
  if (!chat.folderId) return
  useShells.getState().showFor(chat.folderId)
  useProjects.getState().setActive(chat.folderId)
}

/**
 * One chat: its title, and at the right what it is doing and how long ago it
 * last moved.
 *
 * No mark ahead of the title. It carried the account's avatar for a while,
 * and a column of small icons in front of every title was noise the user
 * asked to have taken off; which account a chat runs on is its composer's
 * toolbar, and the Accounts foot says which have room.
 *
 * **Exported props pass through** to the `SideRow` — `ContextMenuTrigger`'s
 * `render` hands the row its own handlers and ref, and a row that dropped them
 * would right-click to nothing.
 */
function ChatRow({
  chat,
  state,
  active,
  ...rest
}: {
  chat: Chat
  state: ChatState
  active: boolean
}) {
  const t = useT()
  return (
    <SideRow
      {...rest}
      active={active}
      onClick={() => openChat(chat)}
      title={rowTitle(t, chat.title, state)}
      className={cn("rounded-md text-foreground", active && "shadow-none")}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          // Unread is the one state about the row's *content* rather than a
          // process beside it, so the title carries it. Weight rather than
          // hue: the hue is spoken for by the shield.
          state === "unread" && "font-semibold"
        )}
      >
        {chat.title}
      </span>
      {state === "waiting" ? (
        <ShieldQuestion className="size-3 shrink-0 animate-pulse text-primary" />
      ) : state === "working" ? (
        <Spinner className="size-3 shrink-0 text-muted-foreground" />
      ) : state === "unread" ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-primary"
        />
      ) : null}
      {/* `tabular-nums` so `9h` and `23h` end on the same pixel. */}
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
        {since(chat.updatedAt)}
      </span>
    </SideRow>
  )
}

function rowTitle(t: Translate, title: string, state: ChatState): string {
  switch (state) {
    case "waiting":
      return t("projects.chatList.waiting", { title })
    case "working":
      return t("projects.chatList.working", { title })
    case "unread":
      return t("projects.chatList.unread", { title })
    default:
      return title
  }
}

/**
 * A chat its plan limit stopped, drawn as a card with the way out on it.
 *
 * This is the case the app exists for — several accounts, so a limit on one is
 * not the end of the afternoon — and the column used to draw it exactly like a
 * chat that had finished. The card says which limit and when it resets, and
 * its button is `useLimitWayOut`'s: `Continue with …` another account, and
 * none with nowhere to go.
 *
 * A `div` rather than a `SideRow`: the card holds a button, and a button inside
 * a button is neither valid markup nor clickable.
 */
function LimitedRow({
  chat,
  active,
  now,
  ...rest
}: {
  chat: Chat
  active: boolean
  now: Date
}) {
  const limit = chat.limit!
  const reset = resetLabel(limit.resetsAt, now)
  // Off the clock rather than off `resetLabel`'s words, which are translated.
  const over =
    limit.resetsAt !== null &&
    new Date(limit.resetsAt).getTime() - now.getTime() <= 0
  const t = useT()
  const windowName = limit.window
    ? windowLabel(limit.window)
    : t("projects.chatList.plan")
  const action = useLimitWayOut(chat, now, () => openChat(chat))

  return (
    <div
      {...rest}
      aria-current={active ? "true" : undefined}
      className={cn(
        "my-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-1.5 py-1.5",
        active && "border-destructive/50 bg-destructive/10"
      )}
    >
      <button
        type="button"
        onClick={() => openChat(chat)}
        title={t("projects.chatList.limited", { title: chat.title })}
        className="flex w-full items-center gap-1.5 rounded px-1.5 text-left text-xs text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
          {since(chat.updatedAt)}
        </span>
      </button>
      <div className="mt-1 flex items-center gap-1.5 pl-1.5 text-[0.6875rem] text-destructive">
        <Clock className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {over
            ? t("projects.chatList.limitReset")
            : reset
              ? t("projects.chatList.limitWithReset", {
                  window: windowName,
                  reset,
                })
              : t("projects.chatList.limit", { window: windowName })}
        </span>
      </div>
      {/* On a line of its own: the column is narrow, and beside the reason it
          cut the reason off — which is the half that says why. */}
      {action && (
        <div className="mt-1.5 pl-1.5">
          <button
            type="button"
            disabled={action.busy}
            onClick={action.run}
            className="max-w-full truncate rounded-md bg-primary px-2 py-0.5 text-[0.6875rem] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  )
}
