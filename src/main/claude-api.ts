/**
 * A **custom API** profile: a `claude` pointed at an Anthropic-compatible
 * endpoint other than Anthropic's own sign-in — a GLM, Kimi or DeepSeek
 * coding plan, OpenRouter, a company's gateway.
 *
 * Nothing is logged in. The profile is its `CLAUDE_CONFIG_DIR` like any other
 * — its own history and settings — plus the variables the CLI already reads
 * for this: `ANTHROPIC_BASE_URL`, the key as `ANTHROPIC_AUTH_TOKEN` (a
 * `Bearer` header, which is what these endpoints document), and the model
 * names the CLI's aliases resolve to, since `sonnet` means nothing to a
 * server that serves `glm-4.6`.
 *
 * **The key is never in the profile list.** The list is the renderer's and is
 * written whole to `claude-profiles.json`; the key is sealed by the OS
 * keychain (`Host.seal`) and kept in the settings under `apiTokenKey(id)`,
 * read only here. A profile reaches a turn through `accountEnv`, which asks
 * `apiEnvFor` with nothing but the directory — the one thing every caller
 * (a chat's session, a rewind, the commit draft, the model list, the usage
 * meter) already has — so the endpoints are held here, by directory, and
 * re-read by `ipc.ts` whenever the list is.
 *
 * Free of `electron`: `apiEnv` is what `test/claude-api.ts` checks.
 */

import type { ClaudeApiEndpoint } from "../shared/api"

/** The settings key a profile's sealed key is kept under. */
export function apiTokenKey(profileId: string): string {
  return `claudeApi.token.${profileId}`
}

/**
 * The environment a custom endpoint is reached with.
 *
 * `ANTHROPIC_API_KEY` is set **empty**, not left out: a login shell that
 * exports one (`mergeShellEnv` hands a `claude` the whole of it) would
 * otherwise send it beside the token, to a server that is not Anthropic's.
 * A model left blank is left to the endpoint, several of which map Claude's
 * names themselves; the fast model falls back to the main one, because the
 * CLI's background calls go to `haiku` and a server with one model has no
 * `haiku` to answer them on.
 */
export function apiEnv(
  endpoint: ClaudeApiEndpoint,
  token: string
): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: endpoint.baseUrl.trim().replace(/\/+$/, ""),
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: "",
  }
  const model = endpoint.model.trim()
  const fast = endpoint.fastModel.trim() || model
  if (model) {
    env.ANTHROPIC_MODEL = model
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = model
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = model
  }
  if (fast) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = fast
    env.ANTHROPIC_SMALL_FAST_MODEL = fast
  }
  return env
}

/** Whether `url` can be an endpoint: http(s), with a host. Plain `http` only
 * for this machine — a key sent in the clear to anywhere else is a key given
 * away. */
export function validBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol === "https:") return parsed.hostname !== ""
    return (
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}

/** By `CLAUDE_CONFIG_DIR`, `~` expanded — see the module comment. */
let byDir = new Map<string, Record<string, string>>()

/** Replaces every endpoint at once, from the list as it now stands. */
export function setApiEnvs(next: Map<string, Record<string, string>>): void {
  byDir = next
}

/** The endpoint's environment for a profile's directory, or none for a
 * profile that signs in the ordinary way. */
export function apiEnvFor(configDir: string | null): Record<string, string> {
  return (configDir && byDir.get(configDir)) || {}
}

/** Whether a directory is a custom endpoint's — which has no login to check
 * and no plan to read. */
export function isApiDir(configDir: string | null): boolean {
  return configDir !== null && byDir.has(configDir)
}
