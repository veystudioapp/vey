/**
 * The home page's illustrations, one per feature — inline SVG, so they are
 * part of the page and take its own CSS.
 *
 * Every one is drawn in its **finished** state, and the motion is keyframes
 * that start from somewhere else and arrive there (`home.css`'s `.a-*`
 * classes). So with motion reduced, or before the card has scrolled into view,
 * what shows is the picture complete rather than half of it: an animation
 * removed takes nothing with it.
 *
 * Colours are the page's: the violet and amber of the mark, and the diff's
 * green and red.
 */

const VIOLET = "#8B5CF6"
const LILAC = "#A78BFA"
const AMBER = "#FBBF24"
const GREEN = "#4ADE80"
const RED = "#F87171"
const LINE = "rgb(255 255 255 / 0.10)"
const PANEL = "rgb(255 255 255 / 0.035)"
const INK = "rgb(255 255 255 / 0.55)"
const FAINT = "rgb(255 255 255 / 0.22)"
const SANS = `font-family="-apple-system, Segoe UI, sans-serif"`
const MONO = `font-family="ui-monospace, Menlo, monospace"`

/** A four-point spark — the mark's own, at any size. */
function spark(cx: number, cy: number, r: number, fill: string, cls = "") {
  const p = r * 0.16
  return `<path class="${cls}" fill="${fill}" d="M${cx} ${cy - r}Q${cx + p} ${cy - p} ${cx + r} ${cy}Q${cx + p} ${cy + p} ${cx} ${cy + r}Q${cx - p} ${cy + p} ${cx - r} ${cy}Q${cx - p} ${cy - p} ${cx} ${cy - r}Z"/>`
}

function svg(body: string, defs = "") {
  return `<svg viewBox="0 0 320 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`
}

