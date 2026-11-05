import {
  ArrowUpRight,
  Bug,
  Lightbulb,
  MessageSquareHeart,
  Sparkles,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  buildLabel,
  ISSUES_URL,
  issueUrl,
  useFeedbackDialog,
  type FeedbackContext,
  type FeedbackKind,
} from "@/lib/feedback"
import { useUpdates } from "@/lib/updates"
import { cn } from "@/lib/utils"

/**
 * One row per kind. The colours are whole class names rather than built from a
 * hue, because Tailwind only generates classes it can read in the source.
 */
const OPTIONS: {
  kind: FeedbackKind
  title: string
  description: string
  icon: LucideIcon
  tile: string
  hover: string
}[] = [
  {
    kind: "bug",
    title: "Report a bug",
    description: "Something broken, crashing, or not doing what it should.",
    icon: Bug,
    tile: "bg-rose-500/12 text-rose-500 ring-rose-500/20",
    hover: "hover:border-rose-500/40 hover:bg-rose-500/5",
  },
  {
    kind: "feature",
    title: "Request a feature",
    description: "Something the app doesn't do yet that you'd like it to.",
    icon: Lightbulb,
    tile: "bg-amber-500/12 text-amber-500 ring-amber-500/20",
    hover: "hover:border-amber-500/40 hover:bg-amber-500/5",
  },
  {
    kind: "improvement",
    title: "Suggest an improvement",
    description:
      "Something that works, but could be easier, faster or clearer.",
    icon: Sparkles,
    tile: "bg-violet-500/12 text-violet-500 ring-violet-500/20",
    hover: "hover:border-violet-500/40 hover:bg-violet-500/5",
  },
]

/**
 * Report a bug, ask for a feature, suggest an improvement — each a GitHub
 * issue on the repository, opened in the browser with a template and
 * this build's version and OS already written in (`lib/feedback.ts`). Nothing
 * is sent from the app itself: the issue is the user's to read before filing.
 */
export function FeedbackDialog() {
  const open = useFeedbackDialog((state) => state.open)
  const close = useFeedbackDialog((state) => state.close)
  const version = useUpdates((state) => state.check?.current ?? "")
  const context: FeedbackContext = {
    version,
    platform: window.desktop.platform,
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="gap-5 overflow-hidden p-0 sm:max-w-md">
        <div className="relative flex flex-col items-center gap-3 bg-linear-to-b from-violet-500/12 via-amber-400/6 to-transparent px-6 pt-7">
          <div
            aria-hidden
            className="absolute top-3 size-24 rounded-full bg-radial from-violet-400/25 to-transparent blur-xl"
          />
          <span className="relative flex size-12 animate-pop items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-amber-400 text-white shadow-lg shadow-violet-500/25">
            <MessageSquareHeart className="size-6" />
          </span>
          <DialogHeader className="relative items-center gap-1 text-center">
            <DialogTitle className="text-lg font-semibold">
              Help shape Vey
            </DialogTitle>
            <DialogDescription className="max-w-xs">
              Found a bug or have an idea? Pick one — it opens on GitHub with
              the details filled in.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-2 px-6">
          {OPTIONS.map((option, index) => (
            <a
              key={option.kind}
              href={issueUrl(option.kind, context)}
              // Out to the browser — `setWindowOpenHandler` in `main.ts` sends
              // a new window's URL to `shell.openExternal`.
              target="_blank"
              rel="noreferrer"
              onClick={close}
              className={cn(
                "group flex animate-rise items-center gap-3 rounded-xl border bg-card p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                option.hover
              )}
              style={{ animationDelay: `${60 + index * 50}ms` }}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                  option.tile
                )}
              >
                <option.icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{option.title}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {option.description}
                </span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
            </a>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
          <span className="truncate tabular-nums">{buildLabel(context)}</span>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            onClick={close}
            className="flex shrink-0 items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
          >
            Browse existing issues
            <ArrowUpRight className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
