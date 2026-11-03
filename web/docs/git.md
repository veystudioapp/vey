# Git

The Explorer's **Git** tab shows what has changed in the project's checkout and
what has been committed. It is for reading Claude's work and committing it —
branches, rebases and the rest are for the terminal.

## Changes

**Changes** lists every changed file, as a tree, under **Staged** and
**Working tree**, each with how many lines were added and removed.

- Click a file to open its **diff** — side by side or inline, with **Show
  whitespace** if you need it. The diff is read-only; open the file to edit.
- Right-click to stage, unstage or discard a file, or use **Stage everything**
  and **Unstage everything**.
- **Discard every change in this checkout** puts everything back as it was at
  the last commit. A new file it would delete goes to the trash instead.

The list refreshes itself when files change, including after a commit made in
the terminal.

## Committing

Stage what you want, type a message in the box above the lists and press
`⌘⏎`.

**Draft** has Claude write the message for you from the staged diff and your
last ten commit subjects, in the same style. It only fills the box — nothing is
committed until you press commit. The model and account it uses are set in
**Settings › Chats › Commit message drafts**.

## Commits

**Commits** is the current branch's history, newest first, loaded as you
scroll. Filter it by message, author or hash.

- Commits not pushed yet are marked **Not pushed**.
- Click a commit for the files it changed, and a file for its diff in that
  commit. Right-click for **Copy commit SHA** and **Open file at this commit**.
- **Push** sends the branch to `origin` — and sets its upstream if it has none.
  It runs in the background and never stops to ask for anything; if git needs a
  passphrase or a password, the push is run again in a terminal, where you can
  type it.
