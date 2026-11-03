import type { Chat } from "@shared/api"

/**
 * What the projects column draws: one project's chats, split by what each
 * wants from somebody, and the badge each project's icon in the rail carries.
 *
 * Pure and tested (`test/chat-column.ts`). `docs/design.md` § Projects and
 * chats has the argument for the shape — a rail of projects with one project's
 * chats beside it, rather than a tree of every project folded shut.
 */

/**
 * The one state a chat's row is drawn in.
 *
 * **Waiting over working over limited over unread.** Waiting and working are
 * both true while a question is up, and only one of them is something to do —
 * the precedence `activityOf` counts by. A chat stopped on a plan limit is not
 * busy, but a message sent into it makes it busy before the listing has been
 * re-read to drop the mark, so working outranks the stale mark. Unread is last:
 * a limit line arriving *is* an answer, and the row should say which kind.
 */
export type ChatState = "waiting" | "working" | "limited" | "unread" | null

export function chatStateOf(
  chat: Pick<Chat, "id" | "limit">,
  /** `sending` in the store. */
  sending: string[],
  /** `asks` in the store. */
  asks: Record<string, unknown>,
  /** `unread` in the store. */
  unread: Record<string, unknown>
): ChatState {
  if (asks[chat.id] !== undefined) return "waiting"
  if (sending.includes(chat.id)) return "working"
  if (chat.limit) return "limited"
  if (unread[chat.id] !== undefined) return "unread"
  return null
}

/**
 * One project's chats as the column lists them.
 *
 * `needsYou` is what nothing moves in until somebody acts — a question up, or a
 * limit to move past — and `running` is what will finish whether or not anybody
 * looks. Everything else is `recent`, newest first by `createdAt` as the column
 * always sorted: a list ordered by activity rearranges itself under the cursor,
 * and the two sections above are what take the moving chats out of it.
 */
export function columnSections(
  chats: Chat[],
  sending: string[],
  asks: Record<string, unknown>,
  unread: Record<string, unknown>
): { needsYou: Chat[]; running: Chat[]; recent: Chat[] } {
  const needsYou: Chat[] = []
  const running: Chat[] = []
  const recent: Chat[] = []
  const ordered = [...chats].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
  for (const chat of ordered) {
    const state = chatStateOf(chat, sending, asks, unread)
    if (state === "waiting" || state === "limited") needsYou.push(chat)
    else if (state === "working") running.push(chat)
    else recent.push(chat)
  }
  return { needsYou, running, recent }
}

/**
 * What a project's icon in the rail says about the chats inside it.
 *
 * One mark, the most urgent: `needs` with a count (questions up and limits
 * hit), else `working`, else `unread` with a count, else nothing. One rather
 * than a stack, because a 32px icon with three badges on it is an icon nobody
 * can read — and the column, one click away, says the rest.
 */
export type RailBadge =
  | { kind: "needs"; count: number }
  | { kind: "working"; count: number }
  | { kind: "unread"; count: number }
  | null

export function railBadgeOf(
  chats: Chat[],
  sending: string[],
  asks: Record<string, unknown>,
  unread: Record<string, unknown>
): RailBadge {
  let needs = 0
  let working = 0
  let news = 0
  for (const chat of chats) {
    const state = chatStateOf(chat, sending, asks, unread)
    if (state === "waiting" || state === "limited") needs += 1
    else if (state === "working") working += 1
    else if (state === "unread") news += 1
  }
  if (needs > 0) return { kind: "needs", count: needs }
  if (working > 0) return { kind: "working", count: working }
  if (news > 0) return { kind: "unread", count: news }
  return null
}

/**
 * An account a stopped chat could be moved to, as the column knows it.
 *
 * `profileId` is what `ChatOptions.profileId` takes — null for the login the
 * user's own `claude` has. `utilization` is the five-hour window's percent
 * when it has been asked, null when it has not or the account has no plan
 * window (an API key). `usable` is false for what cannot run a turn at all: a
 * profile never signed into.
 */
export type AccountChoice = {
  profileId: string | null
  utilization: number | null
  usable: boolean
}

/**
 * The way on from a chat its plan limit stopped — the one button the column's
 * card and the transcript's limit line both offer.
 *
 * Once the reset has passed, `continue` on the account it stopped on, which is
 * free again. Before that, the first other account that can run a turn and is
 * not itself at its limit, in the order given — the column's own: the user's
 * login, then their profiles. An account whose usage nobody has asked yet is
 * offered rather than skipped: not knowing is not the same as full, and the
 * turn says so if it is.
 *
 * With nowhere to go, the wait (null): an account to sign in to is not a
 * button this card can be. Credits used to be the way on here, and then Vey
 * Pro; both are deleted (`docs/design.md` § Credits and the free AI, removed,
 * § Pro, removed).
 *
 * `continue` carries `profileId: null` for the user's own login, which is why
 * this is a union and not a nullable id: the old `continueTarget` answered
 * null for "nowhere" too, and never offered that login back.
 */
export type LimitWayOut = { kind: "continue"; profileId: string | null }

export function limitWayOut(
  current: string | null,
  accounts: AccountChoice[],
  { over }: { over: boolean }
): LimitWayOut | null {
  if (over) return { kind: "continue", profileId: current }
  for (const account of accounts) {
    if (account.profileId === current) continue
    if (!account.usable) continue
    if (account.utilization !== null && account.utilization >= 95) continue
    return { kind: "continue", profileId: account.profileId }
  }
  return null
}

/**
 * The letter an account's avatar carries: the first letter or digit of its
 * name, upper-cased, or `?` for a name with none.
 */
export function avatarLetter(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u)
  return match ? match[0].toUpperCase() : "?"
}

/**
 * Which of `AVATAR_HUES` an account is drawn in — by its id rather than its
 * name, so a rename keeps the colour somebody has learnt to read it by.
 */
export function avatarHue(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return AVATAR_HUES[hash % AVATAR_HUES.length]!
}

/** Six hues far enough apart to tell at 16px, none of them the destructive
 * red a limit is drawn in. */
export const AVATAR_HUES = [250, 160, 300, 200, 80, 330]
