import { getChunks, getOriginalDoc } from "@codemirror/merge"
import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  gutter,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  type BlockInfo,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"
import { t } from "../i18n"

import {
  DIFF_REVEAL_STEP,
  NOTHING_REVEALED,
  oneClickLeft,
  remaining,
  revealed,
  type Fold,
  type Reveal,
  type RevealDir,
} from "./diff-folds"

/**
 * The unified diff, drawn the way a pull request is.
 *
 * `@codemirror/merge` gives the diff itself — the chunks, the collapsed
 * unchanged regions, the removed lines as widgets between the kept ones — and
 * draws it as one editor with a thin coloured gutter. What a reader recognises
 * as a diff is more specific: **an old line number, a new line number, a `+`/`-`
 * column, the row tinted from the sign across, and a `@@` bar where the file was
 * skipped.** That is what this file adds, on top of the merge extension rather
 * than in place of it.
 *
 * The colours and the metrics are Primer's, because half of reading a diff is
 * knowing at a glance which side you are on, and that association is already
 * built for anyone who reviews code.
 *
 * Two things about the *structure* are worth knowing before changing any of it,
 * because both were got wrong first:
 *
 * - **A removed line is not a line of this document.** The merge extension
 *   renders a whole removed chunk as one block widget inside `.cm-content`, and
 *   builds its inner rows itself. Drawing that row's own number with a
 *   `::before` on it does not work: the content column already starts *after*
 *   the gutters, so the number lands a gutter's width too far right (and pulling
 *   it back with a negative margin puts it under the sticky gutters, where it is
 *   invisible). The numbers come from `widgetMarker` instead — a gutter is asked
 *   what to draw beside a widget, and a marker holding one row per removed line
 *   at the same line height lines up because the widget's height *is* those rows.
 * - **The row tint cannot come from the merge extension's gutter classes.** Its
 *   `cm-changedLineGutter` only exists when its own `gutter` option is on, and it
 *   is off here — the `+`/`-` column says the same thing in the form a diff is
 *   read in. So the tint travels on `GutterMarker.elementClass`, which is the
 *   API for exactly this.
 */

/** How many unchanged lines of context a hunk keeps around its changes, and the
 * shortest run worth folding. Both are `@codemirror/merge`'s own defaults, kept
 * so a diff reads as it did before the folds were owned here; `foldsOf` and the
 * `@@` header both read them, so the header describes the bounds that are drawn. */
export const DIFF_CONTEXT = 3
export const DIFF_MIN_COLLAPSE = 4

/**
 * The height of one row of the diff, as a CSS length.
 *
 * Pinned rather than left to the font, and stated here rather than written into
 * the theme, because three different pieces of code lay out rows that have to
 * line up: the editor's own lines, the merge extension's removed rows inside a
 * block widget, and the gutter columns beside them. In `rem` like the diff's
 * 0.75rem text, so Settings › Appearance's size scales the rows with it — 20px
 * at the default root.
 */
export const DIFF_ROW_HEIGHT = "1.25rem"

/** One hunk, in the form a unified diff header states it. */
type Hunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

type DiffModel = {
  /** By new-document line number: the line's number in the commit, or null for
   * a line that was added. */
  oldOf: (number | null)[]
  /** Keyed by the position a removed chunk's widget sits at (`chunk.fromB`,
   * which is where the merge extension adds it). */
  removed: Map<number, { firstOld: number; lines: number }>
  /**
   * Every position the merge extension puts a deletion widget at — one per
   * chunk, `removed`'s keys plus the chunks that removed nothing.
   *
   * A chunk that is purely added still gets a widget (`buildDeletedChunks`
   * adds one unconditionally, and `chunk.fromA >= chunk.toA` returns an empty
   * node from it), so the map above is not the list of this module's own
   * widgets — which is what `isHunkBar` eliminates against.
   */
  widgets: Set<number>
  hunks: Hunk[]
  /** The unchanged runs the view may fold, in the new document's lines. */
  folds: Fold[]
}

/**
 * The model, computed once per state.
 *
 * A `WeakMap` on the state rather than a `StateField`, deliberately: this is
 * derived data with no transactions of its own, three gutters and a view plugin
 * all want it inside one measure pass, and a field would have to be added to
 * every configuration that wants a number column. The entry dies with the state.
 */
const models = new WeakMap<EditorState, DiffModel>()

function modelOf(state: EditorState): DiffModel {
  const held = models.get(state)
  if (held) return held

  const built = buildModel(state)
  models.set(state, built)
  return built
}

