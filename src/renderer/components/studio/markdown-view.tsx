import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import { markdownToHTML } from "@blocknote/core"
import { Maximize, ZoomIn, ZoomOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { revealAt } from "@/lib/files/typescript"
import { useFiles } from "@/lib/files/store"
import { highlightCodeBlocks } from "@/lib/markdown/highlight"
import { linkCodeFiles } from "@/lib/markdown/file-links"
import { renderMermaidBlocks } from "@/lib/markdown/mermaid"
import { headingSlug, linkOf } from "@/lib/markdown/links"
import { sanitizeHtml } from "@/lib/markdown/sanitize"
import { markdownRenderer } from "@/lib/markdown/renderer"
import "./markdown-view.css"

/**
 * Some markdown, rendered — a chat message, or a `.md` file in the Explorer.
 *
 * At the studio's root rather than in either panel because it is now both, and
 * one stylesheet means a heading looks the same wherever it was read from. What
 * differs between the two is the type scale a document wants and a message does
 * not, which is what `className` is for.
 *
 * The DOM is put in place imperatively rather than as React children: it is a
 * fragment built outside React, and asking React to own nodes it did not create
 * is how the two end up fighting over the same subtree.
 *
 * If rendering fails for any reason the message is shown as plain text — the
 * same thing this pane did before it could format anything. A failure costs
 * the formatting and nothing else, and says so in the console, which
 * `electron/main.ts` mirrors into the dev terminal.
 */

/**
 * **There are two parsers here, and `rawHtml` is which.** A chat message is
 * Milkdown's — this app's markdown stack, so an agent's reply is formatted by
 * the same parser that reads what the user types into the composer next to it.
 * A file is BlockNote's, and the reason is the HTML in it: Milkdown's schema has
 * one node for raw HTML and it renders as its own source text, so a `<details>`
 * in a README comes out as the characters `<details>`. BlockNote's converter
 * passes markup through, which is what a file needs — every other reader of that
 * file renders it, GitHub included — and it is the parser the **Markdown
 * editor** already reads the same file with, so the two views of a `.md` agree
 * about what it says rather than nearly agreeing.
 *
 * Markup that came out of a repository does not go on the page as it was
 * written: `lib/markdown/sanitize.ts` is the allowlist it goes through first,
 * and the reason there is one. A chat message deliberately does not get this —
 * an agent's reply is output, not a document, and there is nothing in it that
 * has to be markup.
 */
export function MarkdownView({
  source,
  className,
  rawHtml = false,
  baseDir,
  copyButtons = rawHtml,
  viewTables = false,
  fileBase,
}: {
  source: string
  className?: string
  /** Whether the markup in this document is part of it. True for a file. */
  rawHtml?: boolean
  /**
   * A Copy on each fence, shown on hover. On by default for a file; a chat
   * reply turns it on too, since a fence in an answer is what gets pasted.
   */
  copyButtons?: boolean
  /**
   * A View on each table, shown on hover, that opens it large in a dialog. A
   * table in a chat reply is often wider than its bubble and scrolls sideways,
   * which is no way to read one, so a chat reply turns it on.
   */
  viewTables?: boolean
  /**
   * The directory of the file the document came from: a local picture —
   * `./logo.png` — resolves against it and is read in as a `data:` URL.
   * Absent for a chat message, which has no directory for one to sit next to.
   */
  baseDir?: string
  /**
   * The directory a file named in an inline code span is read from, when such
   * a span should be a link to it — `ipc.ts:227` in a chat reply, read against
   * the chat's folder. Absent, a code span is left as code.
   */
  fileBase?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  // A copy of the table or diagram being viewed, taken when View is pressed:
  // the reply can keep streaming underneath the dialog, and it should hold
  // still.
  const [viewing, setViewing] = useState<Viewed | null>(null)

  useEffect(() => {
    // The file's own pipeline, and synchronous: `markdownToHTML` is a string
    // function rather than an editor, so there is nothing to wait for and no
    // frame where the document is missing.
    if (rawHtml) {
      const node = host.current
      if (!node) return
      try {
        node.replaceChildren(sanitizeHtml(markdownToHTML(source)))
        if (baseDir) resolveLocalImages(node, baseDir)
        if (copyButtons) addCopyButtons(node)
        if (viewTables) addTableViews(node)
      } catch (error) {
        console.error("Could not render markdown", error)
        // The same fallback as `failed` below, put in place rather than flagged:
        // this branch is synchronous, and a setState here would be a second
        // render of the whole document to say the first one did not work.
        const plain = document.createElement("p")
        plain.className = "break-words whitespace-pre-wrap"
        plain.textContent = source
        node.replaceChildren(plain)
      }
      return
    }

    let alive = true

    void markdownRenderer()
      .then((render) => {
        if (!alive) return
        // A `failed` render has already replaced the host with plain text.
        const node = host.current
        if (!node) return
        node.replaceChildren(render(source))
        if (baseDir) resolveLocalImages(node, baseDir)
        if (copyButtons) addCopyButtons(node)
        if (viewTables) addTableViews(node)
        if (fileBase) void linkCodeFiles(node, fileBase, () => alive)
        // A frame later, once the parser is in: the text is on screen plain
        // first and coloured when the grammar arrives, the way a file tab is.
        void highlightCodeBlocks(node, () => alive)
        void renderMermaidBlocks(node, () => alive)
      })
      .catch((error: unknown) => {
        if (!alive) return
        console.error("Could not render markdown", error)
        setFailed(true)
      })

    return () => {
      alive = false
    }
  }, [source, rawHtml, baseDir, copyButtons, viewTables, fileBase])

  if (failed)
    return (
      <p className={cn("text-sm break-words whitespace-pre-wrap", className)}>
        {source}
      </p>
    )

  return (
    <>
      <div
        ref={host}
        onClick={(event) => {
          if (copyCode(event)) return
          const viewed = elementToView(event)
          if (viewed) {
            setViewing(viewed)
            return
          }
          if (openFileLink(event)) return
          followLink(event, baseDir)
        }}
        className={cn("markdown-prose", className)}
      />
      {viewing && (
        <ViewDialog viewed={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  )
}

const COPY_ICON =
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
const CHECK_ICON = '<path d="M20 6 9 17l-5-5"/>'
const MAXIMIZE_ICON =
  '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>'

function iconSvg(paths: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

/**
 * A Copy button on every fence of a file — a README's `docker ps` is there to
 * be pasted into a shell — and on every fence of a chat reply, where the one
 * Copy on the turn's cost line (`replyOf`) copies the whole answer, not the
 * command in it. Hidden until hover, so a reply with no fence draws nothing.
 *
 * Plain DOM, like the document it goes into, with lucide's two paths by hand
 * rather than a React root per fence. The `<pre>` is wrapped because it scrolls
 * sideways, and a button positioned inside it would scroll away with the text.
 */
function addCopyButtons(host: HTMLElement): void {
  for (const pre of Array.from(host.querySelectorAll("pre"))) {
    const frame = document.createElement("div")
    frame.className = "markdown-code"
    pre.replaceWith(frame)
    const button = document.createElement("button")
    button.type = "button"
    button.className = "markdown-code-copy"
    button.title = "Copy"
    button.setAttribute("aria-label", "Copy code")
    button.innerHTML = iconSvg(COPY_ICON)
    frame.append(pre, button)
  }
}

/** A click on a fence's Copy, answered here; true when it was one. */
function copyCode(event: MouseEvent<HTMLDivElement>): boolean {
  if (!(event.target instanceof Element)) return false
  const button = event.target.closest<HTMLButtonElement>(".markdown-code-copy")
  if (!button || !event.currentTarget.contains(button)) return false
  const text = button.parentElement?.querySelector("pre")?.textContent ?? ""
  void navigator.clipboard.writeText(text.replace(/\n$/, ""))
  button.innerHTML = iconSvg(CHECK_ICON)
  button.title = "Copied"
  setTimeout(() => {
    button.innerHTML = iconSvg(COPY_ICON)
    button.title = "Copy"
  }, 1200)
  return true
}

/**
 * A View on every table, on the same terms as a fence's Copy: hidden until
 * hover, and in a frame of its own so the button stays put while the table
 * scrolls sideways underneath it.
 */
function addTableViews(host: HTMLElement): void {
  for (const table of Array.from(host.querySelectorAll("table"))) {
    const frame = document.createElement("div")
    frame.className = "markdown-table"
    table.replaceWith(frame)
    const button = document.createElement("button")
    button.type = "button"
    button.className = "markdown-table-view"
    button.title = "View table"
    button.setAttribute("aria-label", "View table")
    button.innerHTML = iconSvg(MAXIMIZE_ICON)
    frame.append(table, button)
  }
}

/** A click on a file's link in a reply, opened at its line; true when it was one. */
function openFileLink(event: MouseEvent<HTMLDivElement>): boolean {
  if (!(event.target instanceof Element)) return false
  const link = event.target.closest<HTMLAnchorElement>("a.markdown-file-link")
  if (!link || !event.currentTarget.contains(link)) return false
  event.preventDefault()
  const { filePath, fileLine, fileColumn } = link.dataset
  if (filePath)
    revealAt(filePath, Number(fileLine ?? 1), Number(fileColumn ?? 1))
  return true
}

/** What a View button opens: a copy of a table, or of a Mermaid diagram. */
type Viewed = { kind: "table" | "diagram"; node: Element }

/** The table or diagram behind a click on a View button, or null for any other
 * click. */
function elementToView(event: MouseEvent<HTMLDivElement>): Viewed | null {
  if (!(event.target instanceof Element)) return null
  const button = event.target.closest<HTMLButtonElement>(
    ".markdown-table-view, .markdown-mermaid-view"
  )
  if (!button || !event.currentTarget.contains(button)) return null
  if (button.classList.contains("markdown-mermaid-view")) {
    const svg = button.parentElement?.querySelector("svg")
    if (!svg) return null
    const copy = svg.cloneNode(true) as SVGSVGElement
    // Mermaid caps the SVG at its natural width so it never outgrows a reply;
    // in the dialog it may grow, but only so far — at the dialog's full width a
    // tall flowchart is a few boxes the size of the screen — and never taller
    // than the dialog, so the whole diagram is read without scrolling.
    const natural = copy.viewBox.baseVal?.width
    copy.style.maxWidth = natural ? `${Math.round(natural * 1.5)}px` : "none"
    copy.style.maxHeight = "calc(85vh - 3rem)"
    copy.style.height = "auto"
    copy.setAttribute("width", "100%")
    return { kind: "diagram", node: copy }
  }
  const table = button.parentElement?.querySelector("table")
  return table
    ? { kind: "table", node: table.cloneNode(true) as Element }
    : null
}

/**
 * A table or diagram opened large. Shown as a copy of the one in the
 * transcript, which is left where it is — the dialog is a second reading of
 * it, not a move.
 *
 * Mounted only while open (`viewing &&` in the caller), so the copy is taken
 * once and not kept in step with a reply that is still being written.
 */
function ViewDialog({
  viewed,
  onClose,
}: {
  viewed: Viewed
  onClose: () => void
}) {
  // A callback ref rather than an effect: the popup is portalled in after this
  // component mounts, so an effect would find no node and never run again.
  const place = useCallback(
    (node: HTMLDivElement | null) => node?.replaceChildren(viewed.node),
    [viewed]
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[85vh] sm:max-w-[min(60rem,calc(100%-4rem))]",
          viewed.kind === "table" ? "overflow-auto" : "overflow-hidden"
        )}
      >
        <DialogTitle className="sr-only">
          {viewed.kind === "table" ? "Table" : "Diagram"}
        </DialogTitle>
        {viewed.kind === "table" ? (
          <div ref={place} className="markdown-prose markdown-table-dialog" />
        ) : (
          <DiagramViewer place={place} />
        )}
      </DialogContent>
    </Dialog>
  )
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const STEP = 1.25

type View = { scale: number; x: number; y: number }
const FIT: View = { scale: 1, x: 0, y: 0 }

/**
 * A diagram that can be zoomed — the wheel, or the buttons — and dragged. It
 * opens fitted to the dialog; zoom keeps the point under the cursor still,
 * which is what makes zooming into one corner of a large flowchart usable.
 */
function DiagramViewer({
  place,
}: {
  place: (node: HTMLDivElement | null) => void
}) {
  const t = useT()
  const [view, setView] = useState<View>(FIT)
  const viewport = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)

  /** Zoom by `factor` around a point in the viewport's own coordinates. */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const box = viewport.current?.getBoundingClientRect()
    const cx = px ?? (box ? box.width / 2 : 0)
    const cy = py ?? (box ? box.height / 2 : 0)
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor))
      const k = scale / v.scale
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  }, [])

  // A listener of its own, not `onWheel`: React's is passive, and a wheel that
  // zooms must not also scroll the page behind the dialog.
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      viewport.current = node
      if (!node) return
      node.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault()
          const box = node.getBoundingClientRect()
          // A trackpad pinch arrives as a ctrl-wheel with small deltas.
          const delta = event.ctrlKey ? event.deltaY * 10 : event.deltaY
          zoomAt(
            Math.exp(-delta * 0.002),
            event.clientX - box.left,
            event.clientY - box.top
          )
        },
        { passive: false }
      )
    },
    [zoomAt]
  )

  return (
    <div className="relative">
      <div
        ref={attach}
        className="h-[calc(85vh-3rem)] cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
          }
        }}
        onPointerMove={(event) => {
          const from = drag.current
          if (!from || from.id !== event.pointerId) return
          const dx = event.clientX - from.x
          const dy = event.clientY - from.y
          drag.current = { ...from, x: event.clientX, y: event.clientY }
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => setView(FIT)}
      >
        <div
          ref={place}
          className="markdown-prose markdown-mermaid-dialog h-full origin-top-left items-center"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        />
      </div>
      <div className="absolute right-2 bottom-2 flex items-center gap-0.5 rounded-md border bg-background/90 p-0.5 text-muted-foreground shadow-sm">
        <ZoomButton
          label={t("common.zoomOut")}
          onClick={() => zoomAt(1 / STEP)}
        >
          <ZoomOut />
        </ZoomButton>
        <span className="w-11 text-center text-xs tabular-nums">
          {Math.round(view.scale * 100)}%
        </span>
        <ZoomButton label={t("common.zoomIn")} onClick={() => zoomAt(STEP)}>
          <ZoomIn />
        </ZoomButton>
        <ZoomButton label={t("common.zoomFit")} onClick={() => setView(FIT)}>
          <Maximize />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </button>
  )
}

