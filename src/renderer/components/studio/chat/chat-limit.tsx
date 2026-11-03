import { useState } from "react"

import { Button } from "@/components/ui/button"
import { limitWayOut, type LimitWayOut } from "@/lib/chat/column"
import { isResetDue } from "@/lib/chat/plan-usage"
import { useChats } from "@/lib/chat/store"
import { useT } from "@/lib/i18n"
import { chatOptions, type Chat } from "@shared/api"
import { useAccountName, useColumnAccounts } from "../project/accounts"

/**
 * The way on from a chat its plan limit stopped, as one action — what the
 * column's card and the transcript's limit line both draw, so the two never
 * offer different things (`limitWayOut` decides which).
 *
 * It moves the chat and sends `Continue.`: the transcript goes with it
 * (`carryTranscript` in `main/chat.ts`). With nowhere to go there is nothing
 * to press. `onContinue` is the column's, which opens the chat it was clicked from
 * before the turn starts.
 */
export function useLimitWayOut(
  chat: Chat,
  now: Date,
  onContinue?: () => void
): {
  way: LimitWayOut
  label: string
  busy: boolean
  run: () => void
} | null {
  const t = useT()
  const accounts = useColumnAccounts()
  const [moving, setMoving] = useState(false)

  const current = chatOptions(chat.options).profileId ?? null
  const over = isResetDue(chat.limit?.resetsAt ?? null, now)
  const way = limitWayOut(current, accounts, { over })
  const name = useAccountName(way ? way.profileId : null)

  if (!way) return null
  return {
    way,
    label: over
      ? t("chat.limit.continue")
      : t("chat.limit.continueWith", { name }),
    busy: moving,
    run: () => {
      setMoving(true)
      const chats = useChats.getState()
      void chats
        .setOptions(chat.id, {
          ...chatOptions(chat.options),
          profileId: way.profileId,
        })
        .then(() => {
          onContinue?.()
          return chats.send(chat.id, "Continue.")
        })
        .finally(() => setMoving(false))
    },
  }
}

/**
 * Under the transcript's limit line, the way on — only on the line that
 * stopped the chat as it stands, since an older one is about a limit a later
 * message already got past. A button and no more: the line above already says
 * what happened.
 */
export function LimitWayOutCard({ chat, now }: { chat: Chat; now: Date }) {
  const action = useLimitWayOut(chat, now)
  if (!action) return null
  return (
    <div className="flex justify-end">
      <Button
        size="sm"
        variant="outline"
        disabled={action.busy}
        onClick={action.run}
      >
        {action.label}
      </Button>
    </div>
  )
}