function buildModel(state: EditorState): DiffModel {
  const chunks = getChunks(state)?.chunks ?? []
  const a = getOriginalDoc(state)
  const b = state.doc

  const oldOf: (number | null)[] = new Array<number | null>(b.lines + 1).fill(
    null
  )
  const removed = new Map<number, { firstOld: number; lines: number }>()
  const widgets = new Set<number>()

  /** Each chunk as line spans in both documents, which is what both the number
   * map and the hunk headers are built from. */
  const spans: {
    fromB: number
    oldLine: number
    newLine: number
    oldLines: number
    newLines: number
  }[] = []

  let oldLine = 1
  let newLine = 1

  for (const chunk of chunks) {
    const startsAt = b.lineAt(Math.min(chunk.fromB, b.length)).number

    // Unchanged lines before this chunk are the same line in both documents.
    while (newLine < startsAt && newLine <= b.lines) {
      oldOf[newLine] = oldLine
      oldLine += 1
      newLine += 1
    }

    const oldLines =
      chunk.toA > chunk.fromA
        ? a.lineAt(chunk.endA).number - a.lineAt(chunk.fromA).number + 1
        : 0
    const newLines =
      chunk.toB > chunk.fromB ? b.lineAt(chunk.endB).number - startsAt + 1 : 0

    widgets.add(chunk.fromB)
    if (oldLines > 0) {
      removed.set(chunk.fromB, { firstOld: oldLine, lines: oldLines })
    }

    spans.push({
      fromB: chunk.fromB,
      oldLine,
      newLine,
      oldLines,
      newLines,
    })

    // An added line keeps `null`: it has no line in the commit, which is what
    // the blank in the old column says.
    newLine += newLines
    oldLine += oldLines
  }

  while (newLine <= b.lines) {
    oldOf[newLine] = oldLine
    oldLine += 1
    newLine += 1
  }

  return {
    oldOf,
    removed,
    widgets,
    hunks: buildHunks(spans, b.lines),
    folds: foldsOf(state),
  }
}

/**
 * The chunks, grouped into hunks the way a unified diff states them.
 *
 * Two changes closer together than twice the context are one hunk, because
 * their context overlaps and a header between them would describe a region that
 * was never skipped. The counts include the context on both sides, which is what
 * makes `@@ -49,6 +49,9 @@` add up.
 */
function buildHunks(
  spans: {
    fromB: number
    oldLine: number
    newLine: number
    oldLines: number
    newLines: number
  }[],
  totalNewLines: number
): Hunk[] {
  const hunks: Hunk[] = []

  for (let i = 0; i < spans.length;) {
    let last = i
    while (
      last + 1 < spans.length &&
      spans[last + 1]!.newLine -
        (spans[last]!.newLine + spans[last]!.newLines) <=
        DIFF_CONTEXT * 2
    ) {
      last += 1
    }

    const first = spans[i]!
    const final = spans[last]!

    const newStart = Math.max(1, first.newLine - DIFF_CONTEXT)
    const newEnd = Math.min(
      totalNewLines,
      final.newLine + Math.max(final.newLines, 1) - 1 + DIFF_CONTEXT
    )
    // The old side starts as far back as the new side does — they are the same
    // context lines — so the leading context is what maps one to the other.
    const oldStart = Math.max(1, first.oldLine - (first.newLine - newStart))

    let addedLines = 0
    let removedLines = 0
    for (let s = i; s <= last; s += 1) {
      addedLines += spans[s]!.newLines
      removedLines += spans[s]!.oldLines
    }

    const newCount = newEnd - newStart + 1
    hunks.push({
      oldStart,
      oldCount: newCount - addedLines + removedLines,
      newStart,
      newCount,
    })

    i = last + 1
  }

  return hunks
}

/** `@@ -49,6 +49,9 @@`, as git writes it. A count of one is stated without
 * it, which is the form every diff tool emits and reads. */
function hunkHeader(hunk: Hunk): string {
  const old = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}` // prettier-ignore
  const now = hunk.newCount === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newCount}` // prettier-ignore
  return `@@ -${old} +${now} @@`
}

/** A cell in one of the three columns. `elementClass` is what tints the cell
 * with the row, since the gutter element itself is not something a marker's own
 * DOM can reach. */
class Cell extends GutterMarker {
  constructor(
    readonly label: string,
    readonly inner: string,
    override readonly elementClass = ""
  ) {
    super()
  }

  override eq(other: Cell) {
    return (
      other.label === this.label &&
      other.inner === this.inner &&
      other.elementClass === this.elementClass
    )
  }

  override toDOM() {
    const span = document.createElement("span")
    span.className = this.inner
    span.textContent = this.label
    return span
  }
}

/**
 * The column beside a removed chunk: one row per removed line.
 *
 * A widget takes one gutter slot however many rows it draws, so the slot is
 * filled with that many rows at the same line height. Which is why the line
 * height is pinned in the theme below rather than left to the font: these rows
 * and the widget's own are laid out by two different pieces of code and only
 * line up if they agree on it.
 */
