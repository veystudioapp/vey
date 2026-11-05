import { Cloud, GitBranch, Tag } from "lucide-react"

import type { GitRef } from "@shared/api"
import { useT } from "@/lib/i18n"
import { chipsOf, type RefChip as Chip } from "@/lib/files/ref-chips"
import { cn } from "@/lib/utils"

/**
 * A commit's refs before its subject, the same in the `Commits` view and the
 * `Git Graph` tab: folded (`chipsOf`), and past `max` gathered into one `+n`
 * that names the rest on hover — a sidebar row has room for a subject or for
 * five chips, and the subject is the row.
 */
export function RefChips({
  refs,
  max = Infinity,
}: {
  refs: readonly GitRef[]
  max?: number
}) {
  const chips = chipsOf(refs)
  if (chips.length === 0) return null
  const shown = chips.slice(0, max)
  const rest = chips.slice(max)

  return (
    <>
      {shown.map((chip) => (
        <RefChip key={`${chip.kind}:${chip.name}`} chip={chip} />
      ))}
      {rest.length > 0 && (
        <span
          title={rest.map(describe).join("\n")}
          className="shrink-0 rounded border border-border bg-muted px-1 py-px font-mono text-[0.65rem] text-muted-foreground"
        >
          +{rest.length}
        </span>
      )}
    </>
  )
}

/** One chip: an icon for its kind, the checked-out branch outlined in the
 * primary hue, a cloud after a branch that is also on a remote. */
function RefChip({ chip }: { chip: Chip }) {
  const t = useT()
  const Icon =
    chip.kind === "tag" ? Tag : chip.kind === "remote" ? Cloud : GitBranch
  return (
    <span
      title={describe(chip)}
      className={cn(
        "flex max-w-40 min-w-0 shrink-0 items-center gap-1 rounded border px-1 py-px font-mono text-[0.65rem] leading-none",
        chip.head
          ? "border-primary/60 bg-primary/15 font-semibold text-primary"
          : chip.kind === "tag"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : chip.kind === "remote"
              ? "border-border bg-muted text-muted-foreground"
              : "border-primary/30 bg-primary/5 text-foreground"
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate py-px">{chip.name}</span>
      {chip.remotes.length > 0 && (
        <Cloud
          aria-label={t("files.graph.onRemote", {
            remotes: chip.remotes.join(", "),
          })}
          className="size-3 shrink-0 opacity-70"
        />
      )}
    </span>
  )
}

function describe(chip: Chip): string {
  return chip.remotes.length > 0
    ? `${chip.name} · ${chip.remotes.join(", ")}`
    : chip.name
}
