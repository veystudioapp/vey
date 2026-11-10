import type { BotInput } from "@shared/api"

/**
 * The starting points the empty `Bots` tab offers — the three uses argued for
 * in `docs/design.md` § Bots, each of which only works locally: your tracker
 * through your own MCP, your `gh` login, your commits.
 *
 * The prompts are **not** translated, for the rule `docs/design.md`
 * § Language gives: nothing sent to `claude` is. They are a draft in the form,
 * edited before anything runs.
 */
export type BotTemplate = {
  id: "brief" | "reviews" | "standup"
  draft: Partial<BotInput>
}

const WEEKDAYS = [1, 2, 3, 4, 5]

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    id: "brief",
    draft: {
      prompt:
        "Give me a short brief for today in this project: the tasks assigned to me in our tracker (through whichever MCP server for it is connected), which of them already have a branch or commits here, and what was left half-done (uncommitted changes, the last commits on the current branch). A list I can read in a minute.",
      schedule: { kind: "daily", time: "08:30", days: WEEKDAYS },
      quiet: true,
    },
  },
  {
    id: "reviews",
    draft: {
      prompt:
        'Run `gh pr list --search "review-requested:@me" --state open`. For each pull request I have not reviewed yet, read its diff with `gh pr diff` and tell me in a few lines what it changes, what looks risky, and where to look first. Do not comment on GitHub.',
      schedule: { kind: "every", hours: 3, days: WEEKDAYS },
      quiet: true,
    },
  },
  {
    id: "standup",
    draft: {
      prompt:
        "Write my standup notes for this repository: what I committed since the previous working day (`git log --all --author` with my `git config user.email`), grouped by topic, and what is still uncommitted. Three short sections: Done, In progress, Blocked — leave Blocked empty unless something says so.",
      schedule: { kind: "daily", time: "09:45", days: WEEKDAYS },
      quiet: false,
    },
  },
]
