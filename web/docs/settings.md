# Settings and plugins

Open **Settings** with `⌘,` or the gear at the bottom of the left rail.

## Appearance

- **Theme** — System, Light or Dark.
- **Accent** — Indigo, Graphite, Teal, Rose or Amber.
- **Font** and **Monospace font** — the interface's, and the one editors,
  diffs and the terminal use.
- **Font size** — Small, Default or Large; scales the whole window.
- **Density** — Compact, Comfortable or Spacious.
- **Background** — a picture behind the studio, seen in the gaps between
  panels.
- **Tour** — replays the first-launch walkthrough.

## Tabs & editor

- **Show tabs from every project** — off, the tab strip only shows the project
  you are working in.
- **Show who last changed the line** — git blame after the current line.

## Chats

- **Notify me when a chat finishes** — on by default. A notification when a
  chat finishes, fails or asks something while the window is in the
  background. Clicking it opens the chat.

## Claude

- **Your accounts** — the Claude logins a chat can run under. See
  [Claude accounts](/docs/accounts).
- **Helpers › Commit message drafts** — the model and account the Git tab's
  **Draft** button uses.

## Plugins

Plugins add features to Vey. Two come with it, switched on:

- **Chat export** — copy a chat as Markdown, or save it as a Markdown or HTML
  file, from the chat's right-click menu.
- **Usage** — the tokens every chat has used, by day, model, project and chat.
  Open it from the **Usage** button on the left rail.

Switch either off here if you do not use it.

::: warning
A plugin runs inside the studio with the same access the studio has — your
files, your terminals, your chats. Only switch on a plugin you trust.
:::

## Updates

Shows the version of Vey and of your Claude Code, and whether a newer VS
Claude is out. Installing an update restarts the app, and open terminal
sessions end. On Linux, the button links to the release page instead.