class RemovedColumn extends GutterMarker {
  constructor(
    readonly labels: (number | string)[],
    readonly inner: string,
    override readonly elementClass = ""
  ) {
    super()
  }

  override eq(other: RemovedColumn) {
    return (
      other.inner === this.inner &&
      other.elementClass === this.elementClass &&
      other.labels.length === this.labels.length &&
      other.labels.every((label, at) => label === this.labels[at])
    )
  }

  override toDOM() {
    const wrap = document.createElement("span")
    wrap.className = "cm-diffRemovedCol"
    for (const label of this.labels) {
      const row = wrap.appendChild(document.createElement("span"))
      row.className = this.inner
      row.textContent = String(label)
    }
    return wrap
  }
}

const NUM = "cm-diffNum"
const SIGN = "cm-diffSign"

const addedSign = new Cell("+", `${SIGN} cm-diffSign-added`, "cm-diffCell-added") // prettier-ignore
const plainSign = new Cell("", SIGN)
const blankNum = new Cell("", NUM)
const addedNum = new Cell("", NUM, "cm-diffCell-addedNum")

function num(value: number | null, tint: boolean) {
  if (value === null) return tint ? addedNum : blankNum
  return new Cell(String(value), NUM, tint ? "cm-diffCell-addedNum" : "")
}

/** What a removed chunk gets in each of the three columns. `null` for a widget
 * that is not one — this app's own `@@` bars come down the same callback. */
function removedColumns(model: DiffModel, block: BlockInfo) {
  return model.removed.get(block.from) ?? null
}

function rangeOf(first: number, count: number) {
  return Array.from({ length: count }, (_, at) => first + at)
}

/**
 * One arrow of the expander, drawn rather than taken from `lucide-react`, which
 * is the app's icon set everywhere else: a `GutterMarker` returns a DOM node and
 * this file is not a component, so a React icon would mean rendering one per
 * gutter cell.
 *
 * GitHub's own three for this control — octicons' `fold-up`, `fold-down` and
 * `unfold`: a chevron and the bar it opens from, stroked, on one centre line.
 * They were filled triangles before, which sat at two heights beside each
 * other and read as a pair of play buttons; and stroked chevrons alone before
 * that, which at 12px resolved into a diamond. The bar is what says "lines
 * hidden here". `fromAbove` points into the run from the hunk above,
 * `fromBelow` out of it to the hunk below, and `all` is both.
 */
function arrowIcon(dir: RevealDir): SVGElement {
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("width", "16")
  svg.setAttribute("height", "16")
  svg.setAttribute("aria-hidden", "true")

  const path = document.createElementNS(ns, "path")
  const shape =
    dir === "fromAbove"
      ? "M3 4h10M4.75 11.25 8 8l3.25 3.25"
      : dir === "fromBelow"
        ? "M3 12h10M4.75 4.75 8 8l3.25-3.25"
        : "M3 8h10M5.25 4.5 8 1.75l2.75 2.75M5.25 11.5 8 14.25l2.75-2.75"
  path.setAttribute("d", shape)
  path.setAttribute("fill", "none")
  path.setAttribute("stroke", "currentColor")
  path.setAttribute("stroke-width", "1.5")
  path.setAttribute("stroke-linecap", "round")
  path.setAttribute("stroke-linejoin", "round")

  svg.append(path)
  return svg
}

/** One control in the expander: its own element, so a click can say which
 * direction it asked for and the title says what that will show. */
function unfoldControl(dir: RevealDir): HTMLElement {
  const control = document.createElement("span")
  control.className = "cm-diffUnfoldBtn"
  control.dataset.reveal = dir
  control.setAttribute("role", "button")
  control.title =
    dir === "fromAbove"
      ? t("files.diff.showMoreBelow", { count: DIFF_REVEAL_STEP })
      : dir === "fromBelow"
        ? t("files.diff.showMoreAbove", { count: DIFF_REVEAL_STEP })
        : t("files.diff.showAll")
  control.append(arrowIcon(dir))
  return control
}

/** The expander cell: two arrows for a run a step cannot finish, one control for
 * a run it can. The cell is one gutter element either way, so a click is read
 * against the arrow it landed on rather than against the cell. */
class UnfoldCell extends GutterMarker {
  override elementClass = "cm-diffCell-hunk cm-diffCell-unfold"

  constructor(readonly both: boolean) {
    super()
  }

  override eq(other: GutterMarker) {
    return other instanceof UnfoldCell && other.both === this.both
  }

  override toDOM() {
    const wrap = document.createElement("span")
    wrap.className = "cm-diffUnfold"
    if (this.both) {
      wrap.append(unfoldControl("fromAbove"), unfoldControl("fromBelow"))
    } else {
      wrap.append(unfoldControl("all"))
    }
    return wrap
  }
}

