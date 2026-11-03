import {
  buildLabel,
  issueBody,
  issueUrl,
  type FeedbackContext,
} from "../src/renderer/lib/feedback"
import { check, finish, section } from "./harness"

/**
 * The feedback dialog's GitHub links (`lib/feedback.ts`).
 *
 * Worth a test because a malformed one fails where nobody is watching: GitHub
 * opens a blank issue or a 404, and the report the user meant to write is the
 * one that never arrives.
 */

const mac: FeedbackContext = { version: "1.0.16", platform: "darwin" }

section("issueUrl")
{
  const url = new URL(issueUrl("bug", mac))
  check(
    "goes to the repository's new-issue page",
    url.origin + url.pathname ===
      "https://github.com/veystudioapp/vey/issues/new"
  )
  check("titles a bug as one", url.searchParams.get("title") === "[Bug] ")
  check("labels a bug as one", url.searchParams.get("labels") === "bug")
  check(
    "carries the body intact through the query string",
    url.searchParams.get("body") === issueBody("bug", mac)
  )

  const feature = new URL(issueUrl("feature", mac))
  check(
    "titles a feature as one",
    feature.searchParams.get("title") === "[Feature] "
  )
  const improvement = new URL(issueUrl("improvement", mac))
  check(
    "titles an improvement as one",
    improvement.searchParams.get("title") === "[Improvement] "
  )
}

section("issueBody")
{
  const body = issueBody("bug", mac)
  check("asks what happened", body.includes("### What happened"))
  check("leaves the steps as a list to fill in", body.includes("1. \n2. "))
  check("ends with the build", body.endsWith("---\nVey 1.0.16 · macOS"), body)
}

section("buildLabel")
check(
  "names the OS rather than Node's platform",
  buildLabel({ version: "2.0.0", platform: "win32" }) === "Vey 2.0.0 · Windows"
)
check(
  "drops a version not known yet rather than printing an empty one",
  buildLabel({ version: "", platform: "linux" }) === "Vey · Linux"
)

finish()
