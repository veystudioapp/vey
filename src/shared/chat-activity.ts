/**
 * How many chats are working, and how many have stopped to ask.
 *
 * Counted by the system bar (`lib/chat/running.ts`, which re-exports this). It
 * is under `shared/` because the menu bar's tray used to draw it from main too;
 * that is deleted — `docs/design.md` § The menu bar, removed. The labels a shut
 * project's row drew (`2 · 1!`) went with the tree — § Projects and chats.
 */

/**
 * **Waiting wins over working**, which is the rule.
 *
 * Both are true while a question is up — the turn has not ended, so the chat is
 * still `busy` — and only one of them is something for the user to do. A chat
 * counted in both columns would make a project of three chats read as five
 * things happening, and worse, it would draw a "1 waiting" beside a "1 working"
 * that are the same conversation.
 */
export type ChatActivity = {
  /** Answering, and nothing is wanted from anybody. */
  working: number
  /** Stopped on a question. Nothing moves in these until they are answered, and
   * nothing times them out — see `Chats.ask` in main. */
  waiting: number
}
