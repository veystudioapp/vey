import { Text } from "@codemirror/state"

import { answerOf, diagnosticsOf } from "../plugins/eslint/src/diagnostics"
import {
  diagnosticOf,
  offsetOf,
} from "../src/renderer/lib/plugins/lint-diagnostics"
import { PluginRegistry } from "../src/renderer/lib/plugins/registry"
import { check, finish, section } from "./harness"

/**
 * A plugin's squiggles: `app.editor.addLinter` in the registry, the
 * position-to-offset arithmetic the editor does, and the ESLint plugin's
 * reading of an answer. `test/eslint.ts` is the half that runs ESLint.
 */

const doc = Text.of(["const a = 1", "let bb = 2", ""])

section("offsetOf")

check(
  "line 1, column 1 is the start",
  offsetOf(doc, { line: 1, column: 1 }) === 0
)
check(
  "a column counts from 1",
  offsetOf(doc, { line: 2, column: 5 }) === 12 + 4
)
check(
  "a column past the line's end is held at it",
  offsetOf(doc, { line: 1, column: 99 }) === 11
)
check(
  "a line past the end is the end",
  offsetOf(doc, { line: 9, column: 1 }) === doc.length
)
check("line 0 is the start", offsetOf(doc, { line: 0, column: 0 }) === 0)

section("diagnosticOf")

const marked = diagnosticOf(
  {
    from: { line: 2, column: 5 },
    to: { line: 2, column: 7 },
    severity: "warning",
    message: "unused",
    source: "eslint(no-unused-vars)",
    fixes: [
      { name: "Fix", edits: [{ from: 12, to: 15, insert: "const" }] },
      { name: "Out of range", edits: [{ from: 0, to: 999, insert: "" }] },
    ],
  },
  doc
)
check(
  "the span is the run between the two positions",
  marked.from === 16 && marked.to === 18,
  marked
)
check(
  "a fix that reaches past the document is dropped, not offered",
  marked.actions?.length === 1 && marked.actions[0]!.name === "Fix",
  marked.actions?.map((action) => action.name)
)
const point = diagnosticOf(
  { from: { line: 1, column: 3 }, severity: "error", message: "parse" },
  doc
)
check(
  "no end is a point",
  point.from === 2 && point.to === 2 && point.actions === undefined
)
const backwards = diagnosticOf(
  {
    from: { line: 2, column: 5 },
    to: { line: 1, column: 1 },
    severity: "error",
    message: "x",
  },
  doc
)
check("an end before the start is the start", backwards.to === backwards.from)

section("the ESLint plugin's answer")

const diagnostics = diagnosticsOf([
  {
    line: 2,
    column: 5,
    endLine: 2,
    endColumn: 7,
    severity: 1,
    message: "'bb' is never reassigned.",
    ruleId: "prefer-const",
    fix: { range: [12, 22], text: "const bb = 2" },
    suggestions: [{ desc: "Remove it", fix: { range: [12, 23], text: "" } }],
  },
  { line: 1, column: 7, severity: 2, message: "Parse error", ruleId: null },
])
check(
  "a warning names its rule",
  diagnostics[0]?.severity === "warning" &&
    diagnostics[0].source === "eslint(prefer-const)",
  diagnostics[0]
)
check(
  "the autofix comes first, then the suggestions",
  JSON.stringify(diagnostics[0]?.fixes?.map((fix) => fix.name)) ===
    JSON.stringify(["Fix", "Remove it"])
)
check(
  "a parse error is an error with no end",
  diagnostics[1]?.severity === "error" &&
    diagnostics[1].to === undefined &&
    diagnostics[1].source === "eslint"
)
check("no answer keeps what is drawn", answerOf(null) === null)
check(
  "no ESLint for the file draws nothing",
  answerOf({ status: "unavailable" })?.length === 0
)
const failed = answerOf({ status: "failed", error: "Cannot find package" })
check(
  "an ESLint that could not run says so at the top of the file",
  failed?.length === 1 &&
    failed[0]!.from.line === 1 &&
    failed[0]!.message.includes("Cannot find package"),
  failed
)

section("addLinter")

const registry = new PluginRegistry()
const lint = async () => []
registry.addLinter("eslint", {
  id: "eslint",
  name: "ESLint",
  extensions: [".TS", "js"],
  lint,
})
check(
  "is recorded under the plugin, extensions normalised",
  JSON.stringify(
    registry.linterList().map((entry) => [entry.id, entry.extensions])
  ) === JSON.stringify([["eslint:eslint", ["ts", "js"]]]),
  registry.linterList()
)
let threw = false
try {
  registry.addLinter("eslint", {
    id: "x",
    name: "x",
    extensions: ["ts"],
    lint: undefined as never,
  })
} catch {
  threw = true
}
check("one with no `lint` is refused", threw)

await registry.unload("eslint")
check("goes when the plugin does", registry.linterList().length === 0)

finish()
