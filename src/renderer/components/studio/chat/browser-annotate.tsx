import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react"
import {
  ChevronDown,
  Circle,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react"

import type { ChatImage } from "@shared/api"
import type { PickedElement } from "@shared/browser"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  add,
  clear,
  COLORS,
  emptySketch,
  isTrivial,
  paint,
  redo,
  textSize,
  undo,
  WIDTHS,
  type Mark,
  type Point,
  type Shape,
  type Sketch,
  type Tool,
} from "@/lib/browser/annotate"
import { useComposerBus } from "@/lib/chat/composer-bus"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { IconButton } from "../icon-button"

/** The widest picture sent to the chat: past this a capture costs tokens and
 * says nothing more. */
const MAX_WIDTH = 1600

const SHAPE_ICONS = { rect: Square, ellipse: Circle, arrow: MoveUpRight }

/**
 * Drawing over a tab's page, then handing the result to the chat: pick
 * elements, draw, box, point, write — and `Add to chat` puts the page's
 * capture with all of it painted on into the composer as a picture, and
 * nothing else — the picked elements are numbered on it. Nothing is sent: the
 * question is the user's to write.
 *
 * Over the `<webview>` rather than inside the page, so nothing is injected
 * into a site that is not this app's, and the capture underneath is clean.
 * The page is frozen while it is up — the overlay takes the wheel — since a
 * mark is drawn where the page was.
 */
