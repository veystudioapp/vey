import { useEffect, useRef, useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MessageSquareText,
  X,
} from "lucide-react"

import { noteFileUrl } from "@shared/note-files"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useT, type MessageKey } from "@/lib/i18n"
import { iconFor } from "@/lib/files/icons"
import { nameOf, parentOf, relativeTo } from "@/lib/files/paths"
import { rootOf } from "@/lib/files/roots"
import { useFiles } from "@/lib/files/store"
import { cn } from "@/lib/utils"
import type { ChatMedia, MediaKind } from "@/lib/chat/media"
import { IconButton } from "../icon-button"
import { SideColumn } from "./side-column"

const TABS: { kind: MediaKind; label: MessageKey }[] = [
  { kind: "images", label: "transcript.media.tabMedia" },
  { kind: "files", label: "transcript.media.tabFiles" },
  { kind: "links", label: "transcript.media.tabLinks" },
]

/**
 * What a chat has shared — see `mediaOf` — as a column beside the transcript,
 * where the table of contents goes and for the same reason: it is read while
 * scrolling, so it is a column rather than a popover.
 *
 * Every item can land on the line it came from (`onPick`), which is what makes
 * this a way *into* the conversation rather than a gallery beside it.
 */
export function ChatMediaColumn({
  media,
  onPick,
  onClose,
}: {
  media: ChatMedia
  onPick: (lineId: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<MediaKind>("images")
  const [viewing, setViewing] = useState<number | null>(null)

  return (
    <SideColumn label={t("transcript.media.label")}>
      <div className="flex h-8 shrink-0 items-center gap-0.5 pr-1 pl-1.5">
        {/* The tabs give way before the close button does: each may shrink to
            its count, so a narrow column cuts a word rather than pushing
            the X out of reach. */}
        <div role="tablist" className="flex min-w-0 flex-1 gap-0.5">
          {TABS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={tab === kind}
              onClick={() => setTab(kind)}
              className={cn(
                "flex min-w-0 items-baseline rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                tab === kind && "bg-accent text-foreground"
              )}
            >
              <span className="min-w-0 truncate">{t(label)}</span>
              <span className="ml-1 shrink-0 tabular-nums opacity-60">
                {media[kind].length}
              </span>
            </button>
          ))}
        </div>
        <IconButton
          label={t("transcript.media.close")}
          side="bottom"
          onClick={onClose}
          className="shrink-0"
        >
          <X />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {media[tab].length === 0 ? (
          <p className="px-1.5 py-2 text-[0.7rem] text-muted-foreground">
            {tab === "images"
              ? t("transcript.media.noImages")
              : tab === "files"
                ? t("transcript.media.noFiles")
                : t("transcript.media.noLinks")}
          </p>
        ) : tab === "images" ? (
          <ul className="grid grid-cols-3 gap-1">
            {media.images.map((image, index) => (
              <li key={`${image.lineId}:${image.file}`}>
                <button
                  type="button"
                  aria-label={t("transcript.media.openPicture", {
                    n: index + 1,
                  })}
                  onClick={() => setViewing(index)}
                  className="block aspect-square w-full overflow-hidden rounded-md border bg-muted/50 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <img
                    src={noteFileUrl(image.file)}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : tab === "files" ? (
          <ul>
            {media.files.map((file) => (
              <Row
                key={file.path}
                title={file.path}
                icon={<FileIcon path={file.path} />}
                label={nameOf(file.path)}
                caption={folderOf(file.path)}
                onOpen={() => void useFiles.getState().open(file.path)}
                onFind={() => onPick(file.lineId)}
              />
            ))}
          </ul>
        ) : (
          <ul>
            {media.links.map((link) => (
              <Row
                key={link.url}
                title={link.url}
                icon={<Link2 className="size-3.5 shrink-0" />}
                label={link.url}
                link
                onOpen={() => openLink(link.url)}
                onFind={() => onPick(link.lineId)}
                actions={
                  <>
                    <CopyButton text={link.url} />
                    <IconButton
                      label={t("transcript.media.openInBrowser")}
                      side="left"
                      onClick={() => openLink(link.url)}
                      className="size-6"
                    >
                      <ExternalLink className="size-3.5" />
                    </IconButton>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </div>

      <Viewer
        images={media.images}
        at={viewing}
        onAt={setViewing}
        onFind={(lineId) => {
          setViewing(null)
          onPick(lineId)
        }}
      />
    </SideColumn>
  )
}

/** A file or a link: the row opens it, the buttons beside it — on hover —
 * do the rest, ending with finding it in the chat. What somebody wants from a
 * file listed here is usually the file, and only sometimes the turn that wrote
 * it. */
function Row({
  title,
  icon,
  label,
  caption,
  onOpen,
  onFind,
  actions,
  link = false,
}: {
  title: string
  icon: React.ReactNode
  label: string
  caption?: string
  onOpen: () => void
  onFind: () => void
  /** Buttons ahead of `Show in chat`. */
  actions?: React.ReactNode
  /** Drawn in a link's blue, so a web link reads as one at a glance. */
  link?: boolean
}) {
  const t = useT()
  return (
    <li className="group/row flex items-center rounded-md hover:bg-accent">
      <button
        type="button"
        title={title}
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left",
          link
            ? "text-blue-600 group-hover/row:underline dark:text-blue-400"
            : "text-muted-foreground group-hover/row:text-foreground"
        )}
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{label}</span>
          {caption && (
            <span className="block truncate text-[0.65rem] opacity-60">
              {caption}
            </span>
          )}
        </span>
      </button>
      {/* Hidden rather than unmounted, so a button keeps its focus ring
          for the keyboard; taken out of the row's width only while hidden,
          so a long URL is not cut short for buttons nobody can see. */}
      <span className="hidden shrink-0 items-center group-focus-within/row:flex group-hover/row:flex">
        {actions}
        <IconButton
          label={t("transcript.media.showInChat")}
          side="left"
          onClick={onFind}
          className="size-6"
        >
          <MessageSquareText className="size-3.5" />
        </IconButton>
      </span>
    </li>
  )
}

function FileIcon({ path }: { path: string }) {
  const url = iconFor(path)
  return url ? (
    <img src={url} alt="" aria-hidden className="size-3.5 shrink-0" />
  ) : (
    <FileText className="size-3.5 shrink-0" />
  )
}

/** Where the file sits, relative to its project — the absolute path is forty
 * characters of checkout before it says anything (see `ObjectChip`). */
function folderOf(path: string): string {
  const root = rootOf(path)
  if (!root) return parentOf(path)
  const relative = relativeTo(root.path, path)
  // `parentOf` answers a bare name with the name itself.
  return relative === nameOf(relative)
    ? root.label
    : `${root.label}/${parentOf(relative)}`
}

/** `window.open` is handed to the browser by main's `setWindowOpenHandler` —
 * no second app window. */
function openLink(url: string): void {
  window.open(url)
}

/** Copies, and says so for a moment with a tick in the button's place — the
 * one feedback a button this small has room for. */
function CopyButton({ text }: { text: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <IconButton
      label={copied ? t("common.copied") : t("transcript.media.copyLink")}
      side="left"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => setCopied(true))
      }
      className="size-6"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </IconButton>
  )
}

/**
 * One picture full size, with the rest of the chat's a key away — the
 * Telegram viewer's `←` / `→`. Contained and never scaled up, the rule
 * `ImageThumb`'s dialog follows.
 */
function Viewer({
  images,
  at,
  onAt,
  onFind,
}: {
  images: ChatMedia["images"]
  at: number | null
  onAt: (at: number | null) => void
  onFind: (lineId: string) => void
}) {
  const t = useT()
  const image = at === null ? undefined : images[at]
  // Newest first, so `←` is back to the newer picture and `→` on to the older:
  // the grid's own reading order.
  const step = (by: number) => {
    if (at === null) return
    const next = at + by
    if (next >= 0 && next < images.length) onAt(next)
  }

  useEffect(() => {
    if (at === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1)
      else if (event.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <Dialog
      open={image !== undefined}
      onOpenChange={(open) => !open && onAt(null)}
    >
      {/* A fixed stage rather than one sized to the picture: sized to it, the
          arrows moved with every picture's shape and the next click landed
          on nothing. */}
      <DialogContent className="h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none grid-rows-[minmax(0,1fr)_auto_auto] gap-2 p-2 sm:max-w-none">
        <DialogTitle className="sr-only">
          {t("transcript.media.pictureOf", {
            n: (at ?? 0) + 1,
            total: images.length,
          })}
        </DialogTitle>
        {image && (
          <>
            <div className="relative flex min-h-0 items-center justify-center">
              <img
                src={noteFileUrl(image.file)}
                alt=""
                className="max-h-full max-w-full rounded-md object-contain"
              />
              {/* Centred by the wrapper, not by a translate on the button:
                  `Button`'s `active:translate-y-px` writes the same variable,
                  so a press dropped the arrow by half its height. */}
              <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
                <IconButton
                  label={t("transcript.media.newer")}
                  side="right"
                  disabled={at === 0}
                  onClick={() => step(-1)}
                  className="pointer-events-auto size-9 rounded-full bg-background/80 shadow-sm backdrop-blur-sm hover:bg-background"
                >
                  <ChevronLeft className="size-5" />
                </IconButton>
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                <IconButton
                  label={t("transcript.media.older")}
                  side="left"
                  disabled={at === images.length - 1}
                  onClick={() => step(1)}
                  className="pointer-events-auto size-9 rounded-full bg-background/80 shadow-sm backdrop-blur-sm hover:bg-background"
                >
                  <ChevronRight className="size-5" />
                </IconButton>
              </div>
            </div>
            {images.length > 1 && (
              <ThumbStrip images={images} at={at ?? 0} onAt={onAt} />
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="px-1.5 tabular-nums">
                {(at ?? 0) + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={() => onFind(image.lineId)}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground"
              >
                <MessageSquareText className="size-3.5" />
                {t("transcript.media.showInChat")}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Every picture of the chat as a row of thumbnails under the viewer. A long
 * row scrolls, and gets its own `‹` / `›` for it — a mouse without a
 * horizontal wheel had no way along it — each shown only while there is
 * something that way, so a short row draws no buttons at all.
 */
function ThumbStrip({
  images,
  at,
  onAt,
}: {
  images: ChatMedia["images"]
  at: number
  onAt: (at: number) => void
}) {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ before: false, after: false })

  // Measured on scroll and on resize rather than once: the dialog's own
  // opening animation and a window resize both change what overflows.
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = element
      // A pixel of slack: a fractional `scrollLeft` at the far end never
      // quite reaches `scrollWidth - clientWidth`.
      setRoom({
        before: scrollLeft > 1,
        after: scrollLeft + clientWidth < scrollWidth - 1,
      })
    }
    measure()
    element.addEventListener("scroll", measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => {
      element.removeEventListener("scroll", measure)
      observer.disconnect()
    }
  }, [images.length])

  // The strip follows the picture, so stepping with the keys never walks the
  // highlighted thumbnail out of sight.
  useEffect(() => {
    scroller.current
      ?.querySelector(`[data-at="${at}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [at])

  // Most of a page, so the thumbnail at the edge stays on screen and the eye
  // has somewhere to pick the row back up.
  const page = (direction: 1 | -1) => {
    const element = scroller.current
    if (!element) return
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: "smooth",
    })
  }

  return (
    <div className="relative">
      <div className="[scrollbar-width:none] overflow-x-auto" ref={scroller}>
        {/* `w-max` + `mx-auto` centres a short strip without clipping the
            start of a long one, which `justify-center` on the scroller
            would. The side padding keeps the end thumbnails clear of the
            buttons. */}
        <ul className="mx-auto flex w-max gap-1 px-9 py-0.5">
          {images.map((thumb, index) => (
            <li key={`${thumb.lineId}:${thumb.file}`}>
              <button
                type="button"
                data-at={index}
                aria-label={t("transcript.media.picture", { n: index + 1 })}
                aria-current={index === at}
                onClick={() => onAt(index)}
                className={cn(
                  "block size-12 overflow-hidden rounded-md border opacity-60 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  index === at && "opacity-100 ring-2 ring-primary"
                )}
              >
                <img
                  src={noteFileUrl(thumb.file)}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {room.before && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center">
          <IconButton
            label={t("transcript.media.scrollBack")}
            side="top"
            onClick={() => page(-1)}
            className="pointer-events-auto size-7 rounded-full bg-background/90 shadow-sm hover:bg-background"
          >
            <ChevronLeft className="size-4" />
          </IconButton>
        </div>
      )}
      {room.after && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
          <IconButton
            label={t("transcript.media.scrollOn")}
            side="top"
            onClick={() => page(1)}
            className="pointer-events-auto size-7 rounded-full bg-background/90 shadow-sm hover:bg-background"
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      )}
    </div>
  )
}