const unfoldBoth = new UnfoldCell(true)
const unfoldAll = new UnfoldCell(false)

/** The expander for the bar at `pos`: two arrows while a step leaves something
 * folded after it, one control once a step can open all of it. */
function unfoldCellAt(state: EditorState, pos: number): GutterMarker {
  const fold = foldAt(state, pos)
  if (!fold) return unfoldBoth
  return oneClickLeft(fold, revealOf(state, fold)) ? unfoldAll : unfoldBoth
}

const hunkBlank = new Cell("", NUM, "cm-diffCell-hunk")
const hunkBlankSign = new Cell("", SIGN, "cm-diffCell-hunk")

/**
 * Whether a block widget is one of the collapsed-region bars.
 *
 * By elimination rather than by asking the widget: `WidgetType` exposes no
 * public tag, and reading a minified class name would be a guess that survives
 * until the next build. This configuration has exactly two kinds of block
 * widget — a chunk's own, whose position the model knows, and a collapsed
 * region — so not being the first is being the second.
 *
 * Eliminated against `widgets` rather than `removed`, which is the fix for a
 * `⇕` drawn beside an added line: the merge extension puts a deletion widget at
 * every chunk, and a chunk that removed nothing gets an **empty** one. Those are
 * not in `removed`, so each was read as a collapsed bar — a zero-height row
 * carrying the bar's borders across the three columns and an expander tall
 * enough to overflow onto the line below it, which would have tried to
 * uncollapse a region that is not there.
 */
function isHunkBar(model: DiffModel, block: BlockInfo): boolean {
  return !model.widgets.has(block.from)
}

/**
 * The three columns down the left: old number, new number, `+`/`-`.
 *
 * Three gutters rather than one with three spans, because that is what lets the
 * sign column be tinted with the row while the two number columns are not —
 * which is how GitHub draws it, and is a distinction a single gutter with one
 * background cannot make.
 */
export function githubDiffGutters(): Extension {
  return [
    gutter({
      class: "cm-diffGutter cm-diffOld",
      lineMarker: (view, line) => {
        const model = modelOf(view.state)
        return num(
          model.oldOf[view.state.doc.lineAt(line.from).number] ?? null,
          false
        )
      },
      widgetMarker: (view, _widget, block) => {
        const model = modelOf(view.state)
        if (isHunkBar(model, block)) return unfoldCellAt(view.state, block.from)

        const removed = removedColumns(model, block)
        if (!removed) return null
        return new RemovedColumn(
          rangeOf(removed.firstOld, removed.lines),
          NUM,
          "cm-diffCell-removedNum"
        )
      },
      // The expander is a control, and this is what makes it one: the bar's own
      // click handler lives on the widget in the content column, which the icon
      // is not in. The click is read against the icon it landed on — the cell is
      // one element, and the two arrows are inside it. A click on the cell that
      // is not on an arrow opens the whole run, as the bar does.
      domEventHandlers: {
        click(view, block, event) {
          if (!isHunkBar(modelOf(view.state), block)) return false
          const fold = foldAt(view.state, block.from)
          if (!fold) return false
          const target = event.target instanceof Element ? event.target : null
          const dir = target?.closest<HTMLElement>("[data-reveal]")?.dataset
            .reveal as RevealDir | undefined
          view.dispatch({
            effects: revealFold.of({ fold: fold.from, dir: dir ?? "all" }),
          })
          return true
        },
      },
      lineMarkerChange: (update) => update.docChanged || update.viewportChanged,
      initialSpacer: () => new Cell("9999", NUM),
    }),
    gutter({
      class: "cm-diffGutter cm-diffNew",
      lineMarker: (view, line) =>
        new Cell(String(view.state.doc.lineAt(line.from).number), NUM),
      widgetMarker: (view, _widget, block) => {
        const model = modelOf(view.state)
        if (isHunkBar(model, block)) return hunkBlank

        const removed = removedColumns(model, block)
        if (!removed) return null
        // Blank, and deliberately still drawn: a removed line has no line in the
        // new file, and an empty column of the right width is what says so.
        return new RemovedColumn(
          new Array<string>(removed.lines).fill(""),
          NUM,
          "cm-diffCell-removedNum"
        )
      },
      lineMarkerChange: (update) => update.docChanged || update.viewportChanged,
      initialSpacer: () => new Cell("9999", NUM),
    }),
    gutter({
      class: "cm-diffGutter cm-diffSigns",
      lineMarker: (view, line) => {
        const model = modelOf(view.state)
        const number = view.state.doc.lineAt(line.from).number
        return model.oldOf[number] === null ? addedSign : plainSign
      },
      widgetMarker: (view, _widget, block) => {
        const model = modelOf(view.state)
        if (isHunkBar(model, block)) return hunkBlankSign

        const removed = removedColumns(model, block)
        if (!removed) return null
        return new RemovedColumn(
          new Array<string>(removed.lines).fill("−"),
          `${SIGN} cm-diffSign-removed`,
          "cm-diffCell-removed"
        )
      },
      lineMarkerChange: (update) => update.docChanged || update.viewportChanged,
      initialSpacer: () => plainSign,
    }),
    hunkHeaders,
    // The collapsed bar carries no words of its own: the `@@` header replaces
    // them (see `hunkHeaders`), and leaving the count in would be the same row
    // saying the same thing twice in two vocabularies.
    EditorState.phrases.of({ "$ unchanged lines": "" }),
  ]
}

