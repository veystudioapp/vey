/**
 * The pieces of the updater with an opinion: which of two versions is newer,
 * which asset in a release is this machine's, what a half-finished install
 * says on the button, and which notes the first launch after an update owes.
 *
 * Worth a test rather than a glance, because both ways of getting it wrong are
 * silent. Say `1.0.9` is newer than `1.0.19` — string comparison, the obvious
 * implementation — and every user is offered a downgrade forever. Say a
 * prerelease is newer than the release it precedes and the same thing happens
 * to whoever is running one.
 */
import {
  installerAsset,
  notesBetween,
  windowsInstallerArgs,
} from "../src/main/updater"
import { downloadPercent, installLabel } from "../src/renderer/lib/updates"
import { whatsNewOf } from "../src/renderer/lib/whats-new"
import { isNewer, versionParts } from "../src/shared/version"
import { check, finish, section } from "./harness"

section("versionParts")

check("splits a plain version", versionParts("1.0.19").join(".") === "1.0.19")
check("drops a leading v", versionParts("v1.0.19").join(".") === "1.0.19")
check(
  "stops at a prerelease rather than folding it in",
  versionParts("1.0.20-beta.1").join(".") === "1.0.20"
)
check("reads a non-number as zero", versionParts("1.x.3").join(".") === "1.0.3")

section("isNewer")

check("a later patch", isNewer("1.0.20", "1.0.19"))
check(
  "compares numerically, not as text — the bug this exists for",
  isNewer("1.0.19", "1.0.9")
)
check("a later minor", isNewer("1.1.0", "1.0.99"))
check("the same version is not newer", !isNewer("1.0.19", "1.0.19"))
check("a tag's v changes nothing", !isNewer("v1.0.19", "1.0.19"))
check(
  "an older release is never offered — a dev build stays put",
  !isNewer("1.0.19", "1.0.20")
)
check("a release beats its own prerelease", isNewer("1.0.20", "1.0.20-beta.1"))
check(
  "a prerelease of the version you have is not an update",
  !isNewer("1.0.20-beta.1", "1.0.20")
)
check(
  "a shorter version is padded rather than treated as smaller",
  !isNewer("1.0", "1.0.0")
)
check("and the other way round", isNewer("1.0.1", "1.0"))

section("installerAsset")

const release = {
  assets: [
    {
      name: "Visual Studio Claude-1.0.24-x64.dmg",
      browser_download_url: "x64",
      size: 120,
    },
    {
      name: "Visual Studio Claude-1.0.24-arm64.dmg",
      browser_download_url: "arm",
      size: 130,
    },
    {
      name: "Visual Studio Claude-1.0.24-arm64.zip",
      browser_download_url: "zip",
      size: 90,
    },
    {
      name: "Visual-Studio-Claude-1.0.24-x64.exe",
      browser_download_url: "exe",
      size: 110,
    },
    {
      name: "Visual-Studio-Claude-1.0.24-x64.exe.blockmap",
      browser_download_url: "blockmap",
      size: 1,
    },
  ],
}

check(
  "picks this arch's dmg",
  installerAsset(release, "darwin", "arm64")?.url === "arm"
)
check(
  "and the other one",
  installerAsset(release, "darwin", "x64")?.url === "x64"
)
check(
  "Windows gets the .exe, not a .dmg of the same arch",
  installerAsset(release, "win32", "x64")?.url === "exe"
)
check(
  "a blockmap beside the .exe is not the installer",
  installerAsset({ assets: [release.assets[4]] }, "win32", "x64") === null
)
check(
  "Linux has no installer to run",
  installerAsset(release, "linux", "x64") === null
)
check(
  "a .zip of the right arch is not a .dmg",
  installerAsset({ assets: [release.assets[2]] }, "darwin", "arm64") === null
)
check(
  "an arch with no build is null, not the first asset going",
  installerAsset(release, "darwin", "riscv") === null
)
check(
  "a release with no assets",
  installerAsset({ assets: [] }, "darwin", "arm64") === null
)
check(
  "and one that is not a release at all",
  installerAsset(null, "darwin", "arm64") === null
)
check(
  "a missing size reads as unknown rather than throwing",
  installerAsset(
    { assets: [{ name: "a-arm64.dmg", browser_download_url: "u" }] },
    "darwin",
    "arm64"
  )?.size === 0
)