const GRADIENT = (id: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${VIOLET}"/><stop offset="1" stop-color="${AMBER}"/></linearGradient>`

/** The chats column: one that needs you, two working, one finished unread —
 * the sections the app sorts a project's chats into. */
function chats(): string {
  const label = (y: number, text: string, d: number) =>
    `<text class="a-slide" style="--d:${d}s" x="26" y="${y}" font-size="8" letter-spacing="1.2" ${MONO} fill="${FAINT}">${text}</text>`
  const row = (y: number, title: string, mark: string, d: number, on = false) =>
    `<g class="a-slide" style="--d:${d}s">
      ${on ? `<rect x="20" y="${y - 11}" width="280" height="18" rx="5" fill="rgb(139 92 246 / 0.14)"/>` : ""}
      <text x="28" y="${y + 2}" font-size="10.5" ${SANS} fill="#e4e4e7">${title}</text>
      ${mark}
    </g>`
  const spinner = (y: number) =>
    `<circle cx="290" cy="${y - 2}" r="4" stroke="${FAINT}" stroke-width="1.6"/><path class="a-spin" style="transform-origin:290px ${y - 2}px" d="M290 ${y - 6}a4 4 0 0 1 4 4" stroke="${AMBER}" stroke-width="1.6" stroke-linecap="round"/>`
  const shield = (y: number) =>
    `<path class="a-pop" style="--d:.5s" d="M290 ${y - 8}l5 2v4c0 3.4-2.2 5.4-5 6.6-2.8-1.2-5-3.2-5-6.6v-4z" fill="rgb(251 191 36 / 0.2)" stroke="${AMBER}" stroke-width="1.3"/>`
  return svg(`
    <rect x="12" y="8" width="296" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    ${label(24, "NEEDS YOU", 0)}
    ${row(40, "Run the migration?", shield(40), 0.15, true)}
    ${label(62, "RUNNING", 0.3)}
    ${row(78, "Add VietQR webhook", spinner(78), 0.45)}
    ${row(96, "Fix rounding in totals", spinner(96), 0.6)}
    ${label(116, "RECENT", 0.75)}
    <g class="a-slide" style="--d:.9s">
      <text x="28" y="128" font-size="10.5" font-weight="600" ${SANS} fill="#e4e4e7">Dark mode for settings</text>
      <circle class="a-pop" style="--d:1.4s" cx="290" cy="125" r="3.2" fill="${VIOLET}"/>
    </g>`)
}

/** A diff landing line by line, a message drafted for it, and the commit. */
function diff(): string {
  const rows: [string, number, string][] = [
    [FAINT, 100, ""],
    [RED, 80, "rgb(248 113 113 / 0.12)"],
    [GREEN, 110, "rgb(74 222 128 / 0.12)"],
    [GREEN, 92, "rgb(74 222 128 / 0.12)"],
    [GREEN, 116, "rgb(74 222 128 / 0.12)"],
    [FAINT, 66, ""],
  ]
  const body = rows
    .map(([color, width, wash], i) => {
      const y = 24 + i * 17
      const sign = color === GREEN ? "+" : color === RED ? "−" : ""
      return `<g class="a-slide" style="--d:${(i * 0.15).toFixed(2)}s">
        ${wash ? `<rect x="18" y="${y - 6}" width="146" height="14" rx="3" fill="${wash}"/>` : ""}
        <text x="24" y="${y + 4}" font-size="10" ${MONO} fill="${color}">${sign}</text>
        <rect x="36" y="${y - 2}" width="${width}" height="5" rx="2.5" fill="${color}" fill-opacity="${color === FAINT ? 1 : 0.75}"/>
      </g>`
    })
    .join("")
  const file = (y: number, name: string, mark: string, color: string) =>
    `<text x="186" y="${y}" font-size="9.5" ${MONO} fill="#e4e4e7">${name}</text><text x="298" y="${y}" text-anchor="end" font-size="9.5" font-weight="600" ${MONO} fill="${color}">${mark}</text>`
  const commit = `
    <rect x="176" y="8" width="132" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    <text x="186" y="25" font-size="8" letter-spacing="1.2" ${MONO} fill="${FAINT}">CHANGES · 2</text>
    ${file(42, "sepay.post.ts", "M", AMBER)}
    ${file(57, "sepay.test.ts", "U", GREEN)}
    <rect x="184" y="68" width="116" height="30" rx="5" fill="rgb(0 0 0 / 0.25)" stroke="${LINE}"/>
    <rect class="a-type" style="--d:.9s" x="190" y="76" width="96" height="4.5" rx="2.25" fill="${INK}"/>
    <rect class="a-type" style="--d:1.1s" x="190" y="86" width="70" height="4.5" rx="2.25" fill="${INK}"/>
    <g class="a-pop" style="--d:.7s">
      <rect x="184" y="106" width="48" height="18" rx="5" fill="${PANEL}" stroke="${LINE}"/>
      ${spark(194, 115, 4.5, AMBER)}
      <text x="203" y="118.5" font-size="9" ${SANS} fill="${INK}">Draft</text>
    </g>
    <g class="a-pop" style="--d:1.5s">
      <rect x="238" y="106" width="62" height="18" rx="5" fill="url(#diff-g)"/>
      <text x="269" y="118.5" text-anchor="middle" font-size="9.5" font-weight="600" ${SANS} fill="#fff">Commit</text>
    </g>`
  return svg(
    `<rect x="12" y="8" width="158" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>${body}${commit}`,
    GRADIENT("diff-g")
  )
}

/** Five modes, one knob — moved mid-conversation. */
function modes(): string {
  const labels = ["Plan", "Read", "Ask", "Edits", "Full"]
  const seg = labels
    .map(
      (label, i) =>
        `<text x="${44 + i * 58}" y="100" text-anchor="middle" font-size="11" font-family="-apple-system, Segoe UI, sans-serif" fill="${INK}">${label}</text>`
    )
    .join("")
  return svg(
    `<g class="a-float">
      <path d="M160 14l26 10v18c0 17-11 27-26 33-15-6-26-16-26-33V24z" fill="url(#mode-g)" fill-opacity="0.18" stroke="url(#mode-g)" stroke-width="2"/>
      <path d="M150 44l7 7 13-14" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <rect x="12" y="84" width="296" height="28" rx="14" fill="${PANEL}" stroke="${LINE}"/>
    <rect class="a-knob" x="17" y="88" width="54" height="20" rx="10" fill="url(#mode-g)" fill-opacity="0.45"/>
    ${seg}`,
    GRADIENT("mode-g")
  )
}

/** A shell under the chat, running what the chat just wrote. */
function terminal(): string {
  const mono = `font-size="10.5" font-family="ui-monospace, Menlo, monospace"`
  return svg(`
    <rect x="12" y="8" width="296" height="124" rx="10" fill="rgb(0 0 0 / 0.35)" stroke="${LINE}"/>
    <circle cx="26" cy="21" r="3.5" fill="${RED}"/><circle cx="38" cy="21" r="3.5" fill="${AMBER}"/><circle cx="50" cy="21" r="3.5" fill="${GREEN}"/>
    <path d="M12 32H308" stroke="${LINE}"/>
    <clipPath id="term-clip"><rect class="a-typein" x="24" y="40" width="200" height="16"/></clipPath>
    <text x="24" y="52" ${mono} fill="${LILAC}">$</text>
    <text x="36" y="52" ${mono} fill="#e4e4e7" clip-path="url(#term-clip)">bun run test</text>
    <text class="a-slide" style="--d:1.1s" x="24" y="72" ${mono} fill="${GREEN}">✓ webhook          6 passed</text>
    <text class="a-slide" style="--d:1.35s" x="24" y="88" ${mono} fill="${GREEN}">✓ landing         5 passed</text>
    <text class="a-slide" style="--d:1.6s" x="24" y="104" ${mono} fill="${INK}">128 checks passed in 1.4s</text>
    <text x="24" y="122" ${mono} fill="${LILAC}">$</text>
    <rect class="a-blink" x="36" y="113" width="7" height="12" fill="#e4e4e7"/>`)
}

/** The chat's browser: the tool calls the turn made down the left, and the
 * page they made on the right — a button found by the snapshot, clicked. */
function browser(): string {
  const call = (y: number, verb: string, object: string, d: number) =>
    `<g class="a-slide" style="--d:${d}s">
      ${spark(26, y - 3, 3.5, LILAC)}
      <text x="34" y="${y}" font-size="9" ${SANS} fill="#e4e4e7">${verb}</text>
      <text x="34" y="${y + 11}" font-size="8" ${MONO} fill="${FAINT}">${object}</text>
    </g>`
  return svg(
    `
    <rect x="12" y="8" width="112" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    ${call(28, "Navigate", "localhost:5173", 0)}
    ${call(58, "Snapshot", "38 elements", 0.3)}
    ${call(88, "Click", "“Pay now”", 0.6)}
    ${call(118, "Screenshot", "checkout.png", 1.4)}
    <rect x="132" y="8" width="176" height="124" rx="10" fill="rgb(0 0 0 / 0.3)" stroke="${LINE}"/>
    <rect x="140" y="15" width="56" height="13" rx="4" fill="${PANEL}" stroke="${LINE}"/>
    <text x="146" y="24.5" font-size="8" ${SANS} fill="${INK}">Checkout</text>
    <path d="M132 32H308" stroke="${LINE}"/>
    <rect x="140" y="38" width="160" height="14" rx="4" fill="rgb(255 255 255 / 0.04)"/>
    <text x="147" y="48" font-size="8.5" ${MONO} fill="${INK}">localhost:5173/checkout</text>
    <rect class="a-type" style="--d:.2s" x="144" y="62" width="86" height="6" rx="3" fill="${INK}"/>
    <rect class="a-type" style="--d:.3s" x="144" y="74" width="140" height="4" rx="2" fill="${FAINT}"/>
    <rect class="a-type" style="--d:.4s" x="144" y="83" width="112" height="4" rx="2" fill="${FAINT}"/>
    <rect class="a-pop" style="--d:.7s" x="141" y="97" width="70" height="22" rx="7" fill="none" stroke="${AMBER}" stroke-width="1.2" stroke-dasharray="3 2"/>
    <rect x="144" y="100" width="64" height="16" rx="5" fill="url(#browser-g)"/>
    <text x="176" y="111" text-anchor="middle" font-size="8.5" font-weight="600" ${SANS} fill="#fff">Pay now</text>
    <g class="a-float" style="--d:.9s">
      <path d="M196 106l0 14 3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5 4.9-.3z" fill="#fff" stroke="rgb(0 0 0 / 0.5)" stroke-width="0.8" stroke-linejoin="round"/>
    </g>
    <g class="a-pop" style="--d:1.2s">
      <rect x="232" y="100" width="66" height="16" rx="8" fill="rgb(74 222 128 / 0.14)"/>
      <text x="265" y="111" text-anchor="middle" font-size="8.5" ${MONO} fill="${GREEN}">✓ Paid</text>
    </g>`,
    GRADIENT("browser-g")
  )
}

/** Worktrees inside one project: a branch per task off main, each with its
 * own chat working on it — two agents, never one checkout. */
function worktrees(): string {
  const branch = (
    y: number,
    from: number,
    name: string,
    chat: string,
    mark: string,
    d: number
  ) =>
    `<path class="a-draw" style="--d:${d}s" pathLength="1" d="M${from} 112C${from} ${y} ${from} ${y} ${from + 26} ${y}H92" stroke="${LILAC}" stroke-width="1.6" stroke-linecap="round"/>
    <g class="a-slide" style="--d:${d + 0.35}s">
      <circle cx="96" cy="${y}" r="3.5" fill="${LILAC}"/>
      <text x="108" y="${y - 3}" font-size="8.5" ${MONO} fill="${LILAC}">${name}</text>
      <text x="108" y="${y + 10}" font-size="10" ${SANS} fill="#e4e4e7">${chat}</text>
      ${mark}
    </g>`
  const spinner = (y: number) =>
    `<circle cx="290" cy="${y + 4}" r="4" stroke="${FAINT}" stroke-width="1.6"/><path class="a-spin" style="transform-origin:290px ${y + 4}px" d="M290 ${y}a4 4 0 0 1 4 4" stroke="${AMBER}" stroke-width="1.6" stroke-linecap="round"/>`
  return svg(`
    <rect x="12" y="8" width="296" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    ${branch(30, 40, "feat/vietqr-webhook", "Add VietQR webhook", spinner(30), 0.1)}
    ${branch(70, 64, "fix/rounding", "Fix rounding in totals", spinner(70), 0.5)}
    <path d="M24 112H296" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="40" cy="112" r="3.5" fill="${INK}"/>
    <circle cx="64" cy="112" r="3.5" fill="${INK}"/>
    <text x="296" y="126" text-anchor="end" font-size="8.5" ${MONO} fill="${FAINT}">main</text>`)
}

/** The composer's MCP dialog: the servers this chat's claude found for
 * itself, each with its tool count, and one switched off for this chat. */
function mcp(): string {
  const row = (
    y: number,
    name: string,
    tools: string,
    on: boolean,
    d: number
  ) =>
    `<g class="a-slide" style="--d:${d}s">
      <circle cx="30" cy="${y - 3}" r="3" fill="${on ? GREEN : FAINT}"/>
      <text x="42" y="${y}" font-size="10.5" ${SANS} fill="${on ? "#e4e4e7" : INK}">${name}</text>
      <text x="230" y="${y}" text-anchor="end" font-size="8.5" ${MONO} fill="${FAINT}">${tools}</text>
      <rect x="250" y="${y - 10}" width="26" height="14" rx="7" fill="${on ? "url(#mcp-g)" : "rgb(255 255 255 / 0.08)"}" stroke="${LINE}"/>
      <circle cx="${on ? 269 : 257}" cy="${y - 3}" r="5" fill="#fff" fill-opacity="${on ? 1 : 0.5}"/>
    </g>`
  return svg(
    `<rect x="12" y="8" width="296" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    <text x="24" y="25" font-size="8" letter-spacing="1.2" ${MONO} fill="${FAINT}">MCP · THIS CHAT</text>
    ${row(50, "vey_browser", "9 tools", true, 0.1)}
    ${row(74, "github", "26 tools", true, 0.3)}
    ${row(98, "figma", "12 tools", true, 0.5)}
    ${row(122, "clickup", "off here", false, 0.7)}`,
    GRADIENT("mcp-g")
  )
}

/** The repository cloned and run: the source is the app, three commands
 * from a fork to a window of your own. */
function source(): string {
  const mono = `font-size="10" ${MONO}`
  const cmd = (y: number, text: string, d: number) =>
    `<g class="a-slide" style="--d:${d}s">
      <text x="24" y="${y}" ${mono} fill="${LILAC}">$</text>
      <text x="36" y="${y}" ${mono} fill="#e4e4e7">${text}</text>
    </g>`
  return svg(`
    <rect x="12" y="8" width="296" height="124" rx="10" fill="rgb(0 0 0 / 0.35)" stroke="${LINE}"/>
    <circle cx="26" cy="21" r="3.5" fill="${RED}"/><circle cx="38" cy="21" r="3.5" fill="${AMBER}"/><circle cx="50" cy="21" r="3.5" fill="${GREEN}"/>
    <text x="296" y="24" text-anchor="end" font-size="8.5" ${MONO} fill="${FAINT}">MIT</text>
    <path d="M12 32H308" stroke="${LINE}"/>
    ${cmd(50, "git clone github.com/veystudioapp/vey", 0)}
    ${cmd(68, "cd vey &amp;&amp; bun install", 0.35)}
    ${cmd(86, "bun run dev", 0.7)}
    <text class="a-slide" style="--d:1.1s" x="24" y="106" ${mono} fill="${GREEN}">✓ Vey is running — your build</text>
    <text x="24" y="124" ${mono} fill="${LILAC}">$</text>
    <rect class="a-blink" x="36" y="115" width="7" height="12" fill="#e4e4e7"/>`)
}

/** One query over every file and every chat, the matches lit where they are. */
function search(): string {
  const label = (y: number, text: string) =>
    `<text x="24" y="${y}" font-size="8" letter-spacing="1.2" ${MONO} fill="${FAINT}">${text}</text>`
  // A result: its name, a line of its text with the match lit, and a count.
  const row = (
    y: number,
    name: string,
    mark: number,
    count: string,
    d: number
  ) =>
    `<g class="a-slide" style="--d:${d}s">
      <text x="24" y="${y + 4}" font-size="10" ${SANS} fill="#e4e4e7">${name}</text>
      <rect x="132" y="${y - 2}" width="130" height="5" rx="2.5" fill="${INK}" fill-opacity="0.6"/>
      <rect class="a-pop" style="--d:${d + 0.25}s" x="${mark}" y="${y - 5}" width="34" height="11" rx="3" fill="rgb(167 139 250 / 0.35)" stroke="${LILAC}" stroke-opacity="0.6"/>
      <text x="294" y="${y + 4}" text-anchor="end" font-size="9" ${MONO} fill="${FAINT}">${count}</text>
    </g>`
  return svg(`
    <rect x="12" y="8" width="296" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    <rect x="20" y="15" width="280" height="22" rx="6" fill="rgb(0 0 0 / 0.25)" stroke="${LINE}"/>
    <circle cx="32" cy="25.5" r="4" stroke="${INK}" stroke-width="1.6"/><path d="M35 28.5l3 3" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <clipPath id="search-clip"><rect class="a-typein" x="44" y="18" width="56" height="16"/></clipPath>
    <text x="44" y="30" font-size="10.5" ${MONO} fill="#e4e4e7" clip-path="url(#search-clip)">webhook</text>
    <text x="292" y="29.5" text-anchor="end" font-size="9" ${MONO} fill="${FAINT}">Aa  ab  .*</text>
    ${label(52, "FILES")}
    ${row(64, "sepay.post.ts", 150, "3", 1.1)}
    ${row(82, "orders.ts", 196, "1", 1.3)}
    ${label(104, "CHATS")}
    ${row(116, "Add VietQR webhook", 168, "2", 1.5)}`)
}

/** A message edited, and the files its turns wrote going back with it. */
function rewind(): string {
  const file = (y: number, name: string, d: number) =>
    `<g class="a-slide" style="--d:${d}s">
      <text x="186" y="${y + 4}" font-size="10" ${MONO} fill="#e4e4e7">${name}</text>
      <g class="a-pop" style="--d:${d + 0.3}s"><rect x="252" y="${y - 7}" width="48" height="15" rx="7.5" fill="rgb(74 222 128 / 0.14)"/><text x="276" y="${y + 3.5}" text-anchor="middle" font-size="9" ${MONO} fill="${GREEN}">↺ back</text></g>
    </g>`
  return svg(`
    <rect x="12" y="8" width="150" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    <rect x="70" y="18" width="80" height="14" rx="7" fill="rgb(139 92 246 / 0.35)"/>
    <rect x="22" y="40" width="110" height="5" rx="2.5" fill="${INK}"/>
    <rect x="22" y="51" width="84" height="5" rx="2.5" fill="${INK}"/>
    <rect class="a-pop" style="--d:.2s" x="54" y="66" width="96" height="16" rx="8" fill="rgb(139 92 246 / 0.35)" stroke="${LILAC}" stroke-width="1.4"/>
    <g class="a-pop" style="--d:.45s"><rect x="20" y="66" width="28" height="16" rx="8" fill="rgb(0 0 0 / 0.3)" stroke="${LINE}"/><path d="M29 77.5l1-3.4 5.6-5.6 2.4 2.4-5.6 5.6z" stroke="${LILAC}" stroke-width="1.3" stroke-linejoin="round"/></g>
    <g opacity="0.35">
      <rect x="22" y="92" width="104" height="5" rx="2.5" fill="${FAINT}"/>
      <rect x="22" y="103" width="76" height="5" rx="2.5" fill="${FAINT}"/>
      <rect x="22" y="114" width="92" height="5" rx="2.5" fill="${FAINT}"/>
    </g>
    <path class="a-draw" style="--d:.6s" pathLength="1" d="M176 112C164 112 164 74 152 74" stroke="${AMBER}" stroke-width="2" stroke-linecap="round"/>
    <path class="a-pop" style="--d:1.1s" d="M157 70l-5 4 5 4" stroke="${AMBER}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="176" y="8" width="132" height="124" rx="10" fill="${PANEL}" stroke="${LINE}"/>
    <text x="186" y="27" font-size="9" ${SANS} fill="${FAINT}" letter-spacing="0.08em">FILES</text>
    ${file(50, "orders.ts", 0.9)}
    ${file(76, "sepay.ts", 1.1)}
    ${file(102, "totals.ts", 1.3)}`)
}

export const FEATURE_ART = {
  chats,
  browser,
  diff,
  rewind,
  modes,
  worktrees,
  terminal,
  mcp,
  search,
  source,
} as const

export type FeatureArt = keyof typeof FEATURE_ART
