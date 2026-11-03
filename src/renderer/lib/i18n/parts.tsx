import { Fragment, type ReactNode } from "react"

/**
 * A translated sentence with elements in its `{slots}` — a `<code>`, a link, a
 * bold name. The sentence decides where each one goes, since word order is
 * the translation's business and not the component's.
 */
export function withParts(
  text: string,
  parts: Record<string, ReactNode>
): ReactNode[] {
  return text
    .split(/\{(\w+)\}/)
    .map((piece, index) =>
      index % 2 === 1 ? (
        <Fragment key={index}>{parts[piece] ?? `{${piece}}`}</Fragment>
      ) : (
        piece
      )
    )
}
