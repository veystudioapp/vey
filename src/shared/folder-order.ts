/**
 * The order of the workspace's projects — which is the order of the icons in
 * the rail, and so the one thing about the list somebody arranges by hand.
 *
 * Shared because both halves need it: the renderer moves an id in its own list
 * as a drag lands, and main writes the order into the manifest. Pure, and
 * tested in `test/folder-order.ts`.
 */

/**
 * `ids` with `id` moved to sit at `index` of the list it ends up in.
 *
 * `index` is counted in the finished list, so moving to the end is
 * `ids.length - 1` and a drop past either end is clamped onto it. An `id` not
 * in the list leaves the list as it was.
 */
export function moveId(ids: string[], id: string, index: number): string[] {
  const from = ids.indexOf(id)
  if (from === -1) return ids
  const rest = ids.filter((entry) => entry !== id)
  const to = Math.max(0, Math.min(index, rest.length))
  return [...rest.slice(0, to), id, ...rest.slice(to)]
}

/**
 * `items` put in the order `ids` gives.
 *
 * What main writes, so it is the side that has to survive a renderer that was
 * out of date: an item `ids` does not name — a project added in another
 * window meanwhile — keeps its place after the named ones rather than being
 * dropped, and an id naming nothing is ignored. A reorder must never be the
 * way a project leaves the workspace.
 */
export function inOrder<T extends { id: string }>(
  items: T[],
  ids: string[]
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]))
  const named = items
    .filter((item) => rank.has(item.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const unnamed = items.filter((item) => !rank.has(item.id))
  return [...named, ...unnamed]
}