/**
 * A click on a link, read rather than left to the window — `lib/markdown/
 * links.ts` says what goes wrong otherwise. A web link is the one thing let
 * through, since main already hands that to the browser.
 *
 * A relative link opens in the Explorer, a folder by being revealed in the
 * tree. In a chat message there is no directory to resolve one against, so it
 * does nothing, which is still better than what it did.
 */
function followLink(event: MouseEvent<HTMLDivElement>, baseDir?: string) {
  if (!(event.target instanceof Element)) return
  const anchor = event.target.closest("a[href]")
  if (!anchor || !event.currentTarget.contains(anchor)) return

  const link = linkOf(anchor.getAttribute("href") ?? "")
  if (link.kind === "external") return
  event.preventDefault()

  if (link.kind === "anchor") {
    const heading = Array.from(
      event.currentTarget.querySelectorAll("h1, h2, h3, h4, h5, h6")
    ).find(
      (node) =>
        node.id === link.id ||
        headingSlug(node.textContent ?? "") === link.id.toLowerCase()
    )
    heading?.scrollIntoView({ block: "start" })
    return
  }

  if (link.kind === "relative" && baseDir)
    void openRelative(baseDir, link.paths)
}

async function openRelative(baseDir: string, paths: string[]): Promise<void> {
  for (const candidate of paths) {
    const target = await window.desktop.resolveRelativePath(baseDir, candidate)
    if (!target) continue
    const files = useFiles.getState()
    if (target.directory) await files.reveal(target.path)
    else await files.open(target.path)
    return
  }
  // A dead link stays dead: a README pointing at a file nobody committed is
  // ordinary, and the window staying where it is says as much.
}

