import { computed, onMounted, ref, toValue, type MaybeRefOrGetter } from "vue"

import { RELEASES_URL, REPO } from "./links.ts"

/*
 * The download buttons go straight to this machine's file rather than to the
 * releases page. The asset names carry the version (and have changed with the
 * product's name), so the file is looked up in the latest release rather than
 * spelled out here; until that answers, or if it never does, a button is the
 * releases page it always was.
 *
 * The guide and the install page name their builds outright (`useBuild`);
 * only the home page's buttons guess one from the browser (`useDownload`).
 */

const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`

export type Os = "macOS" | "Windows" | "Linux"

export const OSES: Os[] = ["macOS", "Windows", "Linux"]

/** An OS as the install page's address names its tab: `/install#windows`. */
export function hashOf(os: Os): string {
  return `#${os.toLowerCase()}`
}

/** The tab `location.hash` asks for, if it names one — in any case, since
 * a link typed by hand may say `#macOS`. */
export function osOfHash(hash: string): Os | null {
  return OSES.find((os) => hashOf(os) === hash.toLowerCase()) ?? null
}

type Asset = { name: string; browser_download_url: string }

function osOf(ua: string): Os | null {
  if (/Mac/.test(ua)) return "macOS"
  if (/Win/.test(ua)) return "Windows"
  if (/Linux/.test(ua) && !/Android/.test(ua)) return "Linux"
  return null
}

// Only Chromium says which CPU a Mac has; Safari and Firefox report "Intel" on
// Apple Silicon too, so the user agent is no evidence and arm64 — what every
// Mac sold since 2020 is — is the guess.
async function macArch(): Promise<"arm64" | "x64"> {
  const data = (
    navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues(
          hints: string[]
        ): Promise<{ architecture?: string }>
      }
    }
  ).userAgentData
  try {
    const { architecture } =
      (await data?.getHighEntropyValues(["architecture"])) ?? {}
    if (architecture === "x86") return "x64"
  } catch {
    // A refused hint is the same as no hint.
  }
  return "arm64"
}

/** One file of a release, as the guide's buttons name them. */
export type Build = "mac-arm64" | "mac-x64" | "windows" | "linux"

function find(build: Build, assets: Asset[]): Asset | undefined {
  const named = (end: string) => assets.find((a) => a.name.endsWith(end))
  if (build === "windows") return named(".exe")
  if (build === "linux") return named(".AppImage")
  return named(build === "mac-arm64" ? "-arm64.dmg" : "-x64.dmg")
}

async function buildOf(os: Os): Promise<Build> {
  if (os === "Windows") return "windows"
  if (os === "Linux") return "linux"
  return (await macArch()) === "x64" ? "mac-x64" : "mac-arm64"
}

type Release = { tag_name?: string; assets?: Asset[] }

// One request per page load however many buttons ask: the API allows an
// address sixty an hour.
let latest: Promise<Release> | undefined

function release(): Promise<Release> {
  latest ??= fetch(LATEST_API, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return latest
}

async function urlOf(build: Build): Promise<string | null> {
  const { assets = [] } = await release()
  return find(build, assets)?.browser_download_url ?? null
}

/** The latest release's version, `1.0.17`, once GitHub has answered. */
export function useVersion() {
  const version = ref<string | null>(null)
  onMounted(async () => {
    version.value = (await release()).tag_name?.replace(/^v/, "") ?? null
  })
  return version
}

/** The OS this page is being read on, once it is mounted. */
export function useOs() {
  const os = ref<Os | null>(null)
  onMounted(() => (os.value = osOf(navigator.userAgent)))
  return os
}

/** Where one build's button goes: the file itself once the release answers. */
export function useBuild(build: Build) {
  const href = ref(RELEASES_URL)
  onMounted(async () => {
    href.value = (await urlOf(build)) ?? RELEASES_URL
  })
  return { href }
}

/**
 * The OS this page is being read on, and where its download button goes:
 * the file, or — before it is known, or if it never is — `fallback`, the
 * guide's list of every build.
 */
export function useDownload(fallback: MaybeRefOrGetter<string>) {
  const os = ref<Os | null>(null)
  const url = ref<string | null>(null)
  const href = computed(() => url.value ?? toValue(fallback))
  onMounted(async () => {
    os.value = osOf(navigator.userAgent)
    if (os.value) url.value = await urlOf(await buildOf(os.value))
  })
  return { os, href, direct: computed(() => url.value !== null) }
}