/**
 * The unchanged runs to fold, worked out the way `@codemirror/merge`'s own
 * `collapseUnchanged` works them out — the same margin either side of each
 * change and the same shortest run — so the `@@` headers and the folds agree.
 */
function foldsOf(state: EditorState): Fold[] {
  const chunks = getChunks(state)?.chunks ?? []
  const doc = state.doc
  const runs: Fold[] = []

  let prevLine = 1
  for (let i = 0; ; i++) {
    const chunk = i < chunks.length ? chunks[i] : null
    const from = i ? prevLine + DIFF_CONTEXT : 1
    const to = chunk
      ? doc.lineAt(chunk.fromB).number - 1 - DIFF_CONTEXT
      : doc.lines
    if (to - from + 1 >= DIFF_MIN_COLLAPSE) runs.push({ from, to })
    if (!chunk) break
    prevLine = doc.lineAt(Math.min(doc.length, chunk.toB)).number
  }
  return runs
}

/** The fold a bar at `pos` stands for. A bar starts where the lines still
 * folded start, which is inside the fold it came from. */
function foldAt(state: EditorState, pos: number): Fold | null {
  const line = state.doc.lineAt(pos).number
  return (
    modelOf(state).folds.find((fold) => fold.from <= line && line <= fold.to) ??
    null
  )
}

function revealOf(state: EditorState, fold: Fold): Reveal {
  return state.field(folds).reveals.get(fold.from) ?? NOTHING_REVEALED
}

/** Asks for one click on a fold: the fold by its first line, and the direction. */
const revealFold = StateEffect.define<{ fold: number; dir: RevealDir }>()

/**
 * The collapsed bar: what stands in for the lines a fold still hides.
 *
 * Its own widget, rather than `@codemirror/merge`'s, because that one's click
 * opens the whole run and the arrows need to open a step. Clicking the bar
 * itself still opens everything it hides, as it always has.
 */
class FoldBar extends WidgetType {
  constructor(
    readonly key: number,
    readonly lines: number
  ) {
    super()
  }

  override eq(other: FoldBar) {
    return other.key === this.key && other.lines === this.lines
  }

  override toDOM(view: EditorView) {
    const bar = document.createElement("div")
    bar.className = "cm-collapsedLines"
    bar.addEventListener("click", () => {
      view.dispatch({ effects: revealFold.of({ fold: this.key, dir: "all" }) })
    })
    return bar
  }

  override ignoreEvent(event: Event) {
    return event instanceof MouseEvent
  }

  override get estimatedHeight() {
    return 27
  }
}

/** The bars for what each fold still hides, given how far it has been shown. */
function foldDecorations(
  state: EditorState,
  reveals: Map<number, Reveal>
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const fold of modelOf(state).folds) {
    const left = remaining(fold, reveals.get(fold.from) ?? NOTHING_REVEALED)
    if (!left) continue
    builder.add(
      state.doc.line(left.from).from,
      state.doc.line(left.to).to,
      Decoration.replace({
        widget: new FoldBar(fold.from, left.to - left.from + 1),
        block: true,
      })
    )
  }
  return builder.finish()
}

/**
 * How far each fold has been shown, and the bars that are left of it.
 *
 * Owned here rather than by `@codemirror/merge`'s `collapseUnchanged`, because
 * that can only open a whole run — there is no way to ask it for a step. The
 * reveals reset when the document changes: a fold's lines are counted from where
 * it is, and an edit can move them.
 */
type Folds = { reveals: Map<number, Reveal>; decos: DecorationSet }

