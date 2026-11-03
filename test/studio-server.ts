import { normalizeServerUrl } from "../src/shared/studio-server"
import { check, finish, section } from "./harness"

/**
 * Where the signed-in user's token may be sent: `https`, or `http` to this
 * machine alone — the address check is what keeps it off plain `http` to
 * another machine.
 */

section("normalizeServerUrl")
check(
  "https, trailing slash dropped",
  normalizeServerUrl(" https://ai.example.com/ ") === "https://ai.example.com"
)
check(
  "a path is kept",
  normalizeServerUrl("https://example.com/studio/") ===
    "https://example.com/studio"
)
check(
  "http to this machine",
  normalizeServerUrl("http://localhost:3000") === "http://localhost:3000"
)
check(
  "http to another machine is refused",
  normalizeServerUrl("http://ai.example.com") === null
)
check(
  "credentials, a query or a hash are refused",
  normalizeServerUrl("https://u:p@example.com") === null &&
    normalizeServerUrl("https://example.com/?x=1") === null &&
    normalizeServerUrl("https://example.com/#x") === null
)
check("not a URL at all", normalizeServerUrl("ai.example.com") === null)
check("empty is none", normalizeServerUrl("") === null)

finish()
