/**
 * The studio's own server (`vsclaude-cloud`) in main: where it is. The one
 * thing still sent there is the anonymous usage counts (`telemetry.ts`) —
 * Vey Pro and its free models, the calls this module used to make, are
 * deleted (`docs/design.md` § Pro, removed).
 *
 * Free of `electron`.
 */

import { normalizeServerUrl, STUDIO_SERVER_URL } from "../shared/studio-server"

/** The server, or null for none configured — which sends nothing.
 * `VEYSTUDIO_BUILD_AI_URL` is no variable at runtime: esbuild replaces it with
 * the `VEYSTUDIO_AI_URL` the build saw (`scripts/build-electron.mjs`).
 * `VSCLAUDE_AI_URL` is that variable under the app's old name. The variable
 * names keep `AI` because they are already set on the machines and the CI
 * that build this app. */
export function serverUrl(): string | null {
  return normalizeServerUrl(
    process.env.VEYSTUDIO_AI_URL ||
      process.env.VSCLAUDE_AI_URL ||
      process.env.VEYSTUDIO_BUILD_AI_URL ||
      STUDIO_SERVER_URL
  )
}