const folds = StateField.define<Folds>({
  create: () => ({ reveals: new Map(), decos: Decoration.none }),
  update(value, tr) {
    let reveals = value.reveals
    if (tr.docChanged) reveals = new Map()

    for (const effect of tr.effects) {
      if (!effect.is(revealFold)) continue
      const fold = modelOf(tr.state).folds.find(
        (at) => at.from === effect.value.fold
      )
      if (!fold) continue
      const next = revealed(
        fold,
        reveals.get(fold.from) ?? NOTHING_REVEALED,
        effect.value.dir
      )
      reveals = new Map(reveals).set(fold.from, next)
    }

    const chunksMoved = getChunks(tr.state) !== getChunks(tr.startState)
    if (reveals === value.reveals && !chunksMoved) return value
    return { reveals, decos: foldDecorations(tr.state, reveals) }
  },
  provide: (field) => EditorView.decorations.from(field, (at) => at.decos),
})

/**
 * The unchanged runs of a unified diff, folded and expandable a step at a time.
 * Goes after `unifiedMergeView`, which is what supplies the chunks this reads.
 */
export function unifiedFolds(): Extension {
  return folds.init((state) => ({
    reveals: new Map(),
    decos: foldDecorations(state, new Map()),
  }))
}

/**
 * `@@ -49,6 +49,9 @@` on each collapsed bar.
 *
 * The bar is `FoldBar`, and the header is written onto it as an attribute, which
 * the theme draws with `content: attr(...)`.
 *
 * This is the one cosmetic thing here that reaches into the DOM, and it is
 * written to fail quietly: a bar this cannot place keeps no attribute, which
 * draws the expander with no header rather than a wrong one.
 *
 * A collapsed region always ends where the next hunk begins, so the header is
 * the first hunk starting at or after the bar — which is also why `foldsOf` has
 * to leave the same margin `DIFF_CONTEXT` names.
 */
const hunkHeaders = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.stamp(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged ||
        // A reveal replaces the bar with a new one: a new element, which has no
        // header until it is stamped.
        update.heightChanged
      ) {
        this.stamp(update.view)
      }
    }

    stamp(view: EditorView) {
      const { hunks } = modelOf(view.state)
      if (hunks.length === 0) return

      for (const bar of view.dom.querySelectorAll<HTMLElement>(
        ".cm-collapsedLines"
      )) {
        let pos: number
        try {
          pos = view.posAtDOM(bar)
        } catch {
          continue
        }

        const line = view.state.doc.lineAt(
          Math.min(pos, view.state.doc.length)
        ).number
        const next = hunks.find((hunk) => hunk.newStart >= line)
        if (next) bar.dataset.hunk = hunkHeader(next)
      }
    }
  }
)

/*
 * Primer's diff palette and metrics.
 *
 * Light is Primer's own hex; dark is `rgba` over whatever the pane's ground is,
 * which is how Primer specifies it and is what keeps the tint honest over this
 * app's `#1b1c1f` rather than over GitHub's `#0d1117`.
 *
 * **The two number columns are not tinted and the sign column is**, which is
 * GitHub's own reading of where the row starts: the numbers are a margin, and
 * the row is the change.
 */
