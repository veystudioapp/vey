import { codeFileOf } from "../src/renderer/lib/markdown/file-links"
import { check, finish, section } from "./harness"

/**
 * A code span in a chat reply that names a file: only the whole span counts,
 * and the line and column come from the same suffixes the terminal reads.
 */

section("a span that is one path")
{
  const named = codeFileOf("src/main/ipc.ts:227")
  check(
    "reads path and line",
    named?.path === "src/main/ipc.ts" && named.line === 227,
    named
  )
  check(
    "reads a column",
    codeFileOf("app.ts:42:7")?.column === 7,
    codeFileOf("app.ts:42:7")
  )
  check("a bare file name", codeFileOf("ipc.ts")?.path === "ipc.ts")
}

section("a span that is more than a path is code")
{
  check("a call", codeFileOf("open(file)") === null)
  check("a sentence", codeFileOf("see ipc.ts") === null)
  check("a version number", codeFileOf("1.2.3") === null)
  check("an identifier", codeFileOf("useState") === null)
  check("a trailing stop", codeFileOf("ipc.ts.") === null)
}

finish()
