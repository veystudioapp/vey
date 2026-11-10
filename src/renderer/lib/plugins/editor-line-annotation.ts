import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  showTooltip,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view"

import type { PluginLineAnnotation, PluginLineAnnotator } from "./registry"
import { usePlugins } from "./store"

/**
 * Faint words after the caret's line, and a card behind them on hover — what
 * a plugin adds through `app.editor.addLineAnnotation`. The built-in
 * `git-blame` plugin's is GitLens's current-line blame.
 *
 * The app owns this half for the reason `editor-lint.ts` gives: a plugin
 * bundling CodeMirror is a second copy of the view package. The plugin answers
 * a buffer with "what to write at line n" and draws its own card into a box
 * this hands it; everything about where the words sit, when they are asked
 * for and when they hide is here.
 *
 * Asked when the editor opens, when it is focused again — a commit made in the
 * dock's shell meanwhile — and a moment after typing stops, with the buffer as
 * it stands so the lines line up.
 *
 * **Hidden while the answer is stale.** It is indexed by the line of the text
 * it was asked about, and a line typed above the caret moves every line under
 * it; words that are one line off are worse than none, for the second it takes
 * to ask again.
 *
 * The hover is a tooltip the widget opens itself rather than a `hoverTooltip`,
 * which is asked about positions — and the words are past the end of the line,
 * where every point maps to the same one.
 */

type Lookup = (line: number) => PluginLineAnnotation | null

const answered = StateEffect.define<Lookup | null>()
const hovered = StateEffect.define<boolean>()

type AnnotationState = {
  lookup: Lookup | null
  /** The buffer has changed since `lookup` was asked for. */
  stale: boolean
  /** The card is open. */
  hover: boolean
}

const annotationState = StateField.define<AnnotationState>({
  create: () => ({ lookup: null, stale: false, hover: false }),
  update(value, tr) {
    let next = value
    for (const effect of tr.effects) {
      if (effect.is(answered))
        next = { ...next, lookup: effect.value, stale: false }
      if (effect.is(hovered)) next = { ...next, hover: effect.value }
    }
    if (tr.docChanged) next = { ...next, stale: true, hover: false }
    // The card is about one line, and a caret moving off it is a new question.
    else if (tr.selection) next = { ...next, hover: false }
    return next
  },
})

/** The caret's line and what is written after it, or null for nothing. */
function currentOf(
  state: EditorState
): { to: number; annotation: PluginLineAnnotation } | null {
  const { lookup, stale } = state.field(annotationState)
  if (!lookup || stale) return null
  const line = state.doc.lineAt(state.selection.main.head)
  let annotation: PluginLineAnnotation | null
  try {
    annotation = lookup(line.number)
  } catch (error) {
    console.error("[plugin] line annotation", error)
    return null
  }
  if (!annotation || typeof annotation.text !== "string") return null
  return { to: line.to, annotation }
}

class Words extends WidgetType {
  constructor(
    readonly text: string,
    readonly hoverable: boolean
  ) {
    super()
  }

  eq(other: Words) {
    return this.text === other.text && this.hoverable === other.hoverable
  }

  /**
   * **Laid over the line, not in it.** When the file editor wrapped, words
   * written into the line made it longer — onto a second row, pushing every
   * line under it down a row as the caret moved; unwrapped, they would widen
   * the scroll area under every line the caret passed. So the line gets a zero-width anchor, and
   * the words hang off it absolutely — the code on screen never moves for
   * them.
   *
   * **Never cut.** They were once trimmed to the room before the edge and
   * hidden below 60px, which hid them — and the card behind them — on exactly
   * the long lines; now a line that reaches the edge pushes them past it, and
   * the scroller's horizontal bar is the way to them.
   */
  toDOM(view: EditorView) {
    const dom = document.createElement("span")
    dom.className = "cm-lineAnnotation"
    const text = document.createElement("span")
    text.className = "cm-lineAnnotation-text"
    text.textContent = this.text
    if (this.hoverable) holdOpen(view, text)
    // What the caret is measured against — see `coordsAt`.
    const caret = document.createElement("span")
    caret.className = "cm-lineAnnotation-caret"
    caret.textContent = "​"
    dom.append(caret, text)
    return dom
  }

  /**
   * Where the caret is drawn when CodeMirror asks this widget rather than the
   * text — which, on an **empty** line, is always: the widget is all the line
   * holds. Left to measure the anchor itself it got a box of no height (no
   * width, and its only child taken out of the flow), and the caret on a blank
   * line vanished. A zero-width space in the flow gives a box the height a
   * character has, at the place a character would sit.
   */
  coordsAt(dom: HTMLElement) {
    const caret = dom.querySelector(".cm-lineAnnotation-caret")
    if (!caret) return null
    const rect = caret.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.left,
      top: rect.top,
      bottom: rect.bottom,
    }
  }

  ignoreEvent() {
    return true
  }
}

/** The gap between the code and the words. */
const GAP = 32

