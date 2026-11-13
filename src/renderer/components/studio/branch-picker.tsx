import { useEffect, useState, type ReactElement } from "react"
import { GitBranch, Globe } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/lib/i18n"
import { useStudio } from "@/lib/store"
import { worktreeBranches } from "@/lib/workspace"

type Branches = { local: string[]; remote: string[] }

/**
 * The system bar's branch name, as the way to another branch — the status
 * bar's branch in every editor opens this list, and that was the click people
 * reached for (`docs/design.md` § Switching branches from the system bar).
 *
 * Read when it opens rather than kept: a branch made in the dock's shell a
 * moment ago should be in it. A switch git refuses — local edits in the way,
 * a branch checked out in another worktree — keeps the list open with git's
 * own sentence under it; one that worked closes it and re-reads the branch
 * names, since a ref moved under `.git` may not wake a watcher.
 */
export function BranchPicker({
  folderId,
  branch,
  trigger,
}: {
  folderId: string
  branch: string
  trigger: ReactElement
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<Branches | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let current = true
    void worktreeBranches(folderId)
      .catch((): Branches => ({ local: [], remote: [] }))
      .then((answer) => {
        if (current) setBranches(answer)
      })
    return () => {
      current = false
    }
  }, [open, folderId])

  function pick(name: string) {
    if (pending || name === branch) return
    setPending(name)
    setError(null)
    void window.desktop
      .gitSwitchBranch(folderId, name)
      .catch((failure: unknown) => ({
        ok: false as const,
        message: failure instanceof Error ? failure.message : String(failure),
      }))
      .then(async (answer) => {
        await useStudio.getState().refreshBranches()
        setPending(null)
        if (answer.ok) setOpen(false)
        else setError(answer.message)
      })
  }

  function row(name: string, remote: boolean) {
    const Icon = remote ? Globe : GitBranch
    return (
      <CommandItem
        key={(remote ? "r:" : "l:") + name}
        value={(remote ? "r:" : "l:") + name}
        keywords={[name]}
        data-checked={!remote && name === branch}
        disabled={pending !== null}
        onSelect={() => pick(name)}
        className="font-mono text-xs"
      >
        {pending === name ? <Spinner className="size-3.5" /> : <Icon />}
        <span className="truncate">{name}</span>
      </CommandItem>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null)
        setOpen(next)
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent side="top" align="start" className="w-80 gap-0 p-0">
        <Command>
          <CommandInput
            placeholder={t("nav.systemBar.branchSearch")}
            spellCheck={false}
          />
          <CommandList>
            {branches === null ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <>
                <CommandEmpty>{t("nav.systemBar.branchNone")}</CommandEmpty>
                {branches.local.length > 0 && (
                  <CommandGroup heading={t("nav.systemBar.branchLocal")}>
                    {branches.local.map((name) => row(name, false))}
                  </CommandGroup>
                )}
                {branches.remote.length > 0 && (
                  <CommandGroup heading={t("nav.systemBar.branchRemote")}>
                    {branches.remote.map((name) => row(name, true))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
        {error && (
          <p className="max-h-32 overflow-y-auto border-t px-3 py-2 font-mono text-[0.6875rem] whitespace-pre-wrap text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