/**
 * A document's local pictures, read in and swapped for their paths.
 *
 * `./logo.png` in a README has no meaning to a browser here: the renderer is
 * not on a `file://` origin, so the image is broken unless its bytes come over
 * the bridge like every other file. Main resolves the relative path against
 * the document's own directory — the renderer never joins paths — and reads
 * it back as a `data:` URL, held to the workspace's folders like every other
 * `files:*` call.
 *
 * A `src` with a scheme (`http:`, `data:`, …) is left alone, and so is one
 * anchored at `/`, which in a README means the repository root this preview
 * has no name for.
 */
function resolveLocalImages(host: HTMLElement, baseDir: string): void {
  for (const img of Array.from(host.querySelectorAll("img"))) {
    const src = img.getAttribute("src")
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")) {
      continue
    }
    // The browser would prefer a relative `srcset` over the fixed `src` below,
    // so a local image takes one without the other.
    img.removeAttribute("srcset")
    void readLocalImage(img, baseDir, src)
  }
}

/**
 * One `<img>` with a relative `src`, read and put in place.
 *
 * A name with a space or a `#` in it travels as `%20`/`%23`, which is not a
 * filename, so the decoded form is tried after the path as written — decoding
 * a `%` that was literal would break a name that is fine as it is. A failure
 * either way leaves the broken image, which is the honest answer for a picture
 * that is too large, not a picture at all, or outside the workspace's folders.
 */
async function readLocalImage(
  img: HTMLImageElement,
  baseDir: string,
  src: string
): Promise<void> {
  const candidates = [src]
  try {
    const decoded = decodeURIComponent(src)
    if (decoded !== src) candidates.push(decoded)
  } catch {
    // Not valid percent-encoding; the path as written is the only reading.
  }

  for (const target of candidates) {
    try {
      img.src = await window.desktop.readImageRelative(baseDir, target)
      return
    } catch {
      // Try the next reading; nothing left to try is the broken image.
    }
  }
}
