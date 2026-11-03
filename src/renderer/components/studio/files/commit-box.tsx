import { useRef, useState, type KeyboardEvent } from "react"
import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Claude } from "@/components/ui/svgs/claude"
import { Textarea } from "@/components/ui/textarea"
import { useClaudeProfiles } from "@/lib/chat/claude-profiles"
import { useAgentModels } from "@/lib/chat/models"
import { useCommitBox, useCommitBoxes } from "@/lib/files/commit-box"
import type { FileRoot } from "@/lib/files/roots"
import { useT } from "@/lib/i18n"
import { useSettings } from "@/lib/settings"
import { isStudioShortcut } from "@/lib/shortcuts"
import { ModelMenu, ProfileMenu } from "../chat/chat-composer"

/**
 * The message, and the button that ends a reading of the diff.
 *
 * **This app did not commit, deliberately, and this is the reversal.** The rule
 * was that staging and discarding are answered by pointing at rows while a
 * commit is a *sentence somebody writes* — and a panel this narrow is a bad
 * place to write a paragraph, with a shell one click away in the dock that is a
 * better one. What changed is the sentence: the read-only `claude` this app
 * already runs can draft it off the staged diff (`draftCommitMessage`), so the
 * gesture is now reading a diff and then ending that reading, which is the one
 * thing every other panel here lets somebody do to what it is showing.
 *
 * The line moved by exactly one step and no further. There is no amend, no log,
 * no branch and no push, and there will not be: those are a git client, and the
 * shell in the dock is a better one than this would ever become.
 * `docs/design.md` § Committing carries the argument in full.
 *
 * Drawn only when something is **staged**, which is also what makes it honest
 * about what it commits. A box that was always there would be a box that
 * commits nothing most of the time, and one that committed the working tree
 * would be a second meaning for `Staged` two rows below it.
 */
export function CommitBox({ root }: { root: FileRoot }) {
  const t = useT()
  // In a store rather than `useState`: this box is unmounted by switching the
  // `Git` tab to `Commits`, and a draft or a typed message has to survive that.
  const { message, committing, drafting, error } = useCommitBox(root.id)
  const boxes = useCommitBoxes.getState()
  const commit = () => boxes.commit(root)
  const draft = () => boxes.draft(root)
  const stopDraft = () => boxes.stopDraft(root)

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/60 px-3 py-2">
      {/* `rounded-lg` is the textarea's own, which the ring inherits; the
          border is the textarea's too, so the ring does not reach past it. */}
      <div
        className="border-run rounded-lg [--run-edge:0px]"
        data-running={drafting || undefined}
      >
        <Textarea
          value={message}
          onChange={(event) => boxes.setMessage(root.id, event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            // ⌘⏎ commits, which is the shortcut every message box in every forge
            // and editor has. A bare Enter must not: a commit message has a body,
            // and this is the field it is typed in.
            // Lowercased, which is what `isStudioShortcut` compares against.
            if (!isStudioShortcut(event.nativeEvent, "enter")) return
            event.preventDefault()
            void commit()
          }}
          placeholder={t("files.commitBox.placeholder")}
          // Two lines to start with, which is a subject and the blank line under
          // it — the shape of the message this is for. It grows as one is typed.
          rows={2}
          className="min-h-14 resize-none text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={committing}
          onClick={() => (drafting ? stopDraft() : void draft())}
          className="h-6 gap-1.5 px-2 text-[0.6875rem]"
          title={
            drafting
              ? t("files.commitBox.stopDrafting")
              : t("files.commitBox.draftTitle")
          }
        >
          {drafting ? (
            <Spinner className="size-3" />
          ) : (
            <Claude className="size-3" />
          )}
          {drafting ? t("files.commitBox.stop") : t("files.commitBox.draft")}
        </Button>
        <CommitSettingsButton />

        <div className="min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground">
          {error && (
            <span className="text-destructive" title={error}>
              {error}
            </span>
          )}
        </div>

        <Button
          size="sm"
          disabled={committing || !message.trim()}
          onClick={() => void commit()}
          className="h-6 px-2 text-[0.6875rem]"
        >
          {committing ? <Spinner className="size-3" /> : null}
          {t("files.commitBox.commit")}
        </Button>
      </div>
    </div>
  )
}

/**
 * What a draft runs on and the rules it follows, edited beside the button that
 * drafts.
 *
 * Here and nowhere else — not a Settings row — because both are wanted at the
 * moment a draft comes back wrong, which is in front of this box. Lit while
 * there are rules, so somebody reading a draft can tell it was steered.
 */
function CommitSettingsButton() {
  const t = useT()
  const rules = useSettings((state) => state.commitRules)
  const [open, setOpen] = useState(false)
  const set = rules.trim().length > 0

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="relative size-6 p-0"
        title={t("files.commitBox.settingsTitle")}
        aria-label={t("files.commitBox.settingsTitle")}
      >
        <Settings className="size-3.5" />
        {set && (
          <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />
        )}
      </Button>
      {/* Mounted only while open, so the fields start from what is saved
          rather than from whatever was picked and cancelled last time. */}
      {open && <CommitSettingsDialog onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Everything here is held until Save, the model included, so Cancel undoes the
 * whole dialog rather than only the half of it that was a text field.
 *
 * The model and account are the one turn in the app with no toolbar of its own
 * — a draft is not a conversation somebody sits in front of — so they are asked
 * here rather than per turn. See `main/one-turn-agent.ts`; the `review*` field
 * names are what is already on disk.
 */
function CommitSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const saved = useSettings.getState()
  const [rules, setRules] = useState(saved.commitRules)
  const [model, setModel] = useState(saved.reviewModel)
  const [effort, setEffort] = useState(saved.reviewEffort)
  const [profileId, setProfileId] = useState(saved.reviewProfileId)
  const profiles = useClaudeProfiles((state) => state.profiles)
  const models = useAgentModels(profileId)
  const field = useRef<HTMLTextAreaElement>(null)

  const save = () => {
    const settings = useSettings.getState()
    settings.setCommitRules(rules.trim())
    settings.setReviewModel(model, effort)
    settings.setReviewProfileId(profileId)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent initialFocus={field} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("files.commitBox.settings")}</DialogTitle>
          <DialogDescription>
            {t("files.commitBox.settingsDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{t("files.commitBox.model")}</p>
          <p className="text-xs text-muted-foreground">
            {t("files.commitBox.modelDescription")}
          </p>
          <div className="flex items-center gap-1.5">
            <ModelMenu
              models={models}
              profileId={profileId}
              model={model}
              effort={effort}
              onPick={(nextModel, nextEffort) => {
                setModel(nextModel)
                setEffort(nextEffort)
              }}
            />
            {profiles.length > 0 && (
              <ProfileMenu
                profiles={profiles}
                profileId={profileId}
                onPick={setProfileId}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{t("files.commitBox.rules")}</p>
          <p className="text-xs text-muted-foreground">
            {t("files.commitBox.rulesDescription")}
          </p>
          <Textarea
            ref={field}
            value={rules}
            onChange={(event) => setRules(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (!isStudioShortcut(event.nativeEvent, "enter")) return
              event.preventDefault()
              save()
            }}
            placeholder={t("files.commitBox.rulesPlaceholder")}
            spellCheck={false}
            // `md:` too: the shadcn textarea's own `md:text-sm` is a different
            // variant from `text-xs`, so it survives the merge and wins.
            className="min-h-40 font-mono text-xs md:text-xs"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={save}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