export function githubDiffTheme(isDark: boolean): Extension {
  /*
   * Opaque, both themes, and that is the point rather than a style preference.
   *
   * These were `rgba` tints in dark mode — Primer's own way of specifying them —
   * and the row came out two shades: the `+`/`-` column is painted by a gutter
   * marker and the code by a line decoration, so an alpha tint composites over
   * whatever each of those happens to sit on. Flattened against the studio's
   * dark ground — `--background`, `#1b1c1f` (`styles/globals.css`) — so the two
   * halves of a row are the same colour because they are literally the same
   * colour. That also means these two follow the ground: they were flattened
   * against `#1e1e1e` and had to be recomputed when it moved.
   */
  const line = isDark
    ? { add: "#1e3024", del: "#312123" }
    : { add: "#e6ffec", del: "#ffebe9" }
  const sign = isDark
    ? { add: "#3fb950", del: "#f85149" }
    : { add: "#1a7f37", del: "#cf222e" }
  const hunk = isDark
    ? {
        bg: "#212934",
        edge: "#253956",
        fg: "#8b949e",
        iconHover: "#79c0ff",
      }
    : {
        bg: "#f6f8fa",
        edge: "#d1d9e0",
        fg: "#59636e",
        iconHover: "#0550ae",
      }

  return EditorView.theme(
    {
      // A diff's own metrics, not the editor's. Pinned rather than inherited
      // because the removed rows and the gutter column beside them are laid out
      // by two different pieces of code and line up only if both use this.
      ".cm-scroller": { fontSize: "0.75rem", lineHeight: DIFF_ROW_HEIGHT },
      ".cm-content, .cm-line": {
        fontSize: "0.75rem",
        lineHeight: DIFF_ROW_HEIGHT,
      },
      ".cm-content": { padding: "0" },
      // The selection drawn **over** the code rather than under it. CodeMirror
      // puts its layer at `z-index: -1`, behind the lines, and hides the native
      // selection — so the opaque tint on an added row below covered it, and a
      // selection there was invisible. The removed rows never had the problem:
      // they are a widget, selected natively. The gutters sit at 200 and stay
      // above.
      ".cm-selectionLayer": { zIndex: "100 !important", pointerEvents: "none" },
      // And translucent, with `!important`, because over the text an opaque
      // one hides it: `editorTheme`'s colour loses on specificity to the base
      // theme's focused `#233` (`&dark.cm-focused > .cm-scroller > …`), which
      // was harmless only while the layer was underneath.
      ".cm-selectionLayer .cm-selectionBackground": {
        backgroundColor:
          "color-mix(in oklch, var(--primary) 28%, transparent) !important",
      },
      // The browser's own selection, which the editor hides on its lines and
      // this diff shows again for as long as a removed run holds focus — the
      // one time it is the selection somebody is making (`diff-selection.ts`).
      // In the editor's colour, so the two selections read as one; and no
      // ring on the run, which is focused as a side effect and not a control.
      // The run's own rows are the second selector, at the same weight: the
      // editor's base theme paints `.cm-content :focus ::selection` in the
      // system `Highlight`, and the run *is* the focused element, so a lighter
      // selector lost to it and the red rows selected in a different blue.
      "&.cm-editor .cm-content:has(.cm-deletedChunk:focus) .cm-line ::selection, &.cm-editor .cm-content .cm-deletedChunk:focus ::selection":
        {
          backgroundColor:
            "color-mix(in oklch, var(--primary) 28%, transparent) !important",
        },
      ".cm-deletedChunk:focus": { outline: "none" },
      // A removed row the selection has taken in — see `diff-selection.ts`.
      // Layered over the
      // row's red rather than replacing it, so it still reads as removed.
      ".cm-deletedLine.cm-deletedLine-selected": {
        backgroundImage:
          "linear-gradient(color-mix(in oklch, var(--primary) 28%, transparent), color-mix(in oklch, var(--primary) 28%, transparent))",
      },

      ".cm-diffGutter": {
        backgroundColor: "transparent",
        border: "none",
        padding: "0",
        minWidth: "0",
        color: hunk.fg,
      },
      ".cm-diffGutter .cm-gutterElement": { padding: "0 10px" },
      ".cm-diffSigns": { borderLeft: "1px solid var(--border)" },
      ".cm-diffSigns .cm-gutterElement": { padding: "0 4px 0 6px" },
      // Stated rather than inherited. `lib/editor.ts` sets the studio's editors
      // to 0.8125rem, and which of two themes wins is not the order they appear in
      // an extension array — so anything that has to match the code text says
      // its size here.
      ".cm-diffNum": {
        display: "block",
        textAlign: "right",
        fontSize: "0.75rem",
        lineHeight: DIFF_ROW_HEIGHT,
      },
      ".cm-diffSign": {
        display: "block",
        width: "1ch",
        textAlign: "center",
        fontSize: "0.75rem",
        lineHeight: DIFF_ROW_HEIGHT,
      },
      ".cm-diffSign-added": { color: sign.add },
      ".cm-diffSign-removed": { color: sign.del },
      /*
       * The columns beside a removed chunk, pinned to the slot rather than left
       * to flow inside it.
       *
       * A removed chunk is **one** gutter element however many rows it draws, so
       * this column has to line up with rows another piece of code laid out. It
       * was `display: block` and nothing else, which left two things to chance:
       * where the column sits inside a slot taller than its content, and how tall
       * each row is. Both were usually right and visibly wrong when they were not
       * — the `−` signs drawn a whole row below the lines they belong to, with the
       * numbers beside them correct, since a number cell and a sign cell resolve
       * their line boxes differently.
       *
       * `alignSelf: stretch` makes the column start at the top of the slot rather
       * than wherever the gutter's own alignment puts it, and an explicit `height`
       * per row stops a row's height depending on the glyph in it. That is what
       * `.cm-reviewRemovedCol` has always done, which is why the review column's
       * marks lined up beside signs that did not — the same slot, one column with
       * its geometry stated and one without.
       */
      ".cm-diffRemovedCol": {
        display: "block",
        alignSelf: "stretch",
        width: "100%",
      },
      ".cm-diffRemovedCol > *": {
        display: "block",
        height: DIFF_ROW_HEIGHT,
        lineHeight: DIFF_ROW_HEIGHT,
      },

      // An added line, tinted from the sign column across. No inner highlight:
      // the merge extension's word-level marks are off (`highlightChanges`), for
      // the reason a wholly new line has no "changed part" to pick out.
      /*
       * `!important` on the two row tints, for the same reason the collapsed bar
       * needs it: `@codemirror/merge`'s `baseTheme` paints `.cm-deletedChunk`
       * `rgba(160, 128, 100, .08)` — a brown — at the same specificity as a rule
       * here, so which of the two applies comes down to the order the style
       * modules were mounted in. It lost, and the result was a removed row whose
       * `-` column was red and whose code was brown.
       */
      ".cm-changedLine, .cm-inlineChangedLine": {
        backgroundColor: `${line.add} !important`,
      },
      ".cm-gutterElement.cm-diffCell-added": { backgroundColor: line.add },
      // The number columns stay on the pane's own ground: on GitHub the numbers
      // are a margin and the row starts at the sign.
      ".cm-gutterElement.cm-diffCell-addedNum, .cm-gutterElement.cm-diffCell-removedNum":
        { backgroundColor: "transparent" },

      // A removed chunk: the rows the merge extension draws, and the columns
      // beside them from `RemovedColumn`.
      ".cm-deletedChunk": {
        backgroundColor: `${line.del} !important`,
        padding: "0",
      },
      ".cm-deletedChunk .cm-deletedLine": {
        display: "block",
        lineHeight: DIFF_ROW_HEIGHT,
        padding: "0 2px 0 6px",
      },
      ".cm-deletedChunk .cm-deletedLine del": { textDecoration: "none" },
      ".cm-gutterElement.cm-diffCell-removed": { backgroundColor: line.del },
      ".cm-deletedLineGutter": { backgroundColor: "transparent" },

      /*
       * The hunk bar. Two pseudo-elements over an empty widget: the expander
       * where the gutters are, and the `@@` header where the code is — which is
       * the layout GitHub uses and the reason the bar is not simply centred
       * text.
       */
      /*
       * The collapsed bar.
       *
       * `background` rather than `backgroundColor`, and `!important`, because
       * `@codemirror/merge`'s own `baseTheme` paints it with a grey
       * `linear-gradient` under `&dark .cm-collapsedLines` — two classes on the
       * root plus one here, which a plain rule in a theme cannot out-specify. Its
       * shorthand also has to be beaten by a shorthand, or the gradient survives
       * underneath.
       */
      ".cm-collapsedLines": {
        background: `${hunk.bg} !important`,
        color: hunk.fg,
        borderTop: `1px solid ${hunk.edge}`,
        borderBottom: `1px solid ${hunk.edge}`,
        cursor: "pointer",
        lineHeight: DIFF_ROW_HEIGHT,
        padding: "0",
        fontSize: "0.75rem",
      },
      // And the `⦚` it puts on both sides of its own text. The `::after` is
      // already claimed below for the `@@` header; this is the other one, which
      // was drawing a stray dotted bar in front of it.
      ".cm-collapsedLines::before": { content: '""', margin: "0" },
      ".cm-collapsedLines::after": {
        content: "attr(data-hunk)",
        paddingLeft: "8px",
        fontFamily: "inherit",
        whiteSpace: "pre",
      },

      /*
       * The expander, in the gutter where it belongs.
       *
       * It was a `⌃⌄` in the bar's own `::before` for one revision, which put a
       * pair of text glyphs at the start of the code column — the wrong shape in
       * the wrong place. A block widget cannot reach back over the gutters (they
       * are sticky and paint above the content), so the icon is a gutter marker
       * of its own and the gutter carries the click. See `UnfoldCell`.
       */
      // The gutter cells carry the bar's own borders, so the row reads as one
      // strip across the pane rather than as a box floating in the code column.
      ".cm-gutterElement.cm-diffCell-hunk": {
        backgroundColor: hunk.bg,
        borderTop: `1px solid ${hunk.edge}`,
        borderBottom: `1px solid ${hunk.edge}`,
      },
      ".cm-gutterElement.cm-diffCell-unfold": {
        // Against the column's inner edge: the control reads as belonging to the
        // pair of number columns rather than to the first of them.
        padding: "0 2px 0 10px",
        textAlign: "right",
      },
      // The arrows in a row of their own, one control per direction. A control
      // is the size of its icon plus a row of hit area above and below, and it
      // gets a hover fill — the strip is tinted already, so the fill is what
      // says "this one" when the pointer is on it. It was a bare 12px glyph, which
      // read as decoration.
      ".cm-diffUnfold": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: DIFF_ROW_HEIGHT,
        verticalAlign: "middle",
      },
      ".cm-diffUnfoldBtn": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: DIFF_ROW_HEIGHT,
        borderRadius: "3px",
        // The strip's own grey until pointed at: in the link blue, two of them
        // on every hunk were the loudest thing in the diff.
        color: hunk.fg,
        cursor: "pointer",
      },
      ".cm-diffUnfoldBtn:hover": {
        color: hunk.iconHover,
        backgroundColor: hunk.edge,
      },
    },
    { dark: isDark }
  )
}
