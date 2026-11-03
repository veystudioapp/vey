/**
 * The app's mark — a copy of the app's `resources/logo.svg`, without its
 * comment. Inlined rather than served, so a page that draws it is still one
 * response. The mark in white on a black plate; it carries no ids, so two
 * copies in one page cannot disagree.
 */
export const APP_MARK = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect width="100" height="100" rx="22.5" fill="#000000"/>
<g transform="translate(9.09 9.09) scale(0.8182)" stroke="#FFFFFF" stroke-width="13"><path d="M6 72H34L62 28H94"/><path d="M6 28H22"/><path d="M78 72H94"/></g>
<rect x="0.5" y="0.5" width="99" height="99" rx="22" stroke="#808080" stroke-opacity="0.3"/>
</svg>`

/**
 * The mark alone — `resources/mark.svg` path for path, in `currentColor` —
 * for the logo beside `WORDMARK`. The app icon there was the mark twice over:
 * a plate is a frame, and a frame beside a word is one more than the word
 * needs. The icon stays where it stands for the app itself (the stack on the
 * home page, the mail, which cannot follow a background).
 */
export const MARK = `<svg viewBox="6 21.5 88 57" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<g stroke="currentColor" stroke-width="13"><path d="M6 72H34L62 28H94"/><path d="M6 28H22"/><path d="M78 72H94"/></g>
</svg>`

/**
 * The bare mark as a favicon: black, and white where the browser's own
 * theme is dark — a tab's background is the browser's, not the page's, so
 * `currentColor` would not reach it and a plate would be the Dock icon
 * shrunk to sixteen pixels.
 */
export const MARK_ICON_URL = `data:image/svg+xml,${encodeURIComponent(
  `<svg viewBox="6 21.5 88 57" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>g{stroke:#111}@media(prefers-color-scheme:dark){g{stroke:#fff}}</style>
<g stroke-width="13"><path d="M6 72H34L62 28H94"/><path d="M6 28H22"/><path d="M78 72H94"/></g>
</svg>`
)}`

/**
 * "Vey" as the brand writes it, for a page's own CSS to size. Drawn
 * beside `APP_MARK`, so it carries no lettermark of its own: the "VS" glyph it
 * used to start with sat next to the mark's own white VS and read as the logo
 * twice.
 */
export const WORDMARK = `<span class="wordmark">Vey</span>`

/** What a page needs to draw `WORDMARK`. */
export const WORDMARK_CSS = `.wordmark { white-space: nowrap; }`
