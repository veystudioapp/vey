import { fileLinkCandidates } from "@/lib/shell/file-links"

/**
 * The file a code span names, when the whole span is one — `ipc.ts:227`,
 * `src/main/ipc.ts`, `src/app.ts:42:7`. A span with anything else in it
 * (`open(file)`, `see ipc.ts`) is code, not a link.
 *
 * Pure, and read off the terminal's own path rules (`lib/shell/file-links`) so
 * a path means the same thing in a shell and in a reply. Whether it names a
 * real file is main's to say — `linkCodeFiles` asks.
 */
export type CodeFile = { path: string; line?: number; column?: number }

export function codeFileOf(text: string): CodeFile | null {
  const candidates = fileLinkCandidates(text)
  if (candidates.length !== 1) return null
  const [only] = candidates
  if (!only || only.start !== 0 || only.end !== text.length) return null
  return { path: only.path, line: only.line, column: only.column }
}

/*
 * How long main's answer is believed, as the terminal's: a hit hardly goes
 * stale, a miss does the moment the file is written — and a reply is rendered
 * again on every token of a stream, so a miss is not asked again at once.
 */
const HIT_MS = 60_000
const MISS_MS = 3_000

type Answer = { path: string; directory: boolean } | null
const answers = new Map<
  string,
  { at: number; hit: boolean | null; answer: Promise<Answer> }
>()

function resolve(base: string, path: string): Promise<Answer> {
  const key = `${base}\0${path}`
  const now = Date.now()
  const known = answers.get(key)
  if (
    known &&
    (known.hit === null || now - known.at < (known.hit ? HIT_MS : MISS_MS))
  )
    return known.answer

  if (answers.size > 1_000) answers.clear()
  const answer = window.desktop
    .resolveRelativePath(base, path)
    .catch((): Answer => null)
  const entry = { at: now, hit: null as boolean | null, answer }
  void answer.then((target) => (entry.hit = target !== null))
  answers.set(key, entry)
  return answer
}

/**
 * Turns each inline code span in `host` that names a file of the workspace
 * into a link to it. The span keeps its own look; its text becomes the file's
 * name with the line and column, and the full path is what a hover shows.
 *
 * Done after the render rather than during it: a resolve is an IPC call, and
 * the markdown parser is synchronous. `alive` stops a late answer from
 * landing in a host that has since been rendered again.
 */
export async function linkCodeFiles(
  host: HTMLElement,
  base: string,
  alive: () => boolean
): Promise<void> {
  const spans = Array.from(host.querySelectorAll("code")).filter(
    (code) => !code.closest("pre")
  )
  await Promise.all(
    spans.map(async (code) => {
      const named = codeFileOf(code.textContent ?? "")
      if (!named) return
      const target = await resolve(base, named.path)
      if (!alive() || !code.isConnected || !target || target.directory) return

      const link = document.createElement("a")
      link.className = "markdown-file-link"
      link.dataset.filePath = target.path
      link.dataset.fileLine = String(named.line ?? 1)
      link.dataset.fileColumn = String(named.column ?? 1)
      link.title = named.line
        ? `${target.path}:${named.line}${named.column ? `:${named.column}` : ""}`
        : target.path

      code.textContent = nameOf(target.path, named)
      code.replaceWith(link)
      link.append(code)
    })
  )
}

/** The file's own name and the line, as written after it: `ipc.ts:227:7`. */
function nameOf(path: string, named: CodeFile): string {
  const name = path.split(/[\\/]/).pop() || path
  if (!named.line) return name
  return named.column
    ? `${name}:${named.line}:${named.column}`
    : `${name}:${named.line}`
}
