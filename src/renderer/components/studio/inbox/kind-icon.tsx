import {
  AtSign,
  CalendarClock,
  CircleDot,
  CirclePlus,
  FileText,
  Flag,
  MessageSquare,
  MessageSquareDiff,
  Tag,
  Type,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { InboxItem, InboxKind } from "@shared/api"
import { cn } from "@/lib/utils"

/** What each kind of change is drawn as, so a list of them can be read by its
 * left edge before its words. */
const KIND_ICONS: Record<InboxKind, LucideIcon> = {
  created: CirclePlus,
  status: CircleDot,
  renamed: Type,
  description: FileText,
  priority: Flag,
  due: CalendarClock,
  tags: Tag,
  assigned: Users,
  "assigned-me": UserCheck,
  comment: MessageSquare,
  mention: AtSign,
  "comment-edited": MessageSquareDiff,
}

/** The kinds that are about the reader, drawn in the app's own colour. */
const YOURS: InboxKind[] = ["assigned-me", "mention"]

export function KindIcon({
  item,
  className,
}: {
  item: InboxItem
  className?: string
}) {
  const Icon = KIND_ICONS[item.kind]
  // A status, and the status a task was made in, wear ClickUp's own hue for
  // it — checked as a `#hex` in main (`hexColor`) before it gets here.
  const hue =
    (item.kind === "status" || item.kind === "created") && item.color
      ? { color: item.color }
      : undefined
  return (
    <Icon
      aria-hidden
      style={hue}
      className={cn(
        "size-3.5 shrink-0",
        YOURS.includes(item.kind) ? "text-primary" : "text-muted-foreground",
        className
      )}
    />
  )
}
