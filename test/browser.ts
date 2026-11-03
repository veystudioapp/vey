/**
 * The chat's browser, the half that is not Electron: which page a chat's tools
 * reach (`BrowserHub`), what the address bar and `navigate` accept
 * (`browserUrlOf`), and the wire names the modes' lists are built from.
 *
 *   bun test/browser.ts
 */
import {
  BrowserHub,
  consoleText,
  evaluationOf,
  waitUntil,
  type BrowserPage,
  type ConsoleEntry,
} from "../src/main/browser-hub"
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
    reload: async () => {},
    snapshot: async () => `snapshot ${id}`,
    click: async () => {},
    hover: async () => {},
    type: async () => {},
    press: async () => {},
    select: async (_ref, values) => values,
    hasText: async () => false,
    console: () => [],
    scroll: async () => {},
    evaluate: async () => ({ ok: true, value: "undefined" }),
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
    browserActionOf("mcp__vey_browser__drag") === null
  )
  check(
    "the read-only modes cannot click, type, choose or run a script",
    (
      ["click", "type", "press_key", "select_option", "evaluate"] as const
    ).every((action) => !BROWSER_READ_ACTIONS.includes(action))
  )
  check(
    "but can reload, hover, wait and read the console",
    (["reload", "hover", "wait_for", "console"] as const).every((action) =>
      BROWSER_READ_ACTIONS.includes(action)
    )
  )
}

section("evaluationOf")
{
  // The guest script is run here against a stand-in for the DOM globals the
  // serialiser names, which is as close to the page as a test without
  // Electron gets.
  class Node {
    nodeType = 1
    outerHTML = '<img id="logo">'
    textContent = ""
  }
  class NodeList {}
  class HTMLCollection {}
  const runIn = (script: string): Promise<{ ok: boolean; value: string }> =>
    new Function(
      "Node",
      "NodeList",
      "HTMLCollection",
      "page",
      `return ${evaluationOf(script)}`
    )(Node, NodeList, HTMLCollection, { title: "Home", logo: new Node() })

  const cases: [string, string, string][] = [
    ["an expression", "page.title", '"Home"'],
    ["with a trailing semicolon", "page.title;", '"Home"'],
    ["a function, called", "() => page.title.length", "4"],
    ["an async function", "async () => { return 1 + 1 }", "2"],
    [
      "statements with a return",
      "const t = page.title\nreturn t + '!'",
      '"Home!"',
    ],
    ["await at the top", "await Promise.resolve(3)", "3"],
    ["nothing returned", "page.title = 'Changed'; page.other = 1", "undefined"],
    ["an element as its markup", "page.logo", '"<img id=\\"logo\\">"'],
    ["a comment last", "page.title // the title", '"Home"'],
  ]
  for (const [name, script, expected] of cases) {
    const got = await runIn(script)
    check(name, got.ok && got.value === expected, got)
  }

  const cycle = await runIn("(() => { const a = {}; a.self = a; return a })()")
  check(
    "a cycle does not throw",
    cycle.ok && cycle.value.includes("[repeated]")
  )

  const thrown = await runIn("throw new Error('nope')")
  check(
    "what the script threw comes back as text",
    !thrown.ok && thrown.value.includes("nope"),
    thrown
  )

  let refused = ""
  try {
    evaluationOf("const = 1")
  } catch (error) {
    refused = (error as Error).message
  }
  check(
    "a script that does not parse is refused before the page sees it",
    refused.startsWith("The script does not parse"),
    refused
  )
}

section("waitUntil")
{
  let calls = 0
  const met = await waitUntil(async () => ++calls === 3, 1000, 5)
  check("polls until the check holds", met && calls === 3, calls)

  let thrown = 0
  const through = await waitUntil(
    async () => {
      thrown += 1
      if (thrown === 1) throw new Error("navigating")
      return true
    },
    1000,
    5
  )
  check("a check that throws is a no, not the end", through && thrown === 2)

  const started = Date.now()
  const never = await waitUntil(async () => false, 40, 5)
  check(
    "gives up at its time",
    !never && Date.now() - started >= 40 && Date.now() - started < 500
  )
}

section("consoleText")
{
  const entries: ConsoleEntry[] = [
    { level: "info", text: "ready" },
    {
      level: "error",
      text: "Uncaught TypeError: x is undefined",
      source: "http://localhost:5173/src/App.tsx:12",
    },
  ]
  const all = consoleText(entries, false)
  check(
    "every line, with its level and source",
    all ===
      "[info] ready\n[error] Uncaught TypeError: x is undefined (http://localhost:5173/src/App.tsx:12)",
    all
  )
  check(
    "errors only",
    consoleText(entries, true).startsWith("[error]") &&
      !consoleText(entries, true).includes("ready")
  )
  check(
    "nothing said is said so",
    consoleText([], false).startsWith("Nothing in the console")
  )
  const flood = consoleText(
    Array.from({ length: 2000 }, () => ({
      level: "info" as const,
      text: "x".repeat(100),
    })),
    false
  )
  check("a flood is cut", flood.length < 21_000 && flood.includes("(cut at"))
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
