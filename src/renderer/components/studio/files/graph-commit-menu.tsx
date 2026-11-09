import { useRef, useState } from "react"
import {
  Cherry,
  Copy,
  ExternalLink,
  FileDiff,
  GitBranchPlus,
  GitCompare,
  LocateFixed,
  MessageSquarePlus,
  Sparkles,
  Tag,
} from "lucide-react"

import type { GitCommit, GitCompareAgainst, GitWriteResult } from "@shared/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useChats } from "@/lib/chat/store"
import { useComposerBus } from "@/lib/chat/composer-bus"
import { askAboutLoggedCommit, commitUrl } from "@/lib/files/git-blame"
import type { FileRoot } from "@/lib/files/roots"
import { useT } from "@/lib/i18n"
import {
  BranchCombobox,
  type BranchGroup,
  type BranchOption,
} from "../project/new-worktree-dialog"

/** What the menu asks of the tab — the parts that change what it draws. */
export type GraphMenuActions = {
  /** The commit picked, and its first file in the diff tab. */
  openChanges: (commit: GitCommit) => void
  /** The commit picked, compared with what `against` resolves to. */
  compare: (commit: GitCommit, against: GitCompareAgainst) => void
  /** One of the writes, run, and git's answer said over the list. */
  write: (run: () => Promise<GitWriteResult>, done: string) => void
  /** A dialog over the tab — a name to give, or a ref to compare with. */
  ask: (dialog: GraphDialog) => void
}

export type GraphDialog = {
  kind: "branch" | "tag" | "compare"
  commit: GitCommit
} | null

/**
 * The Git Graph's row menu: read the commit, move to it, make a ref at it,
 * bring it here, compare it, copy it, ask about it — `docs/design.md` § The
 * Git Graph tab's menu.
 *
 * `mergeBase` is whether that comparison has anything to show, asked when the
 * menu opened (`gitCompareBase`): a commit already in `HEAD`'s history is its
 * own merge base, and the item is greyed rather than opening an empty list.
 */
