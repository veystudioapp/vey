import { create } from "zustand"

/**
 * Where feedback goes: the repository's issues — the same repository
 * `main/updater.ts` reads releases from.
 */
export const FEEDBACK_REPO = "https://github.com/veystudioapp/vey"

export const ISSUES_URL = `${FEEDBACK_REPO}/issues`

export type FeedbackKind = "bug" | "feature" | "improvement"

/** What the report is filed from, written at the foot of every issue — the
 * first question asked of a bug report is always which build and which OS. */
export type FeedbackContext = {
  /** Empty until the first update check has answered. */
  version: string
  platform: "darwin" | "win32" | "linux"
}

const PLATFORM_NAMES: Record<FeedbackContext["platform"], string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
}

/**
 * Each kind's title prefix, label and body. The body is headings with a
 * comment under each rather than a form: GitHub drops the comments from the
 * rendered issue, so a heading left empty costs nothing, and somebody with one
 * sentence to say is not made to fill in three boxes.
 *
 * The label only sticks for somebody with triage rights on the repository —
 * for anybody else GitHub ignores it, which is why the title carries the kind
 * too.
 */
const TEMPLATES: Record<
  FeedbackKind,
  { prefix: string; label: string; sections: [string, string][] }
> = {
  bug: {
    prefix: "[Bug] ",
    label: "bug",
    sections: [
      [
        "What happened",
        "What went wrong? An error message or a screenshot helps.",
      ],
      ["What you expected", "What should have happened instead?"],
      ["Steps to reproduce", "1. \n2. \n3. "],
    ],
  },
  feature: {
    prefix: "[Feature] ",
    label: "enhancement",
    sections: [
      ["The problem", "What are you trying to do, and what gets in the way?"],
      ["What you'd like", "How would you like it to work?"],
      ["Alternatives", "Anything you've tried or considered instead."],
    ],
  },
  improvement: {
    prefix: "[Improvement] ",
    label: "enhancement",
    sections: [
      [
        "What could be better",
        "Which part of the app, and what feels off about it?",
      ],
      ["How it could work", "Your idea for making it better."],
    ],
  },
}

/** The issue body: each section a heading and its hint, then the build. */
export function issueBody(
  kind: FeedbackKind,
  context: FeedbackContext
): string {
  const sections = TEMPLATES[kind].sections.map(([heading, hint]) =>
    // Steps are a numbered list to fill in, not a hint to read.
    hint.startsWith("1.")
      ? `### ${heading}\n\n${hint}`
      : `### ${heading}\n\n<!-- ${hint} -->\n`
  )
  return [...sections, `---\n${buildLabel(context)}`].join("\n\n")
}

/** `Vey 1.0.16 · macOS` — the dialog's foot and the issue's, one
 * spelling. */
export function buildLabel(context: FeedbackContext): string {
  return [
    context.version ? `Vey ${context.version}` : "Vey",
    PLATFORM_NAMES[context.platform],
  ].join(" · ")
}

/** GitHub's new-issue page, filled in for `kind`. */
export function issueUrl(kind: FeedbackKind, context: FeedbackContext): string {
  const template = TEMPLATES[kind]
  const params = new URLSearchParams({
    title: template.prefix,
    body: issueBody(kind, context),
    labels: template.label,
  })
  return `${ISSUES_URL}/new?${params.toString()}`
}

/**
 * Whether the feedback dialog is open — one dialog the window mounts
 * (`feedback-dialog.tsx`), opened from the rail.
 */
type FeedbackDialogState = {
  open: boolean
  show: () => void
  close: () => void
}

export const useFeedbackDialog = create<FeedbackDialogState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}))