const words = EditorView.decorations.compute(
  [annotationState, "selection"],
  (state): DecorationSet => {
    const current = currentOf(state)
    // A selection is being made, not read, and the pill for it sits there.
    if (!current || !state.selection.main.empty) return Decoration.none
    return Decoration.set(
      Decoration.widget({
        widget: new Words(
          current.annotation.text,
          typeof current.annotation.card === "function"
        ),
        side: 1,
      }).range(current.to)
    )
  }
)

/** The open and close delays, per view — a pointer crossing from the words to
 * the card passes over a gap, and closing on that would make the card
 * unreachable. */
const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>()

function setHover(view: EditorView, on: boolean, delay: number) {
  clearTimeout(timers.get(view))
  timers.set(
    view,
    setTimeout(() => {
      if (view.state.field(annotationState, false)?.hover === on) return
      view.dispatch({ effects: hovered.of(on) })
    }, delay)
  )
}

/** Long enough that a pointer passing over the words on its way somewhere else
 * does not throw a card over the code. Entering the card itself still cancels a
 * pending close at once — `setHover` clears the timer before waiting. */
const OPEN_DELAY_MS = 1000

function holdOpen(view: EditorView, dom: HTMLElement) {
  dom.addEventListener("mouseenter", () => setHover(view, true, OPEN_DELAY_MS))
  dom.addEventListener("mouseleave", () => setHover(view, false, 200))
}

const card = showTooltip.compute([annotationState, "selection"], (state) => {
  if (!state.field(annotationState).hover) return null
  const current = currentOf(state)
  const mount = current?.annotation.card
  if (!current || typeof mount !== "function") return null
  return {
    pos: current.to,
    above: false,
    arrow: false,
    create(view) {
      const dom = document.createElement("div")
      dom.className = "cm-lineAnnotationCard"
      holdOpen(view, dom)
      let unmount: (() => void) | undefined
      try {
        unmount = mount(dom, {
          close: () => view.dispatch({ effects: hovered.of(false) }),
          remeasure: () => view.requestMeasure(),
        })
      } catch (error) {
        console.error("[plugin] line annotation card", error)
      }
      return { dom, destroy: () => unmount?.() }
    },
  } satisfies Tooltip
})

const theme = EditorView.baseTheme({
  // `inline-block` with no width, top-aligned, so the words hung off it sit on
  // the caret's row however tall the line box is.
  ".cm-lineAnnotation": {
    display: "inline-block",
    position: "relative",
    width: "0",
    verticalAlign: "top",
  },
  ".cm-lineAnnotation-text": {
    position: "absolute",
    top: "0",
    left: `${GAP}px`,
    // Room after the words, so scrolled to the end they do not sit against
    // the scrollbar.
    paddingRight: "16px",
    whiteSpace: "pre",
    color: "var(--muted-foreground)",
    opacity: "0.7",
    fontStyle: "normal",
    cursor: "default",
  },
  ".cm-lineAnnotation-text:hover": { opacity: "1" },
  ".cm-tooltip:has(> .cm-lineAnnotationCard)": { overflow: "visible" },
})

/** How long typing has to stop before the buffer is asked about again. */
const SETTLE_MS = 800

/** The annotator drawn: the first one added — the end of a line has room for
 * one sentence. */
function annotatorOf(): PluginLineAnnotator | null {
  return usePlugins.getState().lineAnnotators[0] ?? null
}

/** The asking: on open, on focus, once typing settles, and when the annotator
 * changes — a plugin switched on or off. */
function asker(path: string) {
  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined
      /** Answers land out of order; only the newest is kept. */
      asked = 0
      alive = true
      stop: () => void

      constructor(readonly view: EditorView) {
        this.ask()
        let current = annotatorOf()
        this.stop = usePlugins.subscribe((state, previous) => {
          if (state.lineAnnotators === previous.lineAnnotators) return
          const next = annotatorOf()
          if (next === current) return
          current = next
          this.ask()
        })
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.ask(SETTLE_MS)
        else if (update.focusChanged && update.view.hasFocus) this.ask()
      }

      ask(delay = 0) {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          const id = ++this.asked
          const annotator = annotatorOf()
          if (!annotator) {
            if (this.view.state.field(annotationState).lookup) {
              this.view.dispatch({ effects: answered.of(null) })
            }
            return
          }
          const text = this.view.state.doc.toString()
          void Promise.resolve()
            .then(() => annotator.annotate({ path, text }))
            .catch((error: unknown) => {
              console.error(`[plugin ${annotator.pluginId}]`, error)
              return null
            })
            .then((lookup) => {
              if (!this.alive || id !== this.asked) return
              // Typed into while the plugin was asking: the answer is already
              // stale, and the next one is on its way.
              if (this.view.state.doc.toString() !== text) return
              this.view.dispatch({
                effects: answered.of(
                  typeof lookup === "function" ? lookup : null
                ),
              })
            })
        }, delay)
      }

      destroy() {
        this.alive = false
        this.stop()
        clearTimeout(this.timer)
        clearTimeout(timers.get(this.view))
      }
    }
  )
}

/** On every file editor, whether or not an annotator is registered — one
 * switched on later has to reach tabs already open. */
export function pluginLineAnnotation(path: string): Extension {
  return [annotationState, words, card, theme, asker(path)]
}
