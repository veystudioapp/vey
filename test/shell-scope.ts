import {
  projectOf,
  scopedShells,
  shownShellId,
} from "../src/renderer/lib/shell/scope"
import { check, finish, section } from "./harness"

/**
 * The dock's strip, one project at a time.
 *
 * The failure worth guarding is quiet: a worktree's shell drawn under no
 * project would simply vanish from the strip while its pty kept running, and a
 * dock that showed another project's shell would be a `git log` run in the
 * wrong repository.
 */

const folders = [
  { id: "app" },
  { id: "app-fix", worktreeOf: "app" },
  { id: "site" },
]
const shells = [
  { id: "a1", folderId: "app" },
  { id: "s1", folderId: "site" },
  { id: "w1", folderId: "app-fix" },
  { id: "a2", folderId: "app" },
]
const ids = (list: { id: string }[]) => list.map((s) => s.id).join(",")

section("projectOf")
check("a worktree is its project's", projectOf(folders, "app-fix") === "app")
check("a project is its own", projectOf(folders, "site") === "site")
check("an unknown folder is itself", projectOf(folders, "gone") === "gone")

section("scopedShells")
{
  const app = scopedShells(shells, folders, "app", false)
  check(
    "keeps the project's and its worktrees'",
    ids(app) === "a1,w1,a2",
    ids(app)
  )
  const site = scopedShells(shells, folders, "site", false)
  check("drops the other projects'", ids(site) === "s1", ids(site))
  check(
    "allProjectTabs lifts the scope",
    ids(scopedShells(shells, folders, "site", true)) === "a1,s1,w1,a2"
  )
  check(
    "no project picked is no scope",
    ids(scopedShells(shells, folders, null, false)) === "a1,s1,w1,a2"
  )
}

section("shownShellId")
{
  const app = scopedShells(shells, folders, "app", false)
  check(
    "the selected one, when in scope",
    shownShellId(app, "w1", {}, "app") === "w1"
  )
  check(
    "else the one last picked in this project",
    shownShellId(app, "s1", { app: "a2" }, "app") === "a2"
  )
  check(
    "a picked shell since closed falls to the first",
    shownShellId(app, "s1", { app: "gone" }, "app") === "a1"
  )
  check(
    "nothing in scope is nothing shown",
    shownShellId([], "s1", {}, "app") === null
  )
}

finish()
