import type { WorkspaceFolder } from "../src/shared/api"
import {
  byCheckout,
  checkoutsOf,
  isCheckout,
  projectOf,
  projectsIn,
} from "../src/renderer/lib/project-checkouts"
import { check, finish, section } from "./harness"

function folder(id: string, worktreeOf?: string): WorkspaceFolder {
  return {
    id,
    name: id,
    path: `/w/${id}`,
    addedAt: "2026-10-24T00:00:00.000Z",
    ...(worktreeOf ? { worktreeOf } : {}),
  }
}

const app = folder("app")
const other = folder("other")
const fix = folder("fix", "app")
const feat = folder("feat", "app")
const stray = folder("stray", "gone")
const folders = [app, fix, other, feat, stray]

section("the rail")
check(
  "lists projects, not their worktrees",
  projectsIn(folders)
    .map((entry) => entry.id)
    .join() === "app,other,stray"
)
check(
  "a worktree whose project is gone is a project",
  !isCheckout(folders, stray)
)

section("the column")
check("a worktree is filed under its project", projectOf(folders, fix) === app)
check("a project is its own", projectOf(folders, app) === app)
check(
  "the project first, then its worktrees in order",
  checkoutsOf(folders, app)
    .map((entry) => entry.id)
    .join() === "app,fix,feat"
)
check("a project with none is alone", checkoutsOf(folders, other).length === 1)

section("chats by checkout")
const groups = byCheckout(
  [
    { id: "1", folderId: "fix" },
    { id: "2", folderId: "app" },
    { id: "3", folderId: "fix" },
  ],
  checkoutsOf(folders, app)
)
check(
  "one group per checkout, the project first",
  groups.map((group) => group.folder.id).join() === "app,fix,feat"
)
check(
  "each keeps its chats in order",
  groups[1]?.chats.map((chat) => chat.id).join() === "1,3"
)
check(
  "a worktree with no chats still has a group",
  groups[2]?.chats.length === 0
)

finish()