section("windowsInstallerArgs")

check(
  "silent, since the window that asked is gone",
  windowsInstallerArgs(true).includes("/S")
)
check(
  "closes every running copy without a prompt",
  windowsInstallerArgs(true).includes("--updated")
)
check(
  "and reopens the app, which a silent install otherwise does not",
  windowsInstallerArgs(true).includes("--force-run")
)
check(
  "an install at quit does not reopen what somebody just closed",
  !windowsInstallerArgs(false).includes("--force-run")
)

section("downloadPercent")

check("nothing installing", downloadPercent(null) === null)
check(
  "bytes against a total",
  downloadPercent({
    stage: "downloading",
    version: "1",
    received: 50,
    total: 200,
  }) === 25
)
check(
  "an unknown total is indeterminate, not 0% — a bar stuck at zero for a minute",
  downloadPercent({
    stage: "downloading",
    version: "1",
    received: 50,
    total: 0,
  }) === null
)
check(
  "clamped: a content-length that undercounts must not print 101%",
  downloadPercent({
    stage: "downloading",
    version: "1",
    received: 210,
    total: 200,
  }) === 100
)
check(
  "the install stage has no percentage to give",
  downloadPercent({ stage: "installing", version: "1" }) === null
)

section("installLabel")

check("idle", installLabel(false, null) === "Update and reopen")
check(
  "started, before the first byte",
  installLabel(true, null) === "Downloading…"
)
check(
  "downloading",
  installLabel(true, {
    stage: "downloading",
    version: "1",
    received: 1,
    total: 3,
  }) === "Downloading 33%"
)
check(
  "handed over to the script",
  installLabel(true, { stage: "installing", version: "1" }) === "Installing…"
)

section("notesBetween")

const listing = [
  { tag_name: "v1.0.19", body: "- nineteen", html_url: "u19" },
  { tag_name: "v1.0.17", body: "- seventeen", html_url: "u17" },
  { tag_name: "v1.0.20", body: "- twenty", html_url: "u20" },
  { tag_name: "v1.0.18", body: "- eighteen", html_url: "u18" },
  { body: "no tag" },
]
const versionsOf = (since: string | null, current: string) =>
  notesBetween(listing, since, current)
    .map((release) => release.version)
    .join(",")

check(
  "after the last one seen, up to this build, newest first",
  versionsOf("1.0.17", "1.0.19") === "1.0.19,1.0.18"
)
check(
  "nothing seen is this build alone, not the whole listing",
  versionsOf(null, "1.0.19") === "1.0.19"
)
check(
  "a build ahead of every release finds nothing of its own",
  versionsOf(null, "1.0.21") === ""
)
check(
  "a listing that is not one is empty",
  notesBetween({}, null, "1").length === 0
)

section("whatsNewOf")

check(
  "a first launch is recorded, not announced",
  whatsNewOf("1.0.19", null, false).kind === "record"
)
{
  const next = whatsNewOf("1.0.19", null, true)
  check(
    "an update from before the notes existed announces this build alone",
    next.kind === "announce" && next.since === null
  )
}
{
  const next = whatsNewOf("1.0.19", "1.0.17", true)
  check(
    "an update announces everything since the last build seen",
    next.kind === "announce" && next.since === "1.0.17"
  )
}
check(
  "the same build again says nothing",
  whatsNewOf("1.0.19", "1.0.19", true).kind === "nothing"
)
check(
  "a downgrade is recorded, so the update back is announced",
  whatsNewOf("1.0.18", "1.0.19", true).kind === "record"
)

finish()
