import { execFile } from "node:child_process"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import {
  addWorktree,
  branchesOf,
  removeWorktree,
  worktreeDir,
  worktreeSlug,
} from "../src/main/worktrees"
import { check, finish, section } from "./harness"

/**
 * `New worktree…`, against a real repository: whether a branch is created or
 * checked out is git's answer, and nothing short of git says it.
 */

const run = promisify(execFile)

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: dir })
  return stdout.trim()
}

async function main() {
  section("slugs")
  check("slashes become dashes", worktreeSlug("feature/SSO") === "feature-sso")
  check("nothing left is empty", worktreeSlug("日本語") === "")
  check(
    "an empty slug still names a directory",
    path.basename(worktreeDir("/w", "f1", "日本語")) === "branch"
  )

  const root = await mkdtemp(path.join(tmpdir(), "veystudio-worktree-"))
  const repo = path.join(root, "repo")
  await run("git", ["init", "--quiet", "-b", "main", repo])
  await git(repo, "config", "user.email", "test@example.com")
  await git(repo, "config", "user.name", "Test")
  await writeFile(path.join(repo, "a.txt"), "a\n")
  await git(repo, "add", "a.txt")
  await git(repo, "commit", "--quiet", "-m", "first")
  await git(repo, "branch", "existing")
  // A remote without a second repository: the refs are all `branchesOf` reads.
  await git(repo, "update-ref", "refs/remotes/origin/main", "HEAD")
  await git(repo, "update-ref", "refs/remotes/origin/remote-only", "HEAD")
  await git(
    repo,
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    "refs/remotes/origin/main"
  )

  section("the branches suggested")
  const known = await branchesOf(repo)
  check("local ones", known.local.join() === "existing,main", known)
  check(
    "remote ones by short name, origin/HEAD left out",
    known.remote.join() === "origin/main,origin/remote-only",
    known
  )
  check(
    "nothing for a folder that is not a repository",
    (await branchesOf(root)).local.length === 0
  )

  section("a new branch")
  const fresh = path.join(root, "wt", "fresh")
  const made = await addWorktree({ repo, dir: fresh, branch: "feature/x" })
  check("is checked out", "dir" in made, made)
  check(
    "on that branch",
    (await git(fresh, "branch", "--show-current")) === "feature/x"
  )
  check("with the files", !!(await stat(path.join(fresh, "a.txt"))))

  section("a branch that exists")
  const again = path.join(root, "wt", "existing")
  const reused = await addWorktree({ repo, dir: again, branch: "existing" })
  check("is checked out, not refused", "dir" in reused, reused)

  section("refusals")
  const twice = await addWorktree({
    repo,
    dir: path.join(root, "wt", "twice"),
    branch: "existing",
  })
  check("a branch checked out elsewhere", "error" in twice, twice)
  const badBase = await addWorktree({
    repo,
    dir: path.join(root, "wt", "bad"),
    branch: "y",
    base: "no-such-ref",
  })
  check("a base that is not there", "error" in badBase, badBase)
  const badName = await addWorktree({
    repo,
    dir: path.join(root, "wt", "bad2"),
    branch: "a..b",
  })
  check("a name git will not take", "error" in badName, badName)
  const notRepo = await addWorktree({
    repo: root,
    dir: path.join(root, "wt", "bad3"),
    branch: "z",
  })
  check("a folder that is not a repository", "error" in notRepo, notRepo)

  section("removing")
  await writeFile(path.join(fresh, "dirty.txt"), "not committed\n")
  check(
    "removes a checkout with changes in it",
    (await removeWorktree(repo, fresh)) === null
  )
  check("the directory is gone", !(await stat(fresh).catch(() => null)))
  check(
    "the branch stays",
    (await git(repo, "branch", "--list", "feature/x")).includes("feature/x")
  )

  await rm(root, { recursive: true, force: true })
  finish()
}

void main()
