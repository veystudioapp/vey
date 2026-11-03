import type { FeatureArt } from "./art.ts"

/*
 * The home page's picture of the studio — the window in the hero that plays
 * the page's story on a loop — and what the feature cells draw. HTML strings
 * rather than Vue: it is an illustration (`aria-hidden`), English on every
 * page like the app itself, and its CSS reaches into it by structure
 * (`.tabs .on .i:last-child`) that wrappers round each icon would break.
 */

export const SPARKLE =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.94 14.06 4 12l5.94-2.06L12 4l2.06 5.94L20 12l-5.94 2.06L12 20z"/></svg>'

/**
 * The miniature studio's icons, lucide's strokes as the app draws them. Each
 * carries `class="i"` so the window's sizing reaches these.
 */
const ui = (d: string) =>
  `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const UI = {
  chat: ui(
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  ),
  search: ui('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  chart: ui('<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-3"/>'),
  terminal: ui(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 15 3-3-3-3M12 15h5"/>'
  ),
  settings: ui(
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'
  ),
  plus: ui('<path d="M12 5v14M5 12h14"/>'),
  folder: ui(
    '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'
  ),
  close: ui('<path d="M18 6 6 18M6 6l12 12"/>'),
  outline: ui('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  popout: ui(
    '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  ),
  pen: ui(
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
  ),
  plug: ui('<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z"/>'),
  send: ui('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  right: ui('<path d="m9 18 6-6-6-6"/>'),
  down: ui('<path d="m6 9 6 6 6-6"/>'),
  up: ui('<path d="m18 15-6-6-6 6"/>'),
  refresh: ui('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  panel: ui(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>'
  ),
  branch: ui(
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-7 4-11 8"/>'
  ),
  /** Claude's own asterisk, in its orange — the composer's model picker. */
  claude: ui(
    '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'
  ),
  user: ui(
    '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
  ),
}

/** What the demo's two messages say — typed into the composer, then sent. */
const DEMO = {
  ask1: "Add a webhook for bank transfers and mark the order paid when it lands.",
  ask2: "Now add a test for a webhook delivered twice.",
}

/**
 * The hero window plays the page's story on a loop, like a GIF: a turn that
 * writes a webhook, a second that tests it, and each change landing in the
 * Git list beside the chat. Every moment is a share of `LOOP` seconds, and
 * each one gets keyframes of its own — CSS cannot put a variable in a
 * keyframe's percentage, and a delay alone would let the beats drift apart
 * instead of all starting over together.
 *
 * It used to hit the 5-hour limit between the turns and switch to another
 * account, which is the story the page stopped telling (`copy.ts`).
 *
 * The markup is the **last** frame, so with motion reduced the window shows
 * the story finished: both turns, two files changed. The log is pinned to its
 * bottom, so what overflows is the oldest line, as in the app.
 */
const LOOP = 20
const TYPE1: [number, number] = [4, 12]
const TYPE2: [number, number] = [42, 50]
const BEATS: Record<string, number> = {
  bubble1: 13,
  read: 18,
  edit1: 23,
  change1: 24,
  reply1: 29,
  cost1: 34,
  bubble2: 51,
  edit2: 56,
  change2: 57,
  reply2: 62,
  cost2: 67,
}
/** Where the finished story holds, then fades before it starts again. */
const HOLD = 93
const GONE = 97

export function demoCss(): string {
  // A line arriving: it grows into the log, pushing the older ones up.
  const grow = (name: string, at: number) =>
    `@keyframes ${name} { 0%, ${at}% { max-height: 0; margin-top: 0; opacity: 0; } ${at + 2.5}%, ${HOLD}% { max-height: 9rem; margin-top: var(--gap); opacity: 1; } ${GONE}%, 100% { max-height: 9rem; margin-top: var(--gap); opacity: 0; } }`
  const typing = (name: string, [from, to]: [number, number]) =>
    `@keyframes ${name} { 0%, ${from}% { opacity: 0; max-width: 0; } ${from + 0.2}% { opacity: 1; max-width: 0; animation-timing-function: steps(32, end); } ${to}% { opacity: 1; max-width: 100%; } ${to + 0.3}%, 100% { opacity: 0; max-width: 100%; } }`
  const off = (a: [number, number], b: [number, number]) =>
    `0%, ${a[0]}% { opacity: 1; } ${a[0] + 0.2}%, ${a[1] + 1}% { opacity: 0; } ${a[1] + 1.2}%, ${b[0]}% { opacity: 1; } ${b[0] + 0.2}%, ${b[1] + 1}% { opacity: 0; } ${b[1] + 1.2}%, 100% { opacity: 1; }`
  // Shown from one moment to the next, and hidden either side of it.
  const during = (name: string, from: number, to: number) =>
    `@keyframes ${name} { 0%, ${from}% { opacity: 0; } ${from + 0.3}%, ${to}% { opacity: 1; } ${to + 0.3}%, 100% { opacity: 0; } }`
  return [
    // Every part of the story shares one clock; each names its own keyframes.
    `.beat, .typed, .hint, .count i { animation: ${LOOP}s linear infinite both; }`,
    ...Object.entries(BEATS).map(([name, at]) => grow(name, at)),
    typing("typed1", TYPE1),
    typing("typed2", TYPE2),
    `@keyframes hint { ${off(TYPE1, TYPE2)} }`,
    during("count1", BEATS.change1, BEATS.change2),
    during("count2", BEATS.change2, GONE),
  ].join("\n")
}

/** Git's count of changed files, `1` then `2` as the demo writes them. */
const COUNT = `<small class="count"><i style="animation-name:count1">1</i><i style="animation-name:count2">2</i></small>`

/**
 * Which illustration sits over each feature, in the order `Copy` lists them:
 * the studio's parts, one each, past the chats, the browser and the diff that
 * the large rows above already show.
 */
export const FEATURE_ORDER: FeatureArt[] = [
  "rewind",
  "modes",
  "worktrees",
  "terminal",
  "search",
  "mcp",
]

/** The large rows' pictures, in the order `Copy.spotlights` lists them. */
export const SPOTLIGHT_ORDER: FeatureArt[] = ["chats", "browser", "diff"]

/** `01`, `02` — the cells' numbers. */
export const nth = (i: number) => String(i + 1).padStart(2, "0")

/** The window's inside — the finished story, which `demoCss` animates. */
export const WINDOW = `<div class="titlebar"><div class="palette">${UI.search}<span>Run a command</span><kbd>⌘P</kbd></div></div>
<div class="canvas">
  <div class="card rail">
    <i class="on">${UI.chat}</i><i>${UI.search}</i><i>${UI.chart}</i>
    <span class="grow"></span><i>${UI.terminal}</i><i>${UI.settings}</i>
  </div>
  <div class="card side">
    <p class="label">Projects<span class="end">${UI.plus}</span></p>
    <div class="folder">${UI.folder}checkout-api</div>
    <div class="row on">Add VietQR webhook<span class="spin"></span></div>
    <div class="row unread">Fix rounding in totals<span class="dot"></span></div>
    <div class="row">Refactor order states<time>1d</time></div>
    <div class="folder">${UI.folder}web-app</div>
    <div class="row">Dark mode for settings<time>3d</time></div>
    <div class="row">Empty states on search<time>1w</time></div>
  </div>
  <div class="middle">
    <div class="card pane">
      <div class="tabs">
        <span><b class="ts">TS</b>orders.ts</span>
        <span class="on">${UI.chat}Add VietQR webhook${UI.close}</span>
      </div>
      <div class="pane-head">Add VietQR webhook<span>${UI.outline}${UI.search}${UI.popout}</span></div>
      <div class="chat">
        <div class="log">
          <div class="bubble beat" style="animation-name:bubble1">${DEMO.ask1}</div>
          <div class="tool beat" style="animation-name:read">${UI.right}Read<span>server/routes/orders.ts</span></div>
          <div class="tool beat" style="animation-name:edit1">${UI.right}Edit<span>server/api/webhooks/sepay.post.ts · +48 −2</span></div>
          <div class="reply beat" style="animation-name:reply1">Added <code>POST /api/webhooks/sepay</code>. It checks the signature, matches the order code in the transfer note and marks the order paid once.</div>
          <div class="cost beat" style="animation-name:cost1">Sonnet 5.5 · Work · 18.2k prompt, 94% cached · 1.1k out · 14s</div>
          <div class="bubble beat" style="animation-name:bubble2">${DEMO.ask2}</div>
          <div class="tool beat" style="animation-name:edit2">${UI.right}Write<span>test/sepay.test.ts · +31</span></div>
          <div class="reply beat" style="animation-name:reply2">Added <code>test/sepay.test.ts</code>: the second delivery is ignored and the order is paid once. 6 passed.</div>
          <div class="cost beat" style="animation-name:cost2">Sonnet 5.5 · Work · 21.4k prompt, 96% cached · 0.9k out · 9s</div>
        </div>
        <div class="composer">
          <p><span class="hint">Ask to make changes in this project…<span class="caret"></span></span><span class="typed" style="animation-name:typed1">${DEMO.ask1}</span><span class="typed" style="animation-name:typed2">${DEMO.ask2}</span></p>
          <div class="toolbar">
            <span class="model"><span class="claude">${UI.claude}</span>Sonnet 5.5 · Medium</span>
            <span class="mode">${UI.pen}Edits</span>
            <span class="mcp">${UI.plug}MCP</span>
            <span class="account">${UI.user}Work<span class="meter"><span></span>5h 72%</span></span>
            <span class="end">${UI.plus}<b class="send">${UI.send}</b></span>
          </div>
        </div>
      </div>
    </div>
    <div class="card dock">${UI.up}<span>${UI.terminal}Terminal</span>${UI.plus}${UI.down}</div>
  </div>
  <div class="card explorer">
    <div class="seg"><span>All files</span><span class="on">Git${COUNT}</span><em>${UI.refresh}${UI.panel}</em></div>
    <div class="seg"><span class="on">Changes${COUNT}</span><span>Commits</span></div>
    <div class="message">Message (⌘↩ to commit)</div>
    <div class="commit"><span><span class="claude">${UI.claude}</span>Draft</span><b>Commit</b></div>
    <p class="label">${UI.down}Changes<span class="end">${COUNT}</span></p>
    <div class="files">
      <div class="beat" style="animation-name:change1"><div class="dir">${UI.down}server/api/webhooks</div><div class="change"><b class="ts">TS</b>sepay.post.ts<b>M</b></div></div>
      <div class="beat" style="animation-name:change2"><div class="dir">${UI.down}test</div><div class="change new"><b class="ts">TS</b>sepay.test.ts<b>U</b></div></div>
    </div>
  </div>
</div>
<div class="status"><span>${UI.branch}main</span><span>This app 0.4% CPU · 96 MB</span></div>`
