// Draws the menu bar's icon, into resources/tray*.png (+ @2x).
//
// Generated rather than exported from a design tool, for the reason
// menu-icon.mjs is: an artefact only some machines can regenerate is one nobody
// regenerates. The mark is three strokes (resources/mark.svg), which is less to
// describe in code than it is to keep in a binary nobody can diff.
//
// Two kinds of image:
//
// - `tray.png` is a **template image** — black, the alpha channel the whole
//   drawing — so macOS tints it to the menu bar's own appearance. It is the
//   icon whenever nothing wants the user.
// - `tray-badge-{light,dark}.png` carry the **red dot**, and a template image
//   has no colour of its own to draw one with. So the mark is inked for each
//   menu bar, black on a light one and white on a dark one, and `tray.ts`
//   picks between them off `nativeTheme`. The dot sits in a gap cut out of the
//   mark, the way the dock's badge sits clear of the icon under it.
//
//   bun scripts/tray-icon.mjs [--preview]

import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"
import path from "node:path"
import console from "node:console"
import { Buffer } from "node:buffer"

import { encodePng } from "./png.mjs"

const root = path.join(import.meta.dirname, "..")

/** The canvas, in points. A status item gets the menu bar's height (~22pt)
 * and the system's own glyphs are ~16pt tall with air either side. */
const WIDTH = 22
const HEIGHT = 16

/** The mark's own box (mark.svg's `viewBox`) and its stroke. */
const VIEW = { x: 6, y: 21.5, width: 88, height: 57 }
const STROKE = 13
/** The mark's height on the canvas, in points: shorter than the 16pt box, or
 * it is the tallest thing in the strip. */
const MARK_HEIGHT = 10

const SCALE = MARK_HEIGHT / VIEW.height
/** Two points in from the left, leaving the right-hand air to the badge. */
const LEFT = 2
const TOP = (HEIGHT - MARK_HEIGHT) / 2

/** The mark's three paths, in its own units — copied from mark.svg. */
const PATHS = [
  [
    [6, 72],
    [34, 72],
    [62, 28],
    [94, 28],
  ],
  [
    [6, 28],
    [22, 28],
  ],
  [
    [78, 72],
    [94, 72],
  ],
]

/** The badge, in canvas points: over the mark's top-right end, inside the
 * canvas, with a ring of nothing around it. */
const DOT = { x: 19.2, y: 3.3, radius: 2.5, gap: 1 }
const RED = [255, 59, 48]

const SAMPLES = 8

/**
 * A stroked polyline as a polygon: square ends cut at the points, mitred
 * joins — the way mark.svg's `stroke` draws it (SVG's default miter limit is
 * 4, and the step's ratio is ~1.14, so it is mitred there too).
 */
function strokeOf(points, width) {
  const half = width / 2
  const normals = []
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    const length = Math.hypot(bx - ax, by - ay)
    normals.push([-(by - ay) / length, (bx - ax) / length])
  }

  const side = (sign) => {
    const out = []
    for (let i = 0; i < points.length; i++) {
      const [px, py] = points[i]
      const before = normals[Math.max(0, i - 1)]
      const after = normals[Math.min(normals.length - 1, i)]
      // The miter: the sum of the two normals, stretched so that it lands
      // `half` away from both segments' offset lines.
      const mx = before[0] + after[0]
      const my = before[1] + after[1]
      const length = half / (mx * after[0] + my * after[1])
      out.push([px + sign * mx * length, py + sign * my * length])
    }
    return out
  }

  return [...side(1), ...side(-1).reverse()]
}

const POLYGONS = PATHS.map((points) => strokeOf(points, STROKE))

/** Even-odd point-in-polygon. */
function inPolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Whether a canvas point is on the mark. */
function onMark(x, y) {
  const mx = (x - LEFT) / SCALE + VIEW.x
  const my = (y - TOP) / SCALE + VIEW.y
  return POLYGONS.some((polygon) => inPolygon(mx, my, polygon))
}

/** The icon at `scale` pixels per point. `ink` is an RGB triple; `badge`
 * draws the dot and cuts its gap out of the mark. */
function draw(scale, { ink, badge }) {
  const width = WIDTH * scale
  const height = HEIGHT * scale
  const pixels = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let mark = 0
      let dot = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = (x + (sx + 0.5) / SAMPLES) / scale
          const py = (y + (sy + 0.5) / SAMPLES) / scale
          const fromDot = Math.hypot(px - DOT.x, py - DOT.y)
          if (badge && fromDot <= DOT.radius) dot += 1
          else if (badge && fromDot <= DOT.radius + DOT.gap) continue
          else if (onMark(px, py)) mark += 1
        }
      }
      const total = SAMPLES * SAMPLES
      const at = (y * width + x) * 4
      // A pixel is one or the other, never a blend: the gap keeps them apart.
      const [r, g, b] = dot > 0 ? RED : ink
      pixels[at] = r
      pixels[at + 1] = g
      pixels[at + 2] = b
      pixels[at + 3] = Math.round((255 * (dot > 0 ? dot : mark)) / total)
    }
  }
  return { width, height, pixels }
}

const { values } = parseArgs({
  options: { preview: { type: "boolean", default: false } },
})

const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]

const images = [
  ["tray", { ink: BLACK, badge: false }],
  ["tray-badge-light", { ink: BLACK, badge: true }],
  ["tray-badge-dark", { ink: WHITE, badge: true }],
]

for (const [name, look] of images) {
  const scales = [
    [`${name}.png`, 1],
    [`${name}@2x.png`, 2],
    // Not shipped — a size worth looking at when the numbers above change.
    ...(values.preview ? [[`${name}-preview.local.png`, 12]] : []),
  ]
  for (const [file, scale] of scales) {
    const target = path.join(root, "resources", file)
    writeFileSync(target, encodePng(draw(scale, look)))
    console.log(`wrote ${path.relative(root, target)} (×${scale})`)
  }
}
