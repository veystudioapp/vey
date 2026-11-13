import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import {
  checkoutDetached,
  cherryPick,
  commitFiles,
  commitMessage,
  compareBase,
  createBranch,
  createTag,
  switchBranch,
} from "../src/main/git"
import { check, finish, section } from "./harness"

/**
 * The Git Graph's row menu, against a real repository — what is relied on is
 * git's own behaviour: which states it refuses a checkout or a pick in, what a
 * conflicted and an empty cherry-pick leave behind, and what a merge base is.
 */

const run = promisify(execFile)

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: dir })
  return stdout.trim()
}

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "veystudio-git-graph-menu-"))
  await git(root, "init", "--initial-branch", "main")
  await git(root, "config", "user.email", "test@example.com")
  await git(root, "config", "user.name", "Test")
  await git(root, "config", "core.autocrlf", "false")
  await git(root, "config", "commit.gpgsign", "false")
  await git(root, "config", "tag.gpgsign", "false")
  return root
}

async function commitFile(
  dir: string,
  file: string,
  text: string,
  message: string
): Promise<string> {
  await writeFile(path.join(dir, file), text)
  await git(dir, "add", file)
  await git(dir, "commit", "-m", message)
  return git(dir, "rev-parse", "HEAD")
}

const dir = await repository()
try {
  const first = await commitFile(dir, "a.txt", "one\n", "first")
  const second = await commitFile(
    dir,
    "a.txt",
    "one\ntwo\n",
    "second\n\nThe body.\n\nTrailer: yes"
  )

  section("commitMessage")
  check(
    "the whole message, body and trailers",
    (await commitMessage(dir, second)) === "second\n\nThe body.\n\nTrailer: yes"
  )
  check("a non-hash is refused", (await commitMessage(dir, "--all")) === null)

  section("createBranch / createTag")
  const branched = await createBranch(dir, "topic", first, false)
  check("a branch at a commit", branched.ok, branched)
  check("pointing at it", (await git(dir, "rev-parse", "topic")) === first)
  check(
    "and not checked out",
    (await git(dir, "rev-parse", "--abbrev-ref", "HEAD")) === "main"
  )
  const flag = await createBranch(dir, "--force", first, false)
  check("an option is not a name", !flag.ok, flag)
  const bad = await createBranch(dir, "a..b", first, false)
  check("nor is what check-ref-format refuses", !bad.ok, bad)
  const again = await createBranch(dir, "topic", second, false)
  check("an existing branch is git's refusal", !again.ok && !!again.message)

  const light = await createTag(dir, "v1", first, "")
  check("a lightweight tag", light.ok, light)
  check(
    "is a commit, not a tag object",
    (await git(dir, "cat-file", "-t", "v1")) === "commit"
  )
  const annotated = await createTag(dir, "v2", second, "Release two")
  check("an annotated tag", annotated.ok, annotated)
  check("is a tag object", (await git(dir, "cat-file", "-t", "v2")) === "tag")

  section("compareBase")
  check(
    "no upstream answers null",
    (await compareBase(dir, second, { kind: "upstream" })) === null
  )
  check(
    "a commit in HEAD's history has no merge base to compare with",
    (await compareBase(dir, first, { kind: "mergeBase" })) === null
  )
  check(
    "a ref by name",
    (await compareBase(dir, second, { kind: "ref", ref: "v1" }))?.hash === first
  )
  check(
    "a flag is not a ref",
    (await compareBase(dir, second, { kind: "ref", ref: "--all" })) === null
  )
  check(
    "a name git cannot read",
    (await compareBase(dir, second, { kind: "ref", ref: "nope" })) === null
  )

  // A side branch off `first`, so it and main part ways there.
  await git(dir, "checkout", "-q", "topic")
  const side = await commitFile(dir, "b.txt", "side\n", "side")
  await git(dir, "checkout", "-q", "main")
  const base = await compareBase(dir, side, { kind: "mergeBase" })
  check("a side branch's merge base with HEAD", base?.hash === first, base)
  const compared = await commitFiles(dir, side, first)
  check(
    "commitFiles against a base",
    compared.length === 1 && compared[0]?.path === "b.txt",
    compared
  )
  const wide = await commitFiles(dir, side, second)
  check(
    "against another line, both lines' files",
    wide.map((file) => file.path).join(",") === "a.txt,b.txt",
    wide
  )
  check(
    "a base that is not a hash is refused",
    (await commitFiles(dir, side, "HEAD~1")).length === 0
  )

  section("cherryPick")
  const picked = await cherryPick(dir, side)
  check("a clean pick", picked.ok, picked)
  check(
    "lands on HEAD",
    (await git(dir, "log", "-1", "--format=%s")) === "side"
  )
  const empty = await cherryPick(dir, side)
  check("picking it again is empty", !empty.ok && empty.empty === true, empty)
  check(
    "and is aborted rather than left in progress",
    (await git(dir, "status", "--porcelain")) === "" &&
      (await git(dir, "rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD").catch(
        () => ""
      )) === ""
  )

  // Two lines changing one line of one file.
  await git(dir, "checkout", "-q", "-b", "clash", first)
  const theirs = await commitFile(dir, "a.txt", "ONE\n", "clash")
  await git(dir, "checkout", "-q", "main")
  const clash = await cherryPick(dir, theirs)
  check("a conflict is said", !clash.ok && clash.conflict === true, clash)
  check(
    "and left in the file to resolve",
    (await readFile(path.join(dir, "a.txt"), "utf8")).includes("<<<<<<<")
  )
  await git(dir, "cherry-pick", "--abort")

  section("checkoutDetached")
  await writeFile(path.join(dir, "a.txt"), "edited\n")
  const refused = await checkoutDetached(dir, first)
  check("refused over local edits it would lose", !refused.ok, refused)
  await git(dir, "checkout", "--", "a.txt")
  const detached = await checkoutDetached(dir, first)
  check("detaches at the commit", detached.ok, detached)
  check(
    "HEAD is the commit, on no branch",
    (await git(dir, "rev-parse", "HEAD")) === first &&
      (await git(dir, "rev-parse", "--abbrev-ref", "HEAD")) === "HEAD"
  )
  const notHash = await checkoutDetached(dir, "main")
  check("only a hash is checked out", !notHash.ok)

  const switched = await createBranch(dir, "fresh", second, true)
  check("a branch made and checked out", switched.ok, switched)
  check(
    "is the branch HEAD is on",
    (await git(dir, "rev-parse", "--abbrev-ref", "HEAD")) === "fresh"
  )

  section("switchBranch")
  const head = () => git(dir, "rev-parse", "--abbrev-ref", "HEAD")
  const toMain = await switchBranch(dir, "main")
  check("a local branch", toMain.ok && (await head()) === "main", toMain)
  const unknown = await switchBranch(dir, "nowhere")
  check("a branch that does not exist is refused", !unknown.ok, unknown)
  const option = await switchBranch(dir, "--detach")
  check("an option is not a branch", !option.ok, option)
  await writeFile(path.join(dir, "a.txt"), "edited\n")
  const blocked = await switchBranch(dir, "topic")
  check(
    "refused over local edits it would lose",
    !blocked.ok && (await head()) === "main",
    blocked
  )
  await git(dir, "checkout", "--", "a.txt")

  // A remote whose fetch refspec owns `refs/remotes/origin/*`, so `--track`
  // knows what to track; the ref itself is written rather than fetched.
  await git(dir, "remote", "add", "origin", dir)
  await git(dir, "update-ref", "refs/remotes/origin/feature", first)
  const tracked = await switchBranch(dir, "origin/feature")
  check(
    "a remote branch becomes a local one tracking it",
    tracked.ok &&
      (await head()) === "feature" &&
      (await git(dir, "rev-parse", "--abbrev-ref", "feature@{upstream}")) ===
        "origin/feature",
    tracked
  )
  await switchBranch(dir, "main")
  const back = await switchBranch(dir, "origin/feature")
  check(
    "and the second time, the local one it already made",
    back.ok && (await head()) === "feature",
    back
  )
} finally {
  await rm(dir, { recursive: true, force: true })
}

finish()
