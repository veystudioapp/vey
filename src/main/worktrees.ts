import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

/**
 * A second checkout of a project, drawn inside that project.
 *
 * This comes back after `docs/design.md` § Worktrees, as projects, removed —
 * as the narrow half of what was deleted: the checkout, a folder pointed at it
 * and marked `worktreeOf` its project, and `Remove worktree…`. No ahead/behind
 * marks, no `.worktreeinclude`, no setup command, no branch renamed after a
 * chat. The folder is an ordinary workspace folder, so the Explorer, the
 * Changes tab, the dock's shell and the chats work in it with nothing taught
 * about checkouts; only the rail and the column know to file it under its
 * project.
 *
 * Free of `electron`, so `test/worktrees.ts` can import it.
 */

/** Inside this app's own data directory rather than beside the repository: a
 * sibling directory of somebody's project is a thing their tooling will find,
 * and it is also where the deleted feature put them, so a workspace that used
 * both has one place to look. */
export const WORKTREES_DIR = "worktrees"

/**
 * A directory name from a branch name: slashes (`feature/sso`) and anything a
 * filesystem would rather not be handed become one dash. Not `\w`, which keeps
 * `_` and drops every non-ASCII letter — a branch named in Japanese slugs to
 * nothing, which is what `worktreeDir`'s fallback is for.
 */
export function worktreeSlug(text: string, max = 40): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.slice(0, max).replace(/-+$/g, "")
}

/**
 * Where one project's checkout of a branch goes — keyed by the project as well
 * as the branch, since one branch name in two repositories is two checkouts.
 */
export function worktreeDir(
  workspaceDir: string,
  folderId: string,
  branch: string
): string {
  return path.join(
    workspaceDir,
    WORKTREES_DIR,
    folderId,
    worktreeSlug(branch) || "branch"
  )
}

/**
 * Adds a checkout of `repo` at `dir`, on `branch` — created off `base` (or
 * HEAD) when it does not exist, checked out when it does.
 *
 * An existing branch is checked out rather than refused: coming back to work
 * started last week is the same gesture as starting it. That includes one that
 * exists only on a single remote, which git's own DWIM turns into a local
 * branch tracking it — `-b` tried first would have shadowed it with a fresh
 * branch off HEAD.
 *
 * `--no-track` beside a base, or `origin/main` would become the new branch's
 * upstream and a `git push` from the checkout would refuse on the differing
 * names.
 *
 * Answers with git's own sentence rather than throwing: "already checked out",
 * "not a valid reference" are states of somebody's afternoon, for the dialog.
 */
export async function addWorktree(input: {
  repo: string
  dir: string
  branch: string
  base?: string
}): Promise<{ dir: string } | { error: string }> {
  const { repo, dir } = input
  const branch = input.branch.trim()
  const base = input.base?.trim() || null

  if (!branch) return { error: "Name the branch." }
  if (!(await git(repo, ["rev-parse", "--git-dir"])).ok) {
    return { error: `${repo} is not a git repository.` }
  }
  if (!(await git(repo, ["check-ref-format", "--branch", branch])).ok) {
    return { error: `“${branch}” is not a valid branch name.` }
  }

  const [local, remotes] = await Promise.all([
    git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]),
    git(repo, [
      "for-each-ref",
      "--format=%(refname)",
      `refs/remotes/*/${branch}`,
    ]),
  ])
  // Exactly one remote, as git's DWIM requires: two would be a guess.
  const existing =
    local.ok || remotes.out.split("\n").filter(Boolean).length === 1

  const added = await git(
    repo,
    existing
      ? ["worktree", "add", dir, branch]
      : base
        ? ["worktree", "add", "--no-track", "-b", branch, dir, base]
        : ["worktree", "add", "-b", branch, dir]
  )
  return added.ok ? { dir } : { error: added.err || "git worktree failed." }
}

/**
 * The branches `New worktree…` suggests: local ones, and remote ones by their
 * short name (`origin/feature-x`) — the same name `addWorktree` turns into a
 * local branch tracking it. `origin/HEAD` is a pointer, not a branch, and is
 * left out. Empty for a folder that is not a repository: the field is still
 * free text, and `addWorktree` says why it refused.
 */
export async function branchesOf(
  repo: string
): Promise<{ local: string[]; remote: string[] }> {
  const listed = await git(repo, [
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads",
    "refs/remotes",
  ])
  const local: string[] = []
  const remote: string[] = []
  for (const ref of listed.out.split("\n")) {
    if (ref.startsWith("refs/heads/")) {
      local.push(ref.slice("refs/heads/".length))
    } else if (ref.startsWith("refs/remotes/") && !ref.endsWith("/HEAD")) {
      remote.push(ref.slice("refs/remotes/".length))
    }
  }
  return { local, remote }
}

/**
 * Removes a checkout. `--force` because a checkout somebody has worked in is
 * dirty by definition, and refusing "because there are changes" would strand
 * every directory this app made under its own data folder; the dialog that
 * asks says what that costs. The branch is kept — its commits are the work.
 */
export async function removeWorktree(
  repo: string,
  dir: string
): Promise<{ error: string } | null> {
  const removed = await git(repo, ["worktree", "remove", "--force", dir])
  return removed.ok
    ? null
    : { error: removed.err || "git worktree remove failed." }
}

async function git(
  cwd: string,
  args: string[]
): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const { stdout } = await run("git", args, { cwd, windowsHide: true })
    return { ok: true, out: stdout.trim(), err: "" }
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr
    return {
      ok: false,
      out: "",
      // `fatal: ` is git's prefix for every refusal and says nothing to
      // somebody reading it in a dialog.
      err:
        typeof stderr === "string"
          ? stderr.trim().replace(/^fatal: /gm, "")
          : "",
    }
  }
}