export function GraphCommitMenu({
  commit,
  root,
  upstream,
  webUrl,
  mergeBase,
  actions,
}: {
  commit: GitCommit | null
  root: FileRoot
  /** The checked-out branch's upstream, `origin/main` — null without one. */
  upstream: string | null
  webUrl: string | null
  mergeBase: boolean
  actions: GraphMenuActions
}) {
  const t = useT()
  if (!commit) return null
  const short = commit.shortHash
  const forge = webUrl && new URL(webUrl).hostname.replace(/\.(com|org)$/, "")

  return (
    <ContextMenuContent className="w-60">
      <ContextMenuItem onClick={() => actions.openChanges(commit)}>
        <FileDiff />
        {t("files.graph.menu.openChanges")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() =>
          actions.write(
            () =>
              window.desktop.gitCheckoutDetached(root.folderId, commit.hash),
            t("files.graph.menu.checkedOut", { hash: short })
          )
        }
      >
        <LocateFixed />
        {t("files.graph.menu.checkout")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => actions.ask({ kind: "branch", commit })}>
        <GitBranchPlus />
        {t("files.graph.menu.createBranch")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.ask({ kind: "tag", commit })}>
        <Tag />
        {t("files.graph.menu.createTag")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={commit.refs.some((ref) => ref.head)}
        onClick={() =>
          actions.write(
            () => window.desktop.gitCherryPick(root.folderId, commit.hash),
            t("files.graph.menu.picked", { hash: short })
          )
        }
      >
        <Cherry />
        {t("files.graph.menu.cherryPick")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!upstream}
        onClick={() => actions.compare(commit, { kind: "upstream" })}
      >
        <GitCompare />
        {upstream
          ? t("files.graph.menu.compareRemote", { name: upstream })
          : t("files.graph.menu.compareRemoteNone")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!mergeBase}
        onClick={() => actions.compare(commit, { kind: "mergeBase" })}
      >
        <GitCompare />
        {t("files.graph.menu.compareMergeBase")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.ask({ kind: "compare", commit })}>
        <GitCompare />
        {t("files.graph.menu.compareWith")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => void navigator.clipboard.writeText(commit.hash)}
      >
        <Copy />
        {t("files.graph.menu.copyHash")}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() =>
          // The whole message, which the log row does not carry; the subject
          // if the read fails, rather than nothing.
          void window.desktop
            .gitCommitMessage(root.folderId, commit.hash)
            .catch(() => null)
            .then((message) =>
              navigator.clipboard.writeText(message || commit.subject)
            )
        }
      >
        <Copy />
        {t("files.graph.menu.copyMessage")}
      </ContextMenuItem>
      {webUrl && forge && (
        <ContextMenuItem
          onClick={() =>
            window.open(commitUrl(webUrl, commit.hash), "_blank", "noreferrer")
          }
        >
          <ExternalLink />
          {t("files.commits.openOn", {
            forge: forge[0]!.toUpperCase() + forge.slice(1),
          })}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() =>
          // Into the draft of the chat on screen, never sent — the blame
          // card's `Ask in chat`.
          useComposerBus
            .getState()
            .deliver({ text: askAboutLoggedCommit(commit) })
        }
      >
        <MessageSquarePlus />
        {t("files.graph.menu.addToChat")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void explainCommit(root, commit)}>
        <Sparkles />
        {t("files.graph.menu.explain")}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

/**
 * A new chat in the commit's project, asked at once to explain it. A
 * conversation, not a helper turn: it is asked for out loud, answers in a chat
 * somebody can keep talking in, and runs on that chat's own toolbar.
 *
 * In English, as everything sent to `claude` is (`docs/design.md` § Language).
 * It names the hash and leaves the reading to the CLI's own `git show`, rather
 * than pasting a diff that may be thousands of lines into the message.
 */
async function explainCommit(root: FileRoot, commit: GitCommit) {
  const chats = useChats.getState()
  const id = await chats.create({ folderId: root.folderId })
  if (!id) return
  await chats.send(
    id,
    `Explain the changes in commit ${commit.hash} ("${commit.subject}") by ${commit.author}. ` +
      `Read it with \`git show ${commit.hash}\`, then say what changed, why it was likely done, ` +
      `and anything in it worth a second look.`
  )
}

/**
 * A branch or a tag at the picked commit: its name, and for a branch whether
 * to check it out, for a tag an optional message (which makes it annotated).
 * git's refusal is drawn in the dialog so the name can be fixed, not retyped.
 */
export function CreateRefDialog({
  kind,
  commit,
  root,
  onDone,
  onClose,
}: {
  kind: "branch" | "tag"
  commit: GitCommit
  root: FileRoot
  /** What was made, said over the list. */
  onDone: (said: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [name, setName] = useState("")
  const [checkout, setCheckout] = useState(true)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const trimmed = name.trim()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !trimmed) return
    setBusy(true)
    setError(null)
    const answer = await (
      kind === "branch"
        ? window.desktop.gitCreateBranch(
            root.folderId,
            trimmed,
            commit.hash,
            checkout
          )
        : window.desktop.gitCreateTag(
            root.folderId,
            trimmed,
            commit.hash,
            message
          )
    ).catch((failure: unknown): GitWriteResult => ({
      ok: false,
      message: failure instanceof Error ? failure.message : String(failure),
    }))
    setBusy(false)
    if (!answer.ok) {
      setError(answer.message)
      return
    }
    onDone(
      kind === "tag"
        ? t("files.graph.menu.tagged", {
            name: trimmed,
            hash: commit.shortHash,
          })
        : checkout
          ? t("files.graph.menu.branchedOut", { name: trimmed })
          : t("files.graph.menu.branched", {
              name: trimmed,
              hash: commit.shortHash,
            })
    )
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent initialFocus={field}>
        <DialogHeader>
          <DialogTitle>
            {kind === "branch"
              ? t("files.graph.menu.branchTitle")
              : t("files.graph.menu.tagTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("files.graph.menu.atCommit", {
              hash: commit.shortHash,
              subject: commit.subject,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="graph-ref-name">
              {kind === "branch"
                ? t("files.graph.menu.branchName")
                : t("files.graph.menu.tagName")}
            </Label>
            <Input
              id="graph-ref-name"
              ref={field}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "branch" ? "feature/my-change" : "v1.0.0"}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              className="font-mono"
            />
          </div>
          {kind === "branch" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={checkout}
                disabled={busy}
                onCheckedChange={(checked) => setCheckout(checked === true)}
              />
              {t("files.graph.menu.checkoutAfter")}
            </label>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="graph-tag-message">
                {t("files.graph.menu.tagMessage")}
              </Label>
              <Textarea
                id="graph-tag-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={busy}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {t("files.graph.menu.tagMessageHint")}
              </p>
            </div>
          )}
          {error && (
            <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !trimmed}>
              {kind === "branch"
                ? t("files.graph.menu.createBranchSubmit")
                : t("files.graph.menu.createTagSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `Compare with…`: a branch off the list, or any ref typed — a tag, a hash,
 * `HEAD~3` — offered as `Use “…”`, the worktree dialog's `Based on` field.
 * main reads the name (`compareBase`), and one it cannot is said here.
 */
export function CompareWithDialog({
  commit,
  root,
  branches,
  tags,
  onCompare,
  onClose,
}: {
  commit: GitCommit
  root: FileRoot
  branches: { local: string[]; remote: string[] }
  /** The tags on the commits read so far — every tag would be another call
   * for a list nobody scrolls; a tag further back can be typed. */
  tags: string[]
  onCompare: (base: { hash: string; label: string }) => void
  onClose: () => void
}) {
  const t = useT()
  const [value, setValue] = useState<BranchOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groups: BranchGroup[] = [
    {
      label: t("files.graph.localBranches"),
      items: branches.local.map((name) => ({ value: name })),
    },
    {
      label: t("files.graph.remoteBranches"),
      items: branches.remote.map((name) => ({ value: name })),
    },
    {
      label: t("files.graph.menu.tags"),
      items: tags.map((name) => ({ value: name })),
    },
  ].filter((group) => group.items.length > 0)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !value) return
    setBusy(true)
    setError(null)
    const base = await window.desktop
      .gitCompareBase(root.folderId, commit.hash, {
        kind: "ref",
        ref: value.value,
      })
      .catch(() => null)
    setBusy(false)
    if (!base) {
      setError(t("files.graph.menu.noSuchRef", { ref: value.value }))
      return
    }
    onCompare(base)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("files.graph.menu.compareTitle")}</DialogTitle>
          <DialogDescription>
            {t("files.graph.menu.compareDescription", {
              hash: commit.shortHash,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <BranchCombobox
            id="graph-compare-ref"
            value={value}
            onChange={setValue}
            groups={groups}
            placeholder="main"
            disabled={busy}
          />
          {error && (
            <p className="font-mono text-xs whitespace-pre-wrap text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !value}>
              {t("files.graph.menu.compareSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