export function BrowserAnnotate({
  chatId,
  tabId,
  onClose,
}: {
  chatId: string
  tabId: string
  onClose: () => void
}) {
  const t = useT()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [shape, setShape] = useState<Shape>("rect")
  const [color, setColor] = useState<string>(COLORS[0])
  const [width, setWidth] = useState<number>(WIDTHS[1])
  const [sketch, setSketch] = useState<Sketch>(emptySketch)
  const [draft, setDraft] = useState<Mark | null>(null)
  const [hover, setHover] = useState<PickedElement | null>(null)
  const [writing, setWriting] = useState<{ at: Point; text: string } | null>(
    null
  )
  const [sending, setSending] = useState(false)
  /** Why the last `Add to chat` did not — a capture that came back empty is
   * said, rather than a button that silently does nothing. */
  const [failed, setFailed] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // The canvas follows its box, at the screen's own density.
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext("2d")
    if (!element || !context) return
    const ratio = window.devicePixelRatio || 1
    element.width = Math.round(size.width * ratio)
    element.height = Math.round(size.height * ratio)
    context.clearRect(0, 0, element.width, element.height)
    paint(context, sketch.present, ratio, {
      draft,
      hover: tool === "select" ? hover : null,
    })
  }, [size, sketch, draft, hover, tool])

  /** The element under the pointer, asked of the page at most once in
   * flight — a pointer moves faster than a round trip to the guest. */
  const asking = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const inspect = useCallback(
    async (point: Point) => {
      lastPoint.current = point
      if (asking.current) return
      asking.current = true
      try {
        while (lastPoint.current) {
          const at = lastPoint.current
          lastPoint.current = null
          setHover(
            await window.desktop.browserInspect(chatId, tabId, at.x, at.y)
          )
        }
      } finally {
        asking.current = false
      }
    },
    [chatId, tabId]
  )

  const pointOf = (event: PointerEvent): Point => {
    const box = canvas.current!.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const onDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const point = pointOf(event)
    if (tool === "select") {
      if (hover) {
        setSketch((current) =>
          add(current, { kind: "element", element: hover, color })
        )
      }
      return
    }
    if (tool === "text") {
      commitText()
      setWriting({ at: point, text: "" })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft(
      tool === "pen"
        ? { kind: "pen", points: [point], color, width }
        : { kind: tool, from: point, to: point, color, width }
    )
  }

  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pointOf(event)
    if (tool === "select") {
      void inspect(point)
      return
    }
    setDraft((current) => {
      if (!current) return current
      if (current.kind === "pen") {
        return { ...current, points: [...current.points, point] }
      }
      if (
        current.kind === "rect" ||
        current.kind === "ellipse" ||
        current.kind === "arrow"
      ) {
        return { ...current, to: point }
      }
      return current
    })
  }

  const onUp = () => {
    if (!draft) return
    if (!isTrivial(draft)) setSketch((current) => add(current, draft))
    setDraft(null)
  }

  const commitText = () => {
    if (!writing) return
    const mark: Mark = {
      kind: "text",
      at: writing.at,
      text: writing.text,
      color,
      width,
    }
    if (!isTrivial(mark)) setSketch((current) => add(current, mark))
    setWriting(null)
  }

  const pick = (next: Tool) => {
    commitText()
    setHover(null)
    setTool(next)
  }

  /**
   * The capture with the marks painted over it, into the composer.
   *
   * Main captures the guest — device pixels, without this overlay — and the
   * marks are painted again at that scale, by the same `paint` the screen
   * uses.
   */
  const addToChat = async () => {
    commitText()
    setSending(true)
    setFailed(null)
    try {
      const capture = await window.desktop.browserCapture(chatId, tabId)
      const box = canvas.current
      if (!capture || !box) {
        setFailed(t("transcript.annotate.captureFailed"))
        return
      }
      const image = await loaded(`data:image/png;base64,${capture.data}`)
      const out = document.createElement("canvas")
      const shrink = Math.min(1, MAX_WIDTH / capture.width)
      out.width = Math.round(capture.width * shrink)
      out.height = Math.round(capture.height * shrink)
      const context = out.getContext("2d")
      if (!context) return
      context.drawImage(image, 0, 0, out.width, out.height)
      paint(context, sketch.present, out.width / box.clientWidth)
      const data = out.toDataURL("image/png").split(",")[1] ?? ""
      const picture: ChatImage = { mediaType: "image/png", data }
      // The picture alone: what it is about is the user's to write.
      useComposerBus.getState().deliverTo({
        chatId,
        text: "",
        images: [picture],
      })
      onClose()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setSending(false)
    }
  }

  // Escape leaves, ⌘Z / ⇧⌘Z undo and redo — while the overlay is up they are
  // its, not the composer's.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (writing) return
      // A field elsewhere — the composer — keeps its own keys.
      const target = event.target as HTMLElement | null
      if (
        target?.closest("input, textarea, [contenteditable=true], .cm-editor")
      ) {
        return
      }
      if (event.key === "Escape") onClose()
      else if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault()
        setSketch((current) => (event.shiftKey ? redo(current) : undo(current)))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [writing, onClose])

  const ShapeIcon = SHAPE_ICONS[shape]
  const isShape = tool === "rect" || tool === "ellipse" || tool === "arrow"

  return (
    <div className="absolute inset-0 z-10">
      <canvas
        ref={canvas}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setHover(null)}
        className={cn(
          "absolute inset-0 size-full",
          tool === "select" ? "cursor-pointer" : "cursor-crosshair"
        )}
      />

      {writing && (
        <textarea
          autoFocus
          value={writing.text}
          rows={1}
          onChange={(event) =>
            setWriting({ ...writing, text: event.target.value })
          }
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === "Escape") setWriting(null)
            else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              commitText()
            }
          }}
          style={{
            left: writing.at.x,
            top: writing.at.y,
            color,
            fontSize: textSize(width),
          }}
          className="absolute min-w-24 resize-none rounded border border-dashed border-current bg-background/70 px-1 leading-tight font-semibold outline-none"
        />
      )}

      <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-3">
        {failed && (
          <p
            role="alert"
            className="max-w-sm animate-pop rounded-lg border bg-popover px-3 py-1.5 text-xs text-destructive shadow-md"
          >
            {failed}
          </p>
        )}
        <div
          role="toolbar"
          aria-label={t("transcript.annotate.label")}
          className="flex animate-pop items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-lg"
        >
          <ToolButton
            label={t("transcript.annotate.select")}
            active={tool === "select"}
            onClick={() => pick("select")}
          >
            <MousePointer2 />
          </ToolButton>
          <ToolButton
            label={t("transcript.annotate.pen")}
            active={tool === "pen"}
            onClick={() => pick("pen")}
          >
            <Pencil />
          </ToolButton>
          <div className="flex items-center">
            <ToolButton
              label={t(`transcript.annotate.${shape}`)}
              active={isShape}
              onClick={() => pick(shape)}
            >
              <ShapeIcon />
            </ToolButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    label={t("transcript.annotate.shapes")}
                    side="top"
                    className="h-7 w-4"
                  >
                    <ChevronDown className="size-3" />
                  </IconButton>
                }
              />
              <DropdownMenuContent side="top" align="start" className="w-40">
                {(["rect", "ellipse", "arrow"] as const).map((each) => {
                  const Icon = SHAPE_ICONS[each]
                  return (
                    <DropdownMenuItem
                      key={each}
                      onClick={() => {
                        setShape(each)
                        pick(each)
                      }}
                    >
                      <Icon />
                      {t(`transcript.annotate.${each}`)}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ToolButton
            label={t("transcript.annotate.text")}
            active={tool === "text"}
            onClick={() => pick("text")}
          >
            <Type />
          </ToolButton>

          <Divider />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("transcript.annotate.color")}
                  title={t("transcript.annotate.color")}
                  className="flex h-7 items-center gap-1 rounded-md px-1.5 hover:bg-accent"
                >
                  <span
                    className="size-4 rounded-full border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent side="top" align="center" className="w-auto">
              <div className="grid grid-cols-4 gap-1.5 p-1.5">
                {COLORS.map((each) => (
                  <button
                    key={each}
                    type="button"
                    aria-label={each}
                    onClick={() => setColor(each)}
                    className={cn(
                      "size-6 rounded-full border border-black/10",
                      each === color && "ring-2 ring-ring ring-offset-2"
                    )}
                    style={{ backgroundColor: each }}
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("transcript.annotate.width")}
                  title={t("transcript.annotate.width")}
                  className="flex h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent"
                >
                  <span
                    className="w-6 rounded-full bg-foreground"
                    style={{ height: Math.max(2, width / 1.5) }}
                  />
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent side="top" align="center" className="w-28">
              {WIDTHS.map((each) => (
                <DropdownMenuItem key={each} onClick={() => setWidth(each)}>
                  <span
                    className="w-12 rounded-full bg-foreground"
                    style={{ height: Math.max(2, each / 1.5) }}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Divider />

          <ToolButton
            label={t("transcript.annotate.undo")}
            disabled={sketch.past.length === 0}
            onClick={() => setSketch(undo)}
          >
            <Undo2 />
          </ToolButton>
          <ToolButton
            label={t("transcript.annotate.redo")}
            disabled={sketch.future.length === 0}
            onClick={() => setSketch(redo)}
          >
            <Redo2 />
          </ToolButton>
          <ToolButton
            label={t("transcript.annotate.clear")}
            disabled={sketch.present.length === 0}
            onClick={() => setSketch(clear)}
          >
            <Trash2 />
          </ToolButton>

          <Button
            size="sm"
            disabled={sending}
            onClick={() => void addToChat()}
            className="mx-1 h-7 rounded-lg"
          >
            {sending && <Spinner className="size-3" aria-label="" />}
            {t("transcript.annotate.addToChat")}
          </Button>
          <ToolButton label={t("transcript.annotate.close")} onClick={onClose}>
            <X />
          </ToolButton>
        </div>
      </div>
    </div>
  )
}

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconButton
      label={label}
      side="top"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-7 rounded-md [&_svg]:size-4",
        active && "bg-primary/10 text-primary hover:bg-primary/15"
      )}
    >
      {children}
    </IconButton>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />
}

function loaded(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("The capture could not be read."))
    image.src = source
  })
}
