/**
 * Mermaid fences in a rendered reply, drawn as the diagram they describe.
 *
 * An agent explaining an architecture or a flow reaches for ```mermaid, and
 * the source of a sequence diagram is not how anybody wants to read one. The
 * fence's `<pre>` is kept and hidden rather than replaced: the Copy on its
 * frame still copies the source, `⌘F` still finds the words in it, and a
 * fence that will not parse simply stays the code it was.
 *
 * Mermaid is a large library — d3, dagre, cytoscape — so it is a dynamic
 * import, loaded by the first reply that has a diagram and by nothing else.
 *
 * A reply re-renders its whole DOM on every chunk while it streams, so an SVG
 * is cached by its source and theme: a diagram drawn once is put back from the
 * cache rather than laid out again under every token that follows it. A fence
 * still being written fails to parse and is left as code until it is whole.
 */

type Mermaid = (typeof import("mermaid"))["default"]

let loading: Promise<Mermaid> | null = null
const DRAWN_LIMIT = 64
const drawn = new Map<string, string>()
// Mermaid's config is global, and the theme is set by `initialize` before a
// render, so two renders interleaving could draw one in the other's theme.
let queue: Promise<unknown> = Promise.resolve()
let theme: "default" | "dark" | null = null
let sequence = 0

function mermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then((module) => module.default)
  return loading
}

/** Every `<pre data-language="mermaid">` under `root`, drawn beside itself. */
export async function renderMermaidBlocks(
  root: ParentNode,
  alive: () => boolean = () => true
): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLPreElement>("pre[data-language]")
  ).filter((pre) => pre.dataset.language?.toLowerCase() === "mermaid")
  if (blocks.length === 0) return
  await Promise.all(blocks.map((pre) => renderBlock(pre, alive)))
}

async function renderBlock(
  pre: HTMLPreElement,
  alive: () => boolean
): Promise<void> {
  const source = (pre.textContent ?? "").trim()
  if (!source) return

  const dark = document.documentElement.classList.contains("dark")
  const key = `${dark ? "dark" : "light"}\n${source}`
  let svg = drawn.get(key)
  if (svg === undefined) {
    const result = await draw(source, dark).catch(() => null)
    if (!result) return
    svg = result
    // Bounded, oldest first: a long session's every diagram, in both themes,
    // is not worth holding.
    if (drawn.size >= DRAWN_LIMIT) drawn.delete(drawn.keys().next().value!)
    drawn.set(key, svg)
  }
  if (!alive() || !pre.isConnected) return

  const figure = document.createElement("div")
  figure.className = "markdown-mermaid"
  // Mermaid's own output under `securityLevel: "strict"`: labels are escaped
  // and the SVG passed through its DOMPurify before it comes back.
  figure.innerHTML = svg
  const view = document.createElement("button")
  view.type = "button"
  view.className = "markdown-mermaid-view"
  view.title = "View diagram"
  view.setAttribute("aria-label", "View diagram")
  view.innerHTML = MAXIMIZE_SVG
  figure.append(view)

  pre.classList.add("markdown-mermaid-source")
  pre.before(figure)
}

function draw(source: string, dark: boolean): Promise<string | null> {
  const run = queue.then(async () => {
    const api = await mermaid()
    const wanted = dark ? "dark" : "default"
    if (theme !== wanted) {
      api.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: wanted,
        fontFamily: getComputedStyle(document.body).fontFamily,
        // Without this a failed render leaves Mermaid's bomb-icon error SVG
        // appended to `<body>`; a fence that does not parse is code instead.
        suppressErrorRendering: true,
      })
      theme = wanted
    }
    if (!(await api.parse(source, { suppressErrors: true }))) return null
    const { svg } = await api.render(`markdown-mermaid-${++sequence}`, source)
    return svg
  })
  queue = run.catch(() => undefined)
  return run
}

const MAXIMIZE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>'
