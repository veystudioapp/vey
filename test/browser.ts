/**
 * The chat's browser, the half that is not Electron: which page a chat's tools
 * reach (`BrowserHub`), what the address bar and `navigate` accept
 * (`browserUrlOf`), and the wire names the modes' lists are built from.
 *
 *   bun test/browser.ts
 */
import { BrowserHub, type BrowserPage } from "../src/main/browser-hub"
import {
  BROWSER_READ_ACTIONS,
  browserActionOf,
  browserTool,
  browserUrlOf,
  type BrowserActivity,
  type BrowserCommand,
} from "../src/shared/browser"
import { check, finish, section } from "./harness"

function fakePage(id: number, alive = true): BrowserPage {
  return {
    id,
    alive: () => alive,
    where: () => `page ${id}`,
    navigate: async () => {},
    back: async () => false,
    snapshot: async () => `snapshot ${id}`,
    click: async () => {},
    type: async () => {},
    press: async () => {},
    scroll: async () => {},
    screenshot: async () => ({ data: "", mimeType: "image/jpeg" }),
    capture: async () => ({ data: "", width: 0, height: 0 }),
    inspect: async () => null,
  }
}

section("browserUrlOf")
{
  const cases: [string, string | null][] = [
    ["https://example.com/a?b=1", "https://example.com/a?b=1"],
    ["http://localhost:3000", "http://localhost:3000/"],
    ["localhost:5173/app", "http://localhost:5173/app"],
    ["127.0.0.1:8080", "http://127.0.0.1:8080"],
    ["example.com", "https://example.com"],
    ["docs.example.co.jp/path", "https://docs.example.co.jp/path"],
    [
      "how to center a div",
      "https://www.google.com/search?q=how%20to%20center%20a%20div",
    ],
    ["about:blank", "about:blank"],
    ["file:///etc/passwd", null],
    ["javascript:alert(1)", null],
    ["vscode://open", null],
    ["   ", null],
  ]
  for (const [input, expected] of cases) {
    const got = browserUrlOf(input)
    check(`${JSON.stringify(input)} → ${expected}`, got === expected, got)
  }
}

section("wire names")
{
  check(
    "a tool's wire name",
    browserTool("click") === "mcp__vey_browser__click"
  )
  check(
    "read back to its action",
    browserActionOf("mcp__vey_browser__press_key") === "press_key"
  )
  check(
    "another server's tool is not the browser's",
    browserActionOf("mcp__playwright__browser_click") === null
  )
  check(
    "an unknown action on the browser's server is not one",
    browserActionOf("mcp__vey_browser__evaluate") === null
  )
  check(
    "the read-only modes cannot click or type",
    !BROWSER_READ_ACTIONS.includes("click") &&
      !BROWSER_READ_ACTIONS.includes("type") &&
      !BROWSER_READ_ACTIONS.includes("press_key")
  )
}

section("BrowserHub")
{
  const commands: BrowserCommand[] = []
  const activity: BrowserActivity[] = []
  let ids = 0
  const hub = new BrowserHub(
    (command) => commands.push(command),
    (event) => activity.push(event),
    50,
    () => `new-${++ids}`
  )
  const asked = (chatId: string, kind: BrowserCommand["kind"]) =>
    commands.some(
      (command) => command.chatId === chatId && command.kind === kind
    )

  hub.attach("a", "t1", fakePage(1))
  check("an attached tab is the shown one", (await hub.pageFor("a")).id === 1)
  check("without asking for a panel", commands.length === 0)

  // A tool for a chat with no tab asks for the panel and takes the first.
  const waiting = hub.pageFor("b")
  check("a chat with no tab asks for its panel", asked("b", "open"))
  hub.attach("b", "t1", fakePage(2))
  check("and gets the tab that attaches", (await waiting).id === 2)

  // A second tab the user opens and picks is the one the tools act on.
  hub.attach("a", "t2", fakePage(3))
  check(
    "a tab attaching does not take over the shown one",
    (await hub.pageFor("a")).id === 1
  )
  hub.focus("a", "t2")
  check(
    "picking a tab moves the tools to it",
    (await hub.pageFor("a")).id === 3
  )
  check(
    "the listing marks it",
    hub
      .tabs("a")
      .map((tab) => tab.active)
      .join() === "false,true"
  )

  // A tab `claude` opens is asked of the strip and waited for.
  const opening = hub.newTab("a", "https://example.com")
  const made = commands.at(-1)
  check(
    "a new tab is asked for with its id and address",
    made?.kind === "new" &&
      made.tabId === "new-1" &&
      made.url === "https://example.com",
    made
  )
  hub.attach("a", "new-1", fakePage(4))
  check("and is the page once it attaches", (await opening).id === 4)
  check("and the shown one", (await hub.pageFor("a")).id === 4)

  // Closing the shown tab falls back to the last one left.
  hub.close("a", "new-1")
  check("closing is asked of the strip", asked("a", "close"))
  check("the tools move to a tab still open", (await hub.pageFor("a")).id === 3)
  check("and it is gone from the listing", hub.tabs("a").length === 2)

  // A dead tab is dropped, and another live one is shown in its place.
  hub.attach("c", "t1", fakePage(5, false))
  hub.attach("c", "t2", fakePage(6))
  hub.focus("c", "t1")
  check("a dead tab is not handed out", (await hub.pageFor("c")).id === 6)
  check("the strip is told which tab now", asked("c", "select"))

  // Detach only forgets the page that is attached.
  hub.attach("d", "t1", fakePage(7))
  hub.detach("d", "t1", 99)
  check("a stale detach leaves the new page", (await hub.pageFor("d")).id === 7)
  hub.detach("d", "t1", 7)
  const timedOut = await hub.pageFor("d").then(
    () => false,
    (error: unknown) => error instanceof Error
  )
  check("with nothing attaching, the wait gives up", timedOut)

  // A popup is a new tab of the same chat.
  let popup: ((url: string) => void) | null = null
  hub.attach("e", "t1", {
    ...fakePage(8),
    onPopup: (open) => {
      popup = open
    },
  })
  ;(popup as ((url: string) => void) | null)?.("https://popup.example")
  const fromPopup = commands.at(-1)
  check(
    "a popup asks for a tab in its own chat",
    fromPopup?.kind === "new" &&
      fromPopup.chatId === "e" &&
      fromPopup.url === "https://popup.example",
    fromPopup
  )

  // Activity brackets the work, and is cleared even when it throws.
  activity.length = 0
  const thrown = await hub
    .run("a", "click", async () => {
      throw new Error("gone")
    })
    .then(
      () => false,
      () => true
    )
  check("a failing action still throws", thrown)
  check(
    "and says it started and ended",
    activity.length === 2 &&
      activity[0]?.action === "click" &&
      activity[1]?.action === null,
    activity
  )
}

finish()
