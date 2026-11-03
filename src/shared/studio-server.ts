/**
 * The studio's own server (`vsclaude-cloud`), which the anonymous usage counts
 * go to (`main/telemetry.ts`). Vey Pro and its free models are deleted
 * (`docs/design.md` § Pro, removed); nothing a chat says goes through it.
 *
 * Pure and shared. `test/studio-server.ts`.
 */

/**
 * The server — empty until there is one, which sends nothing.
 * `VEYSTUDIO_AI_URL` in the environment main is started with overrides it,
 * for a server running on this machine.
 */
export const STUDIO_SERVER_URL = ""

/**
 * `input` as a base URL, or null for something that is not one: `https`,
 * or `http` to this machine alone, since the user's token goes there on every
 * request. A trailing slash is dropped.
 */
export function normalizeServerUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.username || url.password || url.search || url.hash) return null
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return null
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}
