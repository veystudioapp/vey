# Vey Studio — design

An Electron studio for running several `claude` conversations against a project
at once and reading what they did. A workspace points at real directories on
disk, and every tool over them — the chats, their diffs, the files, a terminal —
is a tab in one window.

This document says what each part does and **why**, briefly. The commands and
the contracts are in `CLAUDE.md`; the long history of each decision is in git.

## Layout

| Path            | What it is                                                    |
| --------------- | ------------------------------------------------------------- |
| `src/main/`     | Main process: storage, chats, git, terminals, IPC.            |
| `src/preload/`  | The one bridge script, sandboxed.                             |
| `src/shared/`   | The typed IPC contract, imported by both sides (`@shared/*`). |
| `src/renderer/` | Renderer: the Vite + React studio.                            |
| `test/`         | Plain `bun` scripts, no test framework.                       |

## The workspace

There is exactly one workspace, holding any number of **folders** — directories
already on this machine, worked on where they are. Nothing is copied in and
nothing is written into them that you did not ask for; the manifest records an
absolute path.

```
~/.veystudio/
  manifest.json              the workspace, its folders, settings
  workspace/
    chats.json      the chats, listed
    chats/<id>.json one chat's lines
    worktrees/<folderId>/    checkouts an older build cut; nothing makes one now
    claude-profiles/<slug>/  one Claude profile's `CLAUDE_CONFIG_DIR`
    note-files/              pictures dropped into a document or a chat
    drawings/                one `<id>.excalidraw` per drawing
```

**There is no switching.** Somebody working on a frontend and the API behind it
has two folders open, not two applications to alternate between. What is per
folder is what is genuinely per repository — a shell's cwd, a branch name.
Sign-in will bring a second workspace; until then its id is a constant.

**What a removed feature left on disk is left alone.** Nothing reads
`mail.json`, `tasks.json`, `board.json`, `review.json`, `notes.json`,
`clickup-watches.json` and the rest any more, and nothing deletes them either.
The manifest keeps an opaque `databases?: unknown` because it is rewritten
whole, and dropping the key would delete somebody's saved connections.

### Syncing the folder list to the account, removed

Signing in (`lib/account.ts`) used to keep one Firestore document per account at
`workspaces/<uid>`, holding the folder list and a few settings, so a folder
added on one machine showed under **Not on this machine** on another until it
was located. It was removed: the folder list is this machine's to keep, and a
second copy in the cloud that had to reconcile against it was more to get right
than the feature was worth. Sign-in stays; the account now only says who is
signed in.

What was already written is left alone: `workspaces/<uid>` documents in the
Firebase project still exist, and nothing reads or deletes them. Deleting them
is a step in the Firebase console, not in this repository.

## The window

A canvas with cards: a full-width title bar (a centred `Run a command` field
that opens the palette, no crumb), then a 48px **`NavRail`** — the projects
at its head, the window's own buttons at its foot — the chats column, the pane
with the dock under it, and the Explorer. The gaps between
cards are the resize handles; a card's edge is an inward outline (`CARD`) so
collapsed sizes stay exact.

- **The left column** shows its sections, **Search** (`⇧⌘F`) or **Plugins**
  (`SidebarView`). Plugins was a page of Settings; it moved to the rail because
  a plugin is something the studio does rather than how it looks, and the
  switch for the editor's ESLint wants to be one click from the editor. `SIDEBAR_SECTIONS` draws `Projects` and nothing else.
- **The right column is the Explorer**, its whole height. `⌘B` or the title
  bar's toggle closes it to nothing; the chats column closes to nothing too,
  since the projects in the rail are its way back.
- **The dock** is under the pane, spanning its width — not under the Explorer,
  where a 520px cap left a shell ~60 columns wide.
- The current **branch** is at the head of the status bar along the bottom,
  with what is unpushed, behind and changed, then what the chats are doing —
  § The system bar.

A shut column is hidden rather than squeezed, and never unmounted: the tree
watches the checkout, and a pty taken out of the React tree ends.

## Projects and chats

**The projects are icons in the rail; the column is one project's chats.**
Picking an icon (`ProjectRail`) moves the column, Explorer and the dock's
shell to that project; picking the one already showing hides the column. Its
menu — new chat, new terminal, rename, path, icon, remove, Trash — is on the
icon's right-click and on the `…` in the column's header, written once
(`ProjectMenuItems`), with the dialogs drawn by one `ProjectDialogs` the studio
mounts. Chats whose project has left the workspace get an `Ungrouped` icon
while there are any.

The icons are **dragged to reorder**, and the menu's `Move up` / `Move down`
do the same without a mouse (`moveFolder` in `lib/store.ts`). The order is the
manifest's own folder order, written through `IPC.reorderFolders`; it is drawn
at once and written after, like a rename. `inOrder` in
`shared/folder-order.ts` (tested) keeps any folder the list does not name —
one added from another window meanwhile — after the named ones, because a
reorder must never be how a project leaves the workspace. `Ungrouped` is not
a project and is not dragged.

It was a **tree** of every project, each folded open or shut, a shut one
saying what was inside it with a count (`2 · 1!`). That is the wrong shape for
what this app is for — several chats on several accounts at once — because the
way somebody runs several is to start a chat, fold its project away and start
another, and a column of folded projects says almost nothing. A first attempt
at fixing it inside the tree — a flat `Recent` view, a two-line row quoting the
last reply, one unified status mark — was rejected by the user as changing
nothing, and rightly: it polished the tree and kept its shape. The rail moves
the projects out of the list, and gives the column room for what the tree never
showed at all: **which account** each chat is spending, and **which account
has anything left**.

The column (`ProjectsSection`) is a header — the project's name, its path,
its branch, `+ Chat` and the `…` — then the chats in three sections
(`columnSections` in `lib/chat/column.ts`, tested):

- **Needs you** — a question up, or a plan limit hit. Nothing moves in these
  until somebody acts.
- **Running** — what will finish whether or not anybody looks.
- **Recent** — the rest, newest first by `createdAt` so nothing moves under
  the cursor; the newest 20 and a `View all`. Its label is dropped when it is
  the only section.

Each row is the title, one state mark and its age (`since`, coarse: `9h`,
`now`). It carried the **account's avatar** ahead of the title for a while — a
letter in a hue per profile, a person for the user's own login — and the user had it taken off: an icon in front of every title is a
column of icons to read past, and which account a chat runs on is its
composer's toolbar. The letter stays where it marks the account itself —
the Accounts foot, and the composer's account picker and its toolbar button,
which drew a key glyph per profile until then — as one `ProfileAvatar`, so a
profile is the same colour wherever it is met. At the column's foot,
**every account** with its five-hour and weekly windows as two short bars
stacked at the row's end (`5h`, `w`; when each resets is its tooltip)
(`AccountsFooter`) — asked on mount and again whenever a turn
ends, main holding a minute per account. It is also where accounts are added,
signed in, renamed and removed; § Settings has why that left Settings.
The foot is at most 70% of the column, its list scrolling under a heading that
stays put; its top edge drags, up to 95% of the column (the composer's
handle — a double-click resets)
and the heading folds it away, both kept in the settings bag
(`accountsHeight`, `accountsCollapsed`). A dragged height is a **ceiling**,
not a height, so a foot with fewer rows than when it was dragged never draws
empty space under them.

### A chat stopped on a plan limit

Drawn as a card in `Needs you`: which limit, when it resets (counted down
once a minute), and **`Continue with …`**, which moves the chat to the first
other account that can take a turn and is not itself full (`limitWayOut`,
tested — the user's login, then their profiles) and sends
`Continue.`; the transcript goes with it (`carryTranscript`). Once the reset
has passed the button continues on the same account.

With **nowhere to go** — somebody on one plan and nothing else — there is no
button, only the time to wait: an account to sign in to is not a button this
card can be. Credits were the way on here once, and then Vey Pro (§ Credits
and the free AI, removed, § Pro, removed). The same action (`useLimitWayOut`,
`chat/chat-limit.tsx`) is drawn **under the transcript's limit line** too —
the last one, while `Chat.limit` stands — so somebody reading the chat does
not have to find the column to learn they need not wait.

The column knows a chat
is stopped without opening it because main writes the mark on the listing:
`Chat.limit`, set by `Chats.append` with the `limit` line and cleared by the
next main-loop `user` line, by `clear` and by `edit` (`test/chat-listing.ts`).

### Saying which chats are working, and calling you back

One state per chat (`chatStateOf`): **waiting over working over limited over
unread**. Waiting and working are both true while a question is up and only
one is something to do; a message sent past a limit makes the chat busy before
the listing drops the mark, so working outranks it; a limit line arriving is
an answer, so limited outranks unread.

- **The chat's row**: a shield while waiting, a spinner while working, the
  card while limited, a dot and a heavier title while unread.
- **The project's icon**: one badge, the most urgent (`railBadgeOf`): a count
  of what needs you, else a spinner, else a dot for what has answered.
- **The system bar** counts every chat (`activityOf`, tested).

A chat that answered while you read another is **unread**: a dot and a heavier
title, on the row and the tab (`marksUnread`, tested). It is marked on
**quiet**, not on `done` — a message queued behind a turn starts the next one.
"Read" is selected in a focused window, and none of it is written down: unread
is this run's attention. It is kept out of `ChatActivity`, which counts what
is happening.

A message sent into a chat that is **already working** is marked `Queued` until
the turn ends. It is a mark, not a cancel: the CLI folds queued messages into
the next turn, and holding them back would take that away.

### The notification

A chat that goes **quiet**, **fails** or **stops to ask** rings an OS
notification while the window is unfocused; clicking it opens the chat
(`IPC.revealChat`). `ChatNotices` in `main/notify.ts` turns the event
stream into edges and is free of `electron` so `test/notify.ts` can hold it to
them — the failures are ringing twice and swallowing a quiet. The title is read
when the notice is due, since `retitle` renames a chat mid-turn. **There is no
switch for it**: Settings › Chats had one, `Notify me when a chat finishes`,
and nobody wanted it off — a user who walked away from three running chats is
exactly who it is for. `CHAT_NOTIFICATIONS_KEY` went with it; a `"off"` still on
somebody's disk is no longer read.

### The dock badge

The app's own icon carries a red number, the way Slack's does: how many chats
**want you** — unread, or stopped on a question — counted once per chat
(`attentionOf` in `lib/chat/unread.ts`, tested). A chat merely working
is not in it: a badge that is never zero while anything runs is one nobody
reads. The studio's window sends the chats themselves (`IPC.setAttention` →
`app.setBadgeCount` of their number, and the menu bar's `Needs you` below),
because `unread` is the renderer's — main knows a chat went quiet, not whether
anybody has looked since — and a popped-out chat's window does not, since it
keeps a store of its own. No switch: the dock is the app's own icon, not a strip
shared with every other app.

### Staying awake while a chat works

Walking away from a running chat used to end it: the Mac idled into sleep, the
`claude` processes were suspended and the turn died with its connection. While
any chat is busy, main now holds a `powerSaveBlocker` of
**`prevent-app-suspension`** (`host.keepAwake`, recomputed off
`Chats.busy()` on every chat event and after a delete or edit, since a session
that leaves the map mid-turn never says `busy: false`). **Not**
`prevent-display-sleep`: the screen going dark costs the turn nothing, and a
display lit all afternoon is a cost nobody asked for. Only _idle_ sleep is
held off — closing the lid or choosing Sleep still sleeps. No switch, for the
notification's reason: whoever walked away from a running chat is who it is
for, and it lets go the moment the last chat goes quiet.

### The menu bar, for bots

**Closing the studio's window on macOS hides it into the menu bar**: the
window is hidden rather than destroyed, the dock icon goes with it once no
window of the app is showing (`syncDock` in `main.ts`), and the mark sits in
the menu bar (`main/tray.ts`). ⌘Q, `Quit Vey` in its menu, a logout and an
update's install (`before-quit-for-update`) still quit — `quitting` is what
lets the window close then. Asked for because a bot ran only while the app
was open, and closing a window is not somebody saying "stop my bots".

Hidden, not closed, because the renderer is what holds `unread`, the badge
and the terminals; a window made again would start all three from nothing.

The icon is the mark, with a **red dot** while a chat wants somebody — the
same chats as the dock badge. Clean it is a template image; badged it cannot
be (a template has no red), so the mark is inked black or white off
`nativeTheme` (`scripts/tray-icon.mjs`). Beside it, **the number of bots
switched on** (`setTitle`, `trayTitleOf`) — what the app is being kept running
for — and nothing when none is, since a `0` is one more thing in a shared
strip. It was the bots _running_ at first, and that was a number almost never
there: a run is minutes a day, so the icon said nothing about whether any bot
was set up. How many are running is the menu's `Bots · 1 running` heading
instead. Every switch and every run starting and settling is a write that
reaches the tray, so nothing polls. Its menu, built on each click so a
bot's next run is worked out when somebody looks (`main/tray-menu.ts`,
`test/tray-menu.ts`): `Open Vey`, `Needs you` (a question first), the bots
switched on by their next run, `Quit Vey`. English, like the notifications.

**`Open at login`** (Settings › Menu bar) is the OS's own login item
(`setLoginItemSettings`), asked of the OS each time rather than kept as a
setting, since System Settings can take it away. A launch it made
(`wasOpenedAtLogin`) loads the window hidden and the dock icon off. Packaged
macOS builds only — a dev run would register Electron itself.

This reverses a deletion. There was a tray icon with the working/waiting
count and a menu naming the chats, behind a switch; the dock badge replaced
it, because the menu bar is shared with the whole machine and it counted what
was _happening_ rather than what was _waiting_. What is different now: it has
a job the dock cannot do — being the app while it has no window — so it needs
no switch, and it counts what the badge counts. Nothing reads the old
`chats.tray` setting key, and nothing deletes it. Windows and Linux still quit
when the window closes.

### The chat's loading indicator

While a turn runs the pane draws the **mark drawing itself** — the step
first, then its two stubs, in the text's own colour over a faint copy — held
a beat and wiped from where it started; then `Working…` with a light passing
over it, then a running clock. All CSS in `styles/motion.css`
(`stroke-dashoffset` over `pathLength="100"`), so `prefers-reduced-motion`
reaches it: the mark is drawn whole and breathes, the shimmer stops. It was a
hand-drawn SVG, then a spritesheet, then a GIF swordsman beside `Hasaging…`,
removed at the user's request (`prefers-reduced-motion` could not reach it, it
did not follow the theme, and it was fan art of somebody else's character), then
three `primary` dots, which said "loading" in every app's words rather than this
one's.

The **spinner** (`ui/spinner.tsx`) is **not** the glyph: it is eight dots,
four large violet ones at the compass points over four smaller pink ones inside
them, both sets turning half a turn a second — the outer eased, the inner
linear, so they slip apart and close up (css-loaders.com's `l12`, which the
user brought, in the logo's colours; on a filled primary button, the button's
own text colour). For a while it was the lettermark of the time at row
size, a light running down the V and through the S. That put the logo on every
wait in the studio — 22 of them, a commit button and a blame card as much as a
chat — and on four at once for one working chat: its row, its tab, its
project's icon and the pane. A mark that is everywhere stops being the app
speaking and becomes the busiest thing on screen, so the mark is kept for
the two waits that _are_ the app — the launch screen and the turn above.

What replaced it took four rounds, each judged on sheets of candidates drawn
on the rows they would sit on: a plain ring in the text's colour, with a fixed
arc and then a stretching one, was too plain to look finished; a
violet-to-amber comet beat bars, orbiting dots and a gradient arc, and then did
not hold up either; a second sheet of rings — a stretching violet arc, a dual
ring, a glowing dot, segments — lost to the dots. Before the glyph it was a
3×3 shuffling grid, and before that lucide's `Loader2`, whose eight ticks blur
at 12px.

### A new project from a template, removed

The `Add project` dialog had a second tab, `From template`: Main made an empty
`<location>/<name>` (`IPC.createProject`), added it, and typed the framework's
own `create-next-app`, `nuxi init` or `create-vite` into a dock shell inside it.
A folder made that way carried `template` on its record, and only such a folder
offered `Move to Trash…` (`IPC.trashProject`).

It is deleted at the user's request: starting a project is a one-line command
in the dock's shell already, and the studio is for working on folders that
exist. With it went `shared/project-templates.ts` and its test,
`template-project-form.tsx`, the vendored logos (`assets/brand-icons/`,
`lib/brand-icons.ts`), both channels and the `Move to Trash…` item — so no
project is the app's to delete any more, and `Remove project`, which forgets
rather than deletes, is the only way out for every one. A folder record already
carrying `template` keeps it on disk; nothing reads it any more, and nothing
deletes it.

### The default project, removed

Every workspace had a built-in project, `Chat`, for a conversation about
nothing on this machine in particular: `workspace/default/` under the data
directory, made by `Store.getWorkspace` on any read that found it missing,
marked `builtIn` on its folder record, first in the rail with a chat icon, and
refused by `removeFolder`.

It is deleted at the user's request. A chat still needs a `cwd` and `Chats.run`
still has no fallback, so a workspace with no project in it is again one that
asks for a folder first. With it went `DEFAULT_FOLDER_DIR`, the `builtIn` field,
the menus' and the rail's special cases and `test/default-project.ts`. A
manifest that already holds the record keeps it as an ordinary project —
nothing reads `builtIn` any more, so it can be renamed or removed like any
other — and nothing deletes `workspace/default/` or its chats.

### Editing a message

A user bubble's **Edit** re-sends the message in its place and drops everything
after it. The cut is made **in the CLI's session too**: `Chats.edit`
closes the session and resumes it at the entry before the message
(`resumeSessionAt`), found in the CLI transcript by `main/chat-fork.ts`
(tested). Messages are matched from the end by text — a mid-turn message is a
`queued_command` attachment, Stop and slash commands write `user` entries
nobody typed. Editing the first message renames the transcript aside and starts
over under the same id.

**The files go back too**, whenever the dropped turns wrote something. An
edit that cut the conversation and left the tree had a model that no longer
remembered a change looking at a file that still held it. The restore is the
CLI's own: every session runs with `enableFileCheckpointing`, which keeps a copy
of each file before a turn's `Edit`/`Write` touches it, filed under the prompt
that started the turn. `rewindSessionFiles` resumes the session in a process
of its own with no prompt — no turn, no token — and asks `rewindFiles` for the
edited prompt's uuid (`promptIdIn`, beside `forkPointIn`), which puts every file
back as it was before that turn, deleting the ones it created. Measured before
it was built: the checkpoints outlive the process that wrote them, so a session
closed by `IDLE_MS` rewinds like a live one.

It runs before the cut and **never holds the edit up**: a chat from before
checkpoints, or a message the CLI filed none under, is edited and its files
stay, which is what an edit did before there was a rewind. The edit box says
none of this — nor that the turns after the message go — because that is what
an edit is. Two things it costs: the rewind is not selective, so what was typed
into those files since goes with the turns' own edits; and a `Bash` write is
not checkpointed and stays.

Not done: keeping the old branch on screen, editing while working, and editing
pictures.

## The chat is hosted, not tailed

A chat is driven through `@anthropic-ai/claude-agent-sdk`
(`main/claude-agent.ts`, the SDK runner; `main/chat.ts`, the policy).
The user's own `claude` is what runs — their install, their login, their MCP
servers — located through their login shell.

### A chat is a place

A chat's cwd is its project's own working tree (`folderId` on `ChatPlace`). The
system prompt tells the turn it is in the user's real checkout, and the empty
state says the same. A chat whose folder left the workspace finishes with a
line saying so rather than running somewhere else.

### A chat holds its CLI open

`query()` takes an async iterable (`Inbox`), so one CLI lives for the chat and
the composer is live mid-answer; the CLI queues what is sent. `Stop` is an
`interrupt()`, not a kill. Consequences:

- `result` ends a **turn** (`onTurn`); the stream ending ends the session
  (`onExit`).
- `modelUsage` is the session's **running total**; `usageOf` subtracts the
  previous result per model and reads a backwards total as a reset.
- **Busy is main's to say**, from `session_state_changed` — which only arrives
  with `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS` set. Without it a turn that
  starts background subagents looks idle while they work. Subagents' heartbeat
  (`task_*`) is kept as a set and keeps `Working…` up while any is out. It is
  drawn nowhere else: a `3 agents running` chip above the composer was deleted,
  because each agent's row in the transcript already spins and counts its own
  calls — a subagent's lines (`parent`) are drawn beneath the `Agent` row that
  ran them once it is opened. `parent` rides on the pushed `text` / `thinking` /
  `tool` events too: without it a running turn drew every subagent's calls as
  the main loop's until the chat was read back off disk. The tool is both
  `Task` and `Agent` depending on the CLI (`AGENT_TOOLS`).
- Model and effort move under a running session; cwd, profile and switched-off
  MCP tools cannot, so a change closes the session (`signatureOf`).
- A session idle for `IDLE_MS` is closed quietly; the next message resumes it.

A chat's id **is** the CLI's session id; `started` on the record decides
`sessionId` vs `resume`, and a turn refused as "already in use" is retried once
as a resume. A chat is **written down by its first message**: the renderer mints
the id and holds the tab in `unsaved`, and `createChat` takes a
`ChatSeed`. It is **named** first by its opening sentence, then by the CLI's own
`ai-title` read out of the session transcript (`retitle`) — the app runs no
summarising turn of its own. `done` waits on that write.

### What a turn looks like

A turn's **working is folded and its answer is not**: one line (`7 tool calls,
13 messages, 1 subagent`, with a mark per kind of tool) over the calls, the
thinking and the narration. Errors, refusals and the cost line are never
folded. The slot under the fold holds the latest thing said; later calls join
the fold above it. `lib/chat/activity.ts` is pure and tested.

A tool row is **verb · object · outcome** for every tool (`rowOf` in
`lib/chat/tool-row.ts`, tested), with the model's description on the
hover line. Consecutive calls of one verb merge into one row of chips; failures,
commands, agents and MCP calls never merge. Everything that opens uses the same
chevron and the same rule. An edit's row shows `+3 −1` read off the call's
input, and its lines in a popover on click; a `TodoWrite` row shows `1/3` and
the current item, and the closed fold carries the last list. A result is filled
into its row when it arrives (`recordResult`, synchronous on purpose). The
spinner shows elapsed time (`elapsed`), kept on the store so it survives
switching chats.

### What a turn cost

Every turn ends with an unfolded line:

```
Opus 5 · 39.1k prompt, 96% cached · 1.9k out · 1m5s · 41.3k context · $0.31
```

The cached share is the number that matters — a cache miss costs an order of
magnitude more. Figures come from `modelUsage` (subagents included); the time is
measured in main around the turn; the **context** is a level, not a sum, taken
from the last main-loop assistant message and sent live as its own event. The
lines are `role: "usage"` lines of the conversation, and the chat's total under
the composer is summed from them (`lib/chat/usage.ts`, tested).

### The composer's toolbar

Per chat (`ChatOptions`): model, effort, permission, `Concise`, profile, MCP.

- **Models are asked of the user's CLI** (`supportedModels()` over the control
  channel — a process, no tokens; `main/agent-models.ts`). A new chat opens on
  the CLI's `default`; `Inherit` (`null`) defers to the user's settings.
- **Effort is per model**: a model that takes none hides the picker. There is no
  `Default` row — `DEFAULT_CHAT_EFFORT` is `medium`, named out loud.
- **Permission is one picker**: `Plan` / `Read only` / `Ask` / `Edits` /
  `Full access`, one entry each in `PERMISSIONS`.

**What the CLI is handed is identical on every turn of every mode.**
`allowedTools`, `disallowedTools` and the system prompt sit in the cached
prefix, so expressing a mode there cost ~42k tokens per switch. Now: no
`allowedTools`, one `permissionMode` (`manual`), one system prompt; the mode is
applied in-process by `permits` (consulted by `deciding`), and its sentence goes
at the head of the message. A switch costs 100–170 tokens. Two traps: a bare
name on `allowedTools` auto-approves before `canUseTool`, and
`bypassPermissions` skips `canUseTool` entirely.

- **Plan** and **Read only** permit `READ_TOOLS` only (no `Bash`); they differ in
  what the turn is told. Plan is not `--permission-mode plan`, which ends by
  asking.
- **Ask** is **the plain CLI, exactly**: it permits nothing itself and puts
  every call `canUseTool` sees on screen. Parity also needs the login shell's
  whole env (`mergeShellEnv`).
- **Edits** pre-approves edits and `Bash`, and asks about MCP tools.
- **Full access** permits everything.

**`Concise`** is a toggle beside the permission: a sentence asking for terse
replies — no preamble, no recap after tool work, "unless more was asked for" —
put at the head of the message the way the mode is (`headOf`, tested in
`test/chat-head.ts`), said once per session and withdrawn by a second sentence
when switched off. Output tokens are the expensive ones (five times input at
API prices), and the paragraph after tool work recounting it is the part of a
reply nobody asked for. Three things it is deliberately not:

- Not in the system prompt. That is the cached prefix, and a toggle there would
  re-write it — the same argument that moved the mode's sentence.
- Not a setting, and not on by default. A terse model also skips the
  explanation somebody wanted, so it has to be visible where the message is
  typed, per chat, and chosen.
- Not a cap on output tokens. A cap cuts an `Edit` in half rather than
  shortening a paragraph.

What it cannot reach is the thinking, which is the effort picker's, and the
tool arguments — a `Write` of a whole file is output too.

### Asking

An unpermitted call comes back through `canUseTool` as a card above the
composer, and the promise `Chats.ask` returns **is** the pause — nothing
times it out; `finish` and `dispose` settle what is outstanding. Answering
writes a `role: "ask"` line composed by main. `Always allow` echoes the SDK's
own `suggestions`. **`AskUserQuestion`** reaches the user in every mode and is
answered by allowing the call with the picks merged in. An account's
`matchedAskRule` is honoured first, in every mode. `titleFor` writes the card's
sentence (`test/chat-ask.ts`).

### `@` in a chat's composer

`@` offers the checkout's **files and folders** and inserts a path relative to
the project, keeping the `@` so the mention can be tinted. Nothing is pasted in:
the turn can `Read` the path itself. Each row shows its estimated token cost
(size ÷ 4). The list is the Explorer's index (shared with `⌘P`) minus what git
ignores. The tint is drawn by a mirror behind a plain textarea, matched word by
word (`markMentions`). **Attach file** (⌘U) writes the same kind of path.

### Pictures in a message

A pasted or dropped picture is read as bytes at once and written as
`[Image #n]` — a macOS screenshot's temp file is gone before a path is read. At
send each is stored as a note file and the line records the names, so both the
composer and the transcript draw thumbnails (`note-file://`). A tool's image
results are kept the same way and drawn under the row, outside the fold.

### A chat's shared media

Telegram's "shared media", beside the transcript: a column with `Media` (every
picture, both sides', as a grid that opens a viewer with `←`/`→`), `Files`
(what the chat wrote, once each, by its last write) and `Links` (web links said
by either side, not tool output). Newest first, read off the lines on screen
(`lib/chat/media.ts`) with nothing stored. Every item lands on the
line it came from; a subagent's lands on its `Agent` row. It takes the same
slot as the table of contents and the two are exclusive — two columns leave a
narrow pane no transcript. That slot (`SideColumn`) is dragged wider by its
left edge, 200–560px and never past half the pane, one width for both columns
and every chat, this run only; a double-click puts it back to 240.

### `/` in a chat's composer

At the head of a message only, `/` lists the slash commands the user's CLI would
run in this project (`supportedCommands()`, asked on the first `/` and held per
project). Everything goes to the CLI verbatim except two that are this app's:
**`/clear`** empties the lines **and** closes the session (same id, tab and
title), and **`/rename`**. A short `HIDDEN` list drops terminal-only commands and
ones the toolbar already covers.

### The context window, and compaction

The toolbar meter shows **room left before auto-compaction**, draining, read
against the auto-compact threshold rather than the window
(`getContextUsage()`, once a turn). Compaction itself has no progress events,
so it stays a spinner with a clock, never a percentage. The CLI's own spinner
also counts the summary's `↓ tokens`, but it never sends that count, or the
summary's stream, to the SDK. Its boundary is a rule across the transcript,
never folded. Every failure to refresh the meter is swallowed — it keeps the
last number.

### The plan's own limits

Beside it, how much of the claude.ai plan's five-hour window the chat's account
has used, with every window in a popover (`main/plan-usage.ts`, asked of the
CLI with the profile's `CLAUDE_CONFIG_DIR`, held a minute per account). The
request is experimental in the SDK, so the answer is narrowed field by field and
a missing method is not an error. Nothing is drawn for API-key accounts.

### Moving a chat to another account

Picking another account in the composer writes an `account` line into the
transcript — `You moved this chat to work@example.com` — in main's
`setOptions`, so it is on disk and in the export, not only on screen. A line
for the reason the compaction rule is one: the turns above it ran on another
login, and somebody scrolling back past a limit is owed the boundary. It keeps
the profile's **name at the time**; the pane draws the address instead when
this run has already checked that login, and never starts a `claude` to find
out. A move before the first message writes nothing — there is nothing above it
to divide.

### A turn a plan limit stopped

The CLI says it twice — a `rate_limit_event` naming the window and its reset,
and an assistant message flagged `rate_limit` with a sentence of its own.
`limitOf` in `claude-agent.ts` reads them into one `limit` line (amber, `Stopped.
you@example.com reached its 5-hour limit · resets in 3h 8m`) **in place of** the
red error line, and the CLI's sentence is not drawn as a reply. `done` still
carries it as an error, so the notification and the unread mark behave as for
any failure.

Moving a chat **that is sitting on that line** to another account carries the
turn on at once (`stoppedOnLimit`, `Chats.setOptions`): the session reopens
under the new `CLAUDE_CONFIG_DIR` with the transcript carried, and the CLI is
told the last turn was cut short (`CARRY_ON`) — a message with no line of its
own, since nobody typed it; the `account` line says `· picking up where it
stopped` instead. Only off a limit, and only while nothing is running: an
ordinary move still waits for the next message, because carrying on a turn
that had finished would be a turn nobody asked for.

### Finding a line in the chat on screen

`⌘F` is a find bar over the transcript (`chat-find.tsx`,
`lib/chat/search.ts`): the query as typed, case ignored. Matches are
painted with the **CSS Custom Highlight API** (`find-marks.ts`) — no DOM touched
inside rendered markdown. `n of m` counts **occurrences**, read off message
text so a match inside a shut fold still counts; the fold gets a ring. Only the
two voices are searched. The key is claimed only while the chat pane is showing,
since elsewhere it is CodeMirror's.

### Replying to a part of what was said

Selecting a run of the transcript shows `Reply`, which types it into the
composer as a `>` quote, unsent (`quoteOf`, tested).

### Diagrams in a reply

A ` ```mermaid ` fence in a reply is drawn as its diagram
(`lib/markdown/mermaid.ts`), with a View on hover that opens it large in the
dialog a table's View uses. The fence's `<pre>` is hidden, not replaced, so the
frame's Copy still copies the source and `⌘F` still finds its words; a fence
that does not parse — one still streaming in, or one the agent got wrong —
stays code. Mermaid is a dynamic import (it was in the bundle already, through
Excalidraw), rendered with `securityLevel: "strict"`, one render at a time
because its config is global, and each SVG cached by source and theme because a
streaming reply rebuilds its DOM on every chunk. A diagram keeps the theme it
was drawn in until its message re-renders. Only the chat's Milkdown path draws
them; a `.md` file's preview (BlockNote's path) does not yet.

### The chat's browser

A page beside the conversation that the chat's `claude` drives and the user
watches: the globe in the chat's header, or the first browser tool a turn
calls, opens it (`chat/chat-browser.tsx`, `lib/browser/store.ts`). **Tabs**, per
chat, in a strip over the page (`+`, a close per tab, a middle click), each
with a bar of its own (back, forward, reload, an address field that searches
what is not a URL — `browserUrlOf`, tested); a resize handle on the panel's
left edge. Closing the last tab closes the panel. While a tool is moving it,
the page is ringed and says what `claude` is doing, so the pointer is never
mistaken for the user's.

**It reverses `Preview, removed`** (§ Removed), and the difference is the
argument: that was a `<webview>` of a dev server for somebody to read, which is
what their own browser is for. This is the one thing their browser cannot be —
a page the conversation can act on and they can see it act on. The tools that
already exist for that (a Playwright MCP) open a window of their own, out of
sight of the chat that is driving it.

- **The tools are an in-process MCP server** (`main/browser-hub.ts`,
  `createSdkMcpServer`): `tabs`, `navigate`, `back`, `snapshot`, `screenshot`,
  `scroll`, `click`, `type`, `press_key`, then `reload`, `hover`,
  `wait_for`, `console`, `select_option` and `evaluate`, wire names
  `mcp__vey_browser__*`. It
  is the first server this app serves since the three that went with the
  Database, API and Notes panels, and it is unlike them in the way that
  mattered: an SDK server's config on the CLI's command line is a name and a
  type, the calls come back over the control channel, and there is no port and
  no secret for another process to find. One instance per session, with the
  chat as its closure — a call can only reach that chat's page.
- **What the CLI is handed stays identical**: the fifteen definitions are the
  same on every turn of every chat, so they sit in the cached prefix like the
  CLI's own tools. Which mode may call which is `permits`: `Plan` and
  `Read only` get the ten that look (`BROWSER_READ_ACTIONS` — `navigate` is a
  `WebFetch` somebody can watch, `reload` the same fetch again, a hover what a
  passing pointer opens), `Edits` gets all fifteen without asking, `Ask` asks
  about each like the plain CLI.
- **The last six came after the first nine**, for one reason: each was a
  point where a turn left the chat's browser for a Playwright MCP — the window
  out of sight this browser exists to replace. Trying a colour on the live
  page (`evaluate`), reloading after an edit the dev server did not push
  (`reload`), a menu that opens on hover (`hover`), a `<select>`, whose list
  is a native popup `sendInputEvent` cannot reach and so is set in the page
  with `input`/`change` dispatched (`select_option`), a single-page app still
  rendering (`wait_for`, polled from main so a navigation mid-wait is a no
  rather than a failure), and the error the page threw (`console` — buffered
  per guest from its first attach, since the error worth reading is the one
  logged while the page loaded; 200 lines, forgotten once read). Network
  requests, file uploads and dialogs are still not here: each needs a CDP
  session kept attached, which the first nine were built to do without.
- **`evaluate`** runs in the page's
  main world like the snapshot does, and is kept off the read-only list: a
  script can do anything the page's own can. Whether the text is an
  expression, a function or statements with a `return` is decided by parsing
  it in main (`evaluationOf`), never by trying it twice in the page, where a
  first attempt that failed half-way would already have changed it. The
  script is pasted into the source rather than `eval`ed, so a CSP without
  `unsafe-eval` does not stop it.
- **The tools act on the shown tab**, and only that one: what `claude` drives
  and what the user is looking at are never two different pages. `tabs`
  lists, opens, shows and closes them by their number in the list. The tabs
  are the renderer's — a tab is a `<webview>`, and only it can make one — so
  `BrowserHub` keeps each chat's attached pages in the strip's order and which
  is shown, learns of a pick through `browserFocus`, and asks for a tab made,
  shown or closed through `browser:command` (`BrowserCommand`), waiting for
  the attach that answers. A popup (`target=_blank`, `window.open`) is a new
  tab of the same chat, made the same way (`onPopup`). When the shown tab's
  page has gone, the hub moves to another and tells the strip.
- **The page is driven from main** (`main/electron-browser.ts`). Reading is
  `executeJavaScript`: every interactive element numbered and the ref written
  onto it (`data-vey-ref`), so `click e12` finds exactly that element, plus the
  page's `innerText`. Acting is `sendInputEvent` — a real `mousedown`/`mouseup`
  at the element's centre, keys with their `char` — so the page sees what it
  would from a person. No CDP session is kept attached. Shadow roots and frames
  are not walked.
- **The `<webview>` lives in `ChatPane`, not in the conversation**, because the
  conversation remounts per chat and a remounted page is reloaded from nothing.
  Each chat's page stays mounted for the run once opened; the ones not on screen
  are laid out at full size and hidden, so a tool can still drive and
  screenshot one while somebody reads another chat. Closing the panel hides it.
- **Locked down in main** (`guardWebviews`): `webviewTag` on the studio's window
  only, and every guest attached with no preload, no Node, sandboxed and
  isolated, in its own `persist:vey-browser` partition — one profile shared by
  every chat and kept across launches, so a site signed into once stays signed
  in, apart from the studio's own session. The partition is set on
  `will-attach-webview`'s **web preferences**, not its `params`: Electron
  copies the tag's `partition` into the preferences before the event fires and
  builds the guest from them, so a `params.partition` is ignored — which for a
  while left every tab in the studio's default session and every imported
  cookie in a partition nothing read. Only `http`, `https` and
  `about:blank` load; a popup is a new tab. `browserAttach` is checked
  against the caller: only a `<webview>` of the asking window can be handed to
  a chat's tools.
- **Cookies can be imported** (`Import cookies…` in the panel's `…`,
  `cookie-import-dialog.tsx`), **straight from a browser on this machine** —
  pick the browser and its profile by the name the user gave it, then the
  sites — or from an exported file. Into the one shared profile, set one at a
  time so what Chromium refuses costs only itself; expired ones are skipped.
  `Keep me signed in between sessions` off imports them as session cookies,
  gone when the app quits.
  - **From a browser** (`main/browser-import.ts`, tested): Chromium's family
    (Chrome, Brave, Edge, Arc, Vivaldi, Chromium) and Firefox. The profiles
    come from `Local State` / `profiles.ini`, the site list off the cookie
    database's **hosts alone**, grouped by site (`siteOf`) — nothing
    decrypted yet. Only the sites ticked are decrypted, and that is when macOS
    asks for the keychain (`security find-generic-password`), which the
    dialog says before it happens. Chromium's values are AES-128-CBC under a
    PBKDF2 key from that password; from database version 24 each carries its
    host's SHA-256, which is checked. Read through `node:sqlite` out of a copy
    of the database, since the browser holds it locked. **Not Chromium on
    Windows**: Chrome 127 bound its key to Chrome itself (App-Bound
    Encryption), and nothing else can unwrap it. Safari's store needs Full
    Disk Access; not read.
  - **From a file** (`main/browser-cookies.ts`, tested): a JSON array as
    Cookie-Editor and EditThisCookie export it, Playwright's `storageState`,
    or `cookies.txt` — for what cannot be read directly.
    **What an import has to get right, learned off one real profile** (1,905
    cookies): a third of the cookies without `Secure` were still set by an
    HTTPS page, and Chromium **binds a cookie to the scheme it was set
    through** — set through `http://`, the `https://` page never received them
    and the site stayed signed out. So a cookie goes in through the scheme the
    browser recorded (`source_scheme`, Firefox's `schemeMap`), and with no
    record through HTTPS except on this machine (`schemeOf`). A **session**
    cookie, under `Keep me signed in`, is given Chromium's 400-day ceiling
    (`keptAs`) — Chrome keeps one alive the same way when it reopens where it
    left off, and imported as a session cookie it went at the first quit.
    **Partitioned (CHIPS) cookies are left out**: Electron cannot set one
    partitioned, and unpartitioned it is a third-party cookie sent from every
    site. The result says the already-expired apart from what was left out,
    since one "skipped" number read as a failed import. A sign-in held in
    `localStorage` or IndexedDB rather than a cookie is not brought over at all.
    It began as the file alone, on the argument that reading a browser's store
    is asking for all of it to get one site's sign-in. The site step is the
    answer to that: the user still says which sites, and only those are
    decrypted.
- **Clearing cookies** (`Clear cookies…` in the same menu,
  `cookie-clear-dialog.tsx`) lists the sites the shared profile has cookies
  for, grouped as the import groups them, to tick and sign out of. Every site
  ticked is sent as **all** (`null`), which clears the profile's storage too —
  a site that keeps its session in `localStorage` is not signed out by its
  cookies going. Main clears everything only for an explicit `null`; a
  malformed call clears nothing. It signs every chat's browser out at once,
  since the profile is theirs together, and the dialog says so.
- **Annotating a page, into the chat** (`chat/browser-annotate.tsx`,
  `lib/browser/annotate.ts`, tested): the square-pointer button in a tab's bar
  puts a toolbar over the page — `Select element`, draw, rectangle / ellipse /
  arrow, text, colour, stroke, undo, redo, clear, `Add to chat`. A picked
  element is asked of the page under the pointer (`browserInspect`) and
  marked with a number. `Add to chat` captures the tab in main
  (`browserCapture`, the guest alone, without the overlay), paints the marks
  over it at that scale with the same `paint` the screen uses, and delivers
  **the picture alone** — picked elements numbered on it — into that chat's
  composer through `composer-bus.ts`'s `deliverTo`. It carried a note of the
  address and each element's selector at first; that was taken off, since
  what the picture is about is the user's to write. **Not sent**: the question is the user's
  to write. Drawn over the `<webview>`, not injected into the page, so a site
  that is not this app's is never touched; the page is frozen while the
  toolbar is up, since a mark is drawn where the page was.
- A tool for a chat with no tab asks the window to open one (`open`) and waits
  15 s for the attach. A chat that has never been on screen in the
  studio's window has nowhere to draw one, and the tool says so. A popped-out
  chat has no browser.

## Bots

A saved prompt sent into a **new chat of its project** on a schedule
(`main/bots.ts`, `shared/bots.ts`, `components/studio/bots/`,
`lib/bots/store.ts`; `test/bots.ts`). Asked for by the person using the app,
on the model of Grok's scheduled tasks. A project's `Bots` button, beside
`+ Chat`, opens its `Bots` tab: each bot with its schedule, its next run, `Run
now`, a switch, and its last runs, each a link to the chat it opened.

**Why this is not a helper turn.** The rule this app holds — no feature calls
the CLI as a helper, because a helper turn is a turn nobody asked for — is
about turns nobody can see and nobody asked for. A bot is asked for, in
advance, in words somebody wrote, and every run is an **ordinary chat** made
through the same `Chats.create` / `send` a `+` is: listed in the column,
unread when it answers, notified, readable and continuable. Nothing about a
run is hidden — the quiet sentence below included, which is on the user line.
What was deleted under that rule stays deleted: the ClickUp watcher's agents
(a second account of a tracker, a poll always running) and pipelines (chats
chained into stages). A bot is neither — it reads nothing in on its own, and
one run is one chat.

**Local, and only while the app is running** — which, since closing the
window on macOS now leaves it in the menu bar (§ The menu bar, for bots), is
until ⌘Q, and with `Open at login` across a restart. The alternative was the CLI's own
cloud routines, which run with the machine off but on a clone, without this
machine's MCP servers, `gh` login, `.env` or the chat's browser cookies — and
those are what the uses worth having need: a morning brief off the tracker
through the user's own connector, a pre-read of the reviews waiting on them,
standup notes off their own commits. Those are the three starting points the
empty tab offers (`lib/bots/templates.ts`), and their prompts are English for
§ Language's reason. A missed time — the app shut, the Mac asleep (a
suspended timer fires late) — is owed **one** run, the latest
(`latestDue`), marked `catch-up`: a weekend asleep is one Monday brief, not
six. While a run works the machine is held awake like any chat.

**Two schedule shapes, no cron line**: a time of day, or every 1–12 hours on
the hours that divide 24 from local midnight — each on chosen weekdays.
`lastDueAt` is what the next tick counts from, and anything that moves when a
bot runs (a new schedule, switched back on) moves it to now, so an edit at
08:31 does not owe the 08:30 it just passed. A run is **skipped**, and says
so, while the bot's previous one is still working.

**Quiet runs.** The risk of this feature is noise — a bot whose chats nobody
reads is the stale half the board was. With `quiet` on (the default) the
message ends with one sentence asking for `NOTHING_TO_REPORT` as the last
line when nothing needs attention (`QUIET_ASK`), and a run whose reply ends
on it (`isQuietReply`, read at quiet, not `done`, for `main/notify.ts`'s
reason) is **neither notified nor left unread**: main holds the `done` notice
of a run in flight (`Bots.holds`) and rings it only for a run that reported,
and the renderer takes the dot off on the push that turns a run `quiet`. The
chat is still in the column, for anybody who wants to check.

**Never `Ask`**: nobody is in front of a run to answer, so the form offers
`Plan` / `Read only` / `Edits` / `Full access` and main narrows `ask` to
`read`. A run that stops on a question anyway — an `Edits` MCP call — is a
chat in `Needs you`, which is exactly what that section is for. A bot whose
checkout has left the workspace is kept and passed over.

## The dock

A tab per shell and a `+`, under the pane. **Collapsed, not unmounted** — a pty
taken out of the tree ends — and it collapses to **nothing**, the way the
projects column does. It used to collapse to its own tab row
(`DOCK_STRIP_HEIGHT`) as the way back, which kept 36px of the pane's height for
a row that only reopened the dock; the rail's Terminal button and `⌃\`` already
are the way back. Dragging it shut is the same as the chevron. `⌃\`` toggles it,
even from inside a pty.

### Terminal

Any number of shells per project, a tab each, named for the directory the shell
is in now (asked of the kernel off the pty's pid, once output goes quiet after
Enter). Picking a project in the rail points the dock at it; the pty starts
only when the tab is shown. A folder in the file tree has `New terminal here`,
which opens the shell in that directory instead of the project's root (`dir` on
`terminalCreate`, checked to be inside the folder). Shells are not restored
across a launch. ptys live in a detached per-machine daemon (`main/daemon.ts`).

**The strip is the project's.** It used to hold every project's shells at
once, so a dev server per project was a row of `vite` tabs that said nothing
about which repository each ran in. It draws only the active project's shells
and its worktrees' now (`lib/shell/scope.ts`, `test/shell-scope.ts`), scoped
the way the tab strip is and lifted by the same `allProjectTabs` setting. Only
the strip: another project's shells stay mounted, their commands running, and
coming back to a project lands on the tab last picked there. Opening the dock
onto a project with none starts one; clicking a project while it is open does
not — the strip is empty and the `+` is the way in, for the same reason a
click must never start a pty.

A tab can be **renamed** — double-click it, or `Rename` in its right-click
menu — and a typed name then wins over the cwd; emptying it hands the tab back.
`⌘K` clears (macOS only: elsewhere `Ctrl+K` is readline's), and `⌃⇧\`` opens
another shell beside `⌃\``'s toggle.

**A path in the output is a link**: `⌘`-click (`Ctrl` elsewhere)
`src/app.ts:42:7`, tsc's `src/app.ts(42,7)`, a stack frame or a Python
traceback's `File "…", line 12`, and it opens in the editor at that line.
A modifier rather than the plain click the web links take, because paths are
most of what `git status` and `ls` print and a click to focus the shell must
not open a tab. Candidates are found by `lib/shell/file-links.ts` (tested),
read from the shell's cwd, and each is asked of main through
`resolveRelativePath` — the workspace's file gate — before it is marked, so a
path outside the folders, a directory, or a word that only looks like a path
is never a link. A link is **coloured as soon as it is printed**, in the
theme's blue, not only underlined on hover: rows are scanned as xterm redraws
them (`components/studio/terminal-file-links.ts`), re-asked only when a row's
text changed, with main's answers cached briefly. The alternate screen — vim,
`less`, a TUI — is left alone, and a path broken by a wrapped row is not joined.

## The tab strip

One strip for the whole workbench; `lib/panels.ts` holds each panel's tab rules
(`PANELS`), and `tabOrder` the order across panels. Closing a panel's last tab
hands over to the neighbour, whichever panel it belongs to (`neighbour`). The
strip is restored on reload, each record reconciled against what exists. Panels
and tabs switched away from are **hidden, not unmounted**, so scroll, undo and
carets survive — except the diff (see below).

### One project's tabs, or every project's

A file, a chat and a `Changes` tab belong to a project (`rootOf`), and by
default the strip holds only the active project's; the rest stay open and come
back with their project. Settings › Tabs & editor › **Show tabs from every
project** (`allProjectTabs`) lifts that in `inScope`, so the strip, the pane,
`⌘W`, a drag and Close All all see every project's tabs; picking one moves the
active project to it. A `Changes` tab adds its project's name in that mode.
Turning it off closes nothing — `reconcileScope` moves the pane back into the
active project.

### The preview tab

A single click in the tree opens an italic **preview** tab that the next single
click replaces; a double click or a keystroke keeps it. Only the tree previews.

## Search

**`⌘P`** opens everything this window can open — files and chats. It only
opens things; there is no commands half. Files come from an index walked the
every time the palette opens (skipping `IGNORED_DIRECTORIES`, capped at 20,000)
— the list already held stays up until the walk lands, so a file created since
the last open is found without Refresh. It is also re-walked by Refresh and when
a folder is added or removed, and cut to a
shortlist by a subsequence pass before cmdk ranks them.

The walk also skips what the repository's `.gitignore` names. This reverses
an earlier choice: the index used to be the fixed list alone, because reading
`.gitignore` meant parsing it, with its nesting and negation. It is not parsed
here. `git ls-files --others --ignored --exclude-standard --directory` is asked
once per walk (`ignoredPaths` in `git.ts`), so git's own reading is the only
one. A folder that is not a repository answers nothing and keeps the fixed list.
The tree still shows everything, so an ignored file is a click away, not lost.
Find in files walks the same index and skips the same paths.

### Searching inside the files and the chats

The left column's **Search** (`⇧⌘F`): one query with `Aa` / `ab` / `.*` over
every file in the workspace and everything said in every chat
(`main/content-search.ts`, tested). It reverses two earlier deletions on
purpose, paying their costs deliberately: one channel with a **generation** so
an older search stops, a list (git's own `ls-files` in a repository) and a read
per search with nothing indexed, binary and >1 MB files skipped, a 2,000-match
cap, and transcripts not made resident. A chat hit opens that chat with its
`⌘F` bar on the occurrence.

Under the field: `All` / `Chats` / `Files`, **this project only** (the
column's `activeFolderId`, read at each search, so switching project re-asks),
and VS Code's `files to include` / `files to exclude` globs (`pathFilterOf` in
`shared/search.ts`), applied to the walk before anything is read. The result
list is one flat run of rows, so `↑`/`↓`/`←`/`→`/`Enter` walk what is on screen,
and `F4` / `⇧F4` step through the matches while the column shows Search.
Before anything is asked the empty list says those keys (`SearchHints`), since
none of them is on screen until there is a result to walk. A file's match shows
its line number in an editor's gutter position, and an empty answer names the
query and any filter narrowing it, because a filter that is on is otherwise
silent about what it removed. The field's `✕` clears it; Esc does the same.

**Replace** is the one write here, and it is files only — what a chat said is a
record. The rows draw each match struck through beside what it becomes,
expanded by the same `shared/search.ts` main writes with (`$1`, `$<name>`,
`$&`, `$$`). `Replace all` asks first, and a file's row replaces just that file.
Main reads and matches each file **again** rather than trusting the search's
offsets, refuses what the search skips plus anything that is not UTF-8 (it would
be rewritten whole), and a file with unsaved edits is left out by the renderer
and said to be. Open tabs are re-read through `syncPaths` straight after.

## The window shortcuts

`⌘P`, `⇧⌘F`, `⌘F`, `⌘W`, `⌘S`, `⌘B` and `⌃\`` are `keydown` listeners in the
renderer (`lib/shortcuts.ts`), not menu accelerators, because each needs
something only the renderer knows. The menu lists them with
`registerAccelerator: false`. Closing the window is `⇧⌘W`. Off macOS the
dock's shell keeps `Ctrl+P`/`Ctrl+W`(readline's).`⌘B`is refused inside`contenteditable`, where it means bold. `⌘⇧[`/`⌘⇧]`and`⌘1`–`⌘9` walk the
strip.

## Settings

A dialog (⌘,), applied as picked — no Save. Sections: **Appearance**, **Tabs &
editor**, **Plugins**, **Updates**.

**There is no Chats section any more.** It held two rows: the notification
switch, deleted (§ The notification), and the model and account commit drafts
run on, which moved beside `Draft` (§ Committing).

**There is no Claude section any more.** It held the named profiles, each a
`CLAUDE_CONFIG_DIR`, with a status per row — and the one
thing anybody did there, signing a profile in after seeing it was not, was a
dialog away from the projects column's Accounts foot, where `Not signed in` was
actually being read. So the foot is where accounts are managed
(`project/accounts.tsx`): `+` beside the heading adds an account (§ Adding an
account, below); a row that is not signed in carries `Sign in`; a
click or a right-click on any row gives `Sign in…` / `Sign in as another
account…`, `Check again`, `Rename` (in place) and, for a profile, `Remove…`
(confirmed — chats on it fall back to the default login). The **default
login** — `~/.claude`, the one the user's own `claude` uses — is named by its
email once read, `Default account` until then (`defaultAccountName`; it was
`This account`, which said nothing in a list of accounts). It has no profile
record, so a name given to it is a setting, `defaultAccountLabel`, and
renaming it to nothing gives it its email back. Its last row, the model and account **commit message drafts** run on, moved
to Chats and then beside `Draft` (§ Committing).

The app names the directory (`workspace/claude-profiles/<slug>`, in main,
because the renderer cannot see `VEYSTUDIO_DATA_DIR`) and runs `claude auth
login` in a pty with that directory set — on the command line too, since a
`.zshrc` export would otherwise win. Whether a directory is signed in and as
whom is **asked of the CLI** (`claude auth status --json`); a missing directory
is never spawned into, since the CLI would create it. The composer's account
menu shows each profile's email.

### Adding an account

`+` and a row's `Sign in` open **one dialog for the whole login**
(`LoginDialog`, `project/account-login.tsx`). It asks first for the kind of
account — subscription, Console or SSO — and `Continue in browser`. Those are `claude auth login`'s own flags
(`--claudeai` / `--console` / `--sso`), so the question the CLI used to ask with
the arrow keys is answered before it starts, and nothing is left for its
terminal but the browser. **There is no email field**: the CLI's `--email` only
fills in the sign-in page, it does not choose which account signs in, and the
row is named after whoever did sign in anyway — a field that asked for an
answer nothing used was taken off.

**The same dialog then shows the login as two steps**: finish in the browser,
with the page's link written out beside `Copy` and `Open page`, and, if the
browser shows a code, paste it here. The code is written into the CLI's prompt,
for when the page cannot reach its localhost redirect and shows a code instead.
**The field is always on screen while the CLI waits**: it was behind a `Paste
code` link at first, and somebody holding a code from the browser did not find
where it went. **A code the CLI refuses is said under the field**, in the CLI's
own words (`Invalid code. Please make sure the full code was copied`), read off
what the pty printed after that code was sent (`loginErrorIn`). Before this, a
wrong code got no answer anywhere except the CLI's folded screen. The line a
failed login exits on (`Login failed: …`) is read the same way, so a failure
reads as the CLI's sentence rather than an exit code. Under the steps, the
CLI's own screen folds open in the dialog.
It closes by itself once the account has signed in.

That is the third shape. The first was a terminal in a dialog, which blocked
the studio for a step that happens in the browser. The second was a popover,
then a few lines under the row, and that was too small to follow: the code
field was a sliver of the column, and `Open page` / `Copy link` were links
nobody read as steps.

**The list shows nothing of a login until it has worked.** The second shape put
a dashed row where a new account would land, and kept the login running
after its dialog was closed, with a line on the row to open it again. That was
two places telling one story, and a row that was not an account yet sat among
the accounts. Now the dialog is the only place, so **closing it cancels the
login**: Escape, `×` and `Cancel sign-in` all kill the pty. A login left
waiting with nothing on screen to say so would be a `claude` nobody could find.
A click outside is ignored while a login runs, because a stray click should
not throw a half-finished sign-in away.

**A new account is written down only once it has signed in.** It used to be
saved on `+` and signed in after, so a login somebody closed left a `Profile 2
· Not signed in` row for ever. Now `claudeLogin` takes `configDir: null` for an
unsaved profile and main names the directory then (`Store.newClaudeProfileDir`,
clear of the saved profiles' and of other logins in flight); the profile is
saved with it when the CLI exits signed in, **named after the account** — its
email, then its organisation — rather than `Profile 2`. A cancelled login's
directory is left where it is, like every other directory of a user's.

**The duplicate check is against the browser.** claude.ai still signed in as
the first account approves the second login as that account, in one click
nobody reads. So a login that comes back as an email and organisation already
on the list is not saved: the dialog says `Same account as …`, with `Try again`
and `Keep anyway`, and its first step says so beforehand. One email in two
organisations is two accounts.

**The URL is read off the pty, and only read**: an OSC 8 hyperlink's target,
or the text with a hard-wrapped address joined back up
(`lib/chat/claude-login-text.ts`, `test/claude-login.ts`). The CLI owns its
screen; a URL not found costs the dialog `Open page` and `Copy link`, and the
CLI's own screen under the steps still has its words. The pty is started 200 columns wide for
that reason, while nobody is looking at it.

**A row carries what its account bills against** (`accountKindOf`), beside
its name: the plan for a subscription (`Pro`, `Max`, `Team`, `Ent`), quietly,
and `API`, tinted, for a Console login — which pays per token and has no
windows, so its row has no meters and without the badge reads like one not
read yet. Read off `claude auth status`'s own `authMethod` (`claude.ai`,
`api_key`, `oauth_token`, `third_party`). **SSO gets no badge**: it is a way to
sign in to a subscription or a Console organisation, not a third kind, and the
CLI does not say it was used.

The first-launch setup still signs the default login in through
`ClaudeLoginDialog`, a terminal in a dialog, since that page has nothing else
on it to keep usable.

**Background** (Appearance) is one picture behind the whole window — the
canvas the cards sit on. Chosen in the OS picker and **copied** into
`workspace/app-background/` by main, like a project's icon, so the file need not
stay where it was picked and the studio never reads a path the renderer named.
It comes back as a `data:` URL on every launch (`appBackground`), held in
`useAppBackground` (`lib/app-background.ts`), not in `workbench.settings`, which
is rewritten whole. With a picture, each card goes translucent (`.studio-card`
in `globals.css`) so it shows through the card's edges as well; the cards'
contents keep their own opaque surfaces so text stays readable. Capped at the
image-preview ceiling, 20 MB. Not drawn in the popped-out chat window.

### Language

**Language** (Appearance) is `System`, English or Tiếng Việt, kept as
`language` in `workbench.settings`; `System` reads `navigator.language`, which
in Electron is the OS's. `lib/i18n` is written here rather than taken from
i18next: what the UI needs is a key looked up and a `{name}` filled in, and
Vietnamese has no plural forms, so English's one rule — a `_one` sibling read
when `count` is 1 — is the whole plural engine. The dictionaries are a file per
area of the window (`lib/i18n/en/<area>.ts`), English being the shape every
other one is typed against, so a missing key fails `typecheck`;
`test/i18n.ts` catches the one thing the types cannot, a placeholder renamed on
one side.

The **first launch** offers it too, as a pill in the corner of the setup screen
from its first page (`LanguagePicker` in `claude-setup.tsx`): somebody who
cannot read the screen has to be able to change it before reading anything on
it, and Settings is behind the whole of the setup and the tour. It lights the
locale in use, so a `System` that came out Vietnamese shows Vietnamese; a pick
there is written down as that locale.

The language is the **UI's**, not the conversation's. Nothing sent to `claude`
is translated — the system prompt, a mode's sentence at the head of a message,
`Continue.` — because those are instructions to the model, identical on every
turn for the cache's sake (§ The chat is hosted, not tailed), and the model
answers in whatever language it is written to. Git's own verbs (commit, push,
stage) stay English inside Vietnamese sentences, the way Vietnamese developers
say them. Not every surface is translated yet; an untranslated string is simply
English.

### Signing in, removed

There was a Google sign-in until 2026-10-28, and it existed for one thing:
Pro belonged to the Google account that paid, so another machine got it by
signing in as the buyer. It ran in the user's own browser on the studio's
server — Google will not sign in inside an embedded browser — with a nonce the
app polled for (`main/google-sign-in.ts`, through `net.fetch` so the asking
went the browser's way), a ninety-day session in `localStorage` read by
`lib/session.ts`, hour-long access tokens held and renewed by
`main/studio-server.ts`, and an avatar menu at the foot of the rail
(`account-menu.tsx`). Before that it was Firebase, and before that a server on
`localhost` per attempt.

**It is deleted, app and server**: the four `auth:*`/`studio-server:session`
channels, `lib/account.ts`, `lib/session.ts`, the account menu and its avatar,
`test/google-sign-in.ts`, `test/account-session.ts`; on the server `/signin`,
`/api/signin`, `/api/session`, `auth.ts`, `session.ts`, `signin.ts`,
`google.ts`, the welcome mail and the OAuth client. Pro had gone per device,
carried by a licence key (§ Pro, removed), so a sign-in for nothing else was a browser
round-trip, an OAuth client and a signing secret to keep, and an account
somebody had to make before they could pay — the one step most likely to
lose a sale. Pro itself is now deleted too. What is on disk stays: a session
in `localStorage`, the `users`
table and its `VEY1` keys are read by nothing.

### Custom API endpoints

**A custom API profile** is an account that is an Anthropic-compatible
endpoint rather than a login (`main/claude-api.ts`) — a GLM, Kimi or DeepSeek
coding plan, OpenRouter, a company's gateway, run otherwise by hand-editing
`ANTHROPIC_BASE_URL` in a shell profile. It was Vey Pro's for a day
(2026-10-28) and made free the same day: a `claude` is handed the login
shell's whole environment, so a gate anybody could step round with one line in
`~/.zshrc` was a gate on the honest only.

**A custom API profile** is a `ClaudeProfile` with `api` set: its own
`CLAUDE_CONFIG_DIR` like any account (its own history and settings) and no
login. Its key is never on the profile list, which the renderer owns and
`claude-profiles.json` holds whole: it crosses once, on
`IPC.saveClaudeApiProfile`, is sealed by `Host.seal` (Electron's
`safeStorage`, the keychain's key) into the setting `claudeApi.token.<id>`,
and is read back only by main. Every `claude` reaches its profile through
`accountEnv(configDir)`, so `listProfiles` in `ipc.ts` hands the endpoints to
`claude-api.ts` by directory each time the list is read, and `accountEnv`
adds them — `ANTHROPIC_BASE_URL`, the key as `ANTHROPIC_AUTH_TOKEN` (a
`Bearer`, which is what these endpoints document), `ANTHROPIC_API_KEY` blanked
so a shell's own is not sent to a stranger, and the model for `opus`/`sonnet`
and the fast one for `haiku`. The endpoint is hashed into a session's
`signatureOf`, so a new key is a new process. `claude auth status` has
nothing to say about such a profile; main answers its row itself
(`method: "custom_api"`, the endpoint's host as the organisation), and the
plan meter is skipped. The form fills the base URL from a short list of
providers and leaves the models to the provider's own guide: model names move
faster than this repository would.

### Pro, removed

**The app is free, all of it** (2026-11-03). Vey Pro was the one thing sold,
and it is deleted along with everything that sold it: `main/license.ts`,
`main/machine-id.ts`, `shared/license.ts`, `lib/license.ts`,
`lib/studio-server.ts`, `pro-dialog.tsx` and the title bar's `PlanBadge`,
the onboarding's Pro line, the seven `pro:*` / `studio-server:available`
channels, `test/license.ts`, and `serverCall` / `openServerPage` in
`main/studio-server.ts`, which keeps only `serverUrl` for the usage counts.

What Pro was, in the order it was tried, so the argument is not had again:
credits reselling Anthropic's API (§ Credits and the free AI, removed); a
second account, which gated the one thing anybody installs this app to do;
the custom API, free the same day (§ Custom API endpoints); a second
project, with every project past the first locked on a Free device; then the
free models (§ Free models, removed). Alongside: a per-device licence key
(`VEY-XXXX-…`) carrying an Ed25519-signed activation verified offline, paid by
VietQR and then by card through Polar, promo codes, and a thirty-day trial per
machine started by the server off a salted hardware id. Each gate either
stood in front of the value or could be stepped round, and the repository is
to be open-sourced, where a licence check is one line to delete.

**What is on a user's disk stays**: the settings `pro.device`,
`pro.activation`, `pro.key`, `pro.trial` and `pro.trialEndsAt`, and a
`workspace/claude-profiles/_free-models` directory, are read by nothing and
deleted by nothing. The server's half — `/api/license*`, `/api/trial*`,
`/api/free`, the Polar webhook and the order pages under `vsclaude-cloud/` —
is no longer called by this app.

### Free models, removed

**OpenRouter's free models on the studio's key** (2026-11-03, deleted the same
day as Pro): one `Free` account main put on the profile list whenever the
device was Pro (`FREE_PROFILE_ID`, `freeProfile` in `listProfiles`), a custom
API profile whose base URL was the server's `/api/free` and whose key was the
device's signed activation, its model list the server's (`agentModelsOf`).
Main refused a turn on it off Pro through `ChatSource.refusal`, the only
refusal that hook ever carried, so the hook went too. Deleted with
`shared/free-models.ts`, `test/free-models.ts`, the `Free` row's special
cases in `accounts.tsx` and `ipc.ts`, and the filter that dropped the
profile-per-model a first build had stored (`isFreeModelsUrl`): such a
profile, if anybody kept one, is now an ordinary custom API row pointing at an
endpoint the app no longer vouches for, and can be removed like any other.
Somebody who wants OpenRouter's free models adds OpenRouter as a custom API
endpoint with their own key.

## Plugins

Obsidian's model, not VS Code's. A plugin is a directory — `manifest.json`,
`main.js`, optionally `styles.css` and an icon — in one of two folders. The **built-in** one
ships inside the app: `plugins/<id>/src/main.ts` in this repository, bundled by
`scripts/build-plugins.mjs` into `dist-plugins/` and carried as an
`extraResources` entry; a plugin there is **on until switched off**
(`plugins.disabled`), since it is a feature the app always had. The **user's**
is `workspace/plugins/<id>/`, and a plugin there is **off until switched on**
(`plugins.enabled`). Two lists rather than one of everything on, so a built-in
plugin a later update adds starts on without anybody's saved list naming it. A
user's folder cannot take a built-in id (`listAllPlugins`). A built-in plugin
carries an **official** badge (`OfficialBadge`) in the Plugins view and the palette —
read off which folder main found it in, never off the manifest's `author`,
which any plugin could fill in.

**A plugin made outside the app is installed, not dropped in.** The Plugins
view has `Install from folder…` and `Install from .zip…`
(`main/plugin-install.ts`), and the marketplace, when there is one, will
download an archive and hand it to the same `installPlugin`. An install
**copies the files that are served** — `manifest.json`, `main.js`,
`styles.css` and the manifest's icon at its path — under the id the manifest gives, so a plugin's repository
brings none of its `src/` or `node_modules/`, and no path inside a zip ever
becomes a path on disk. A zip may hold the plugin at its root or inside one
folder, as GitHub's downloads do. The same id again is an **update**, swapped in
by rename so a failed one leaves the old copy, and a running plugin is reloaded
onto it. A new install arrives **off**: choosing a folder is not the decision to
run it. `Remove` sends a user's plugin to the trash and leaves its saved data;
a built-in one is switched off, never removed. There is no "open the plugins
folder" any more — it taught dropping files into a hidden directory as the way
to install, which is the thing this replaces. `fflate` reads the zips: no
dependency of its own, and the alternative was shelling out to a different
unzip on each OS.

**A plugin's icon is the manifest's to name** — `"icon": "assets/logo.png"`,
any path inside its folder, any of `svg`, `png`, `jpg`, `webp`, `gif`
(`pluginIconPathOf`). It was a fixed `icon.svg` beside `main.js` for a day,
and that was refused: a logo is a PNG as often as not, and a plugin's assets
live where its author put them. The URL does not carry the path —
`vsc-plugin://<id>/icon` is a stand-in main resolves by reading the manifest
(`pluginFilePath`), so the one file a page can reach beyond `main.js` and
`styles.css` is the one the plugin declared. A path climbing out, absolute, or
not a picture is a manifest error; a good path to a missing file is only the
puzzle piece. The Plugins view draws it as an `img` in its own colours — a
CSS mask over the text colour was tried first and fits a monochrome SVG only;
a PNG logo came out as a silhouette — so an SVG carries its colour in the
file (the built-in plugins' are Lucide marks, each in one 500-weight hue that
reads on both themes). Served with a `sandbox` CSP, so an SVG opened as a
document runs nothing.

Its `main.js` is an ES module the renderer `import()`s off this app's
`vsc-plugin://` scheme (`main/protocol.ts`), and its default export's `onload`
is handed a `PluginApp` (`lib/plugins/app.ts`): chat-row menu items, rail
buttons, a corner notice, saved data, a save dialog, the clipboard, the
transcript's own Markdown renderer, the folders, and the chats — listed, read
and subscribed to. What a plugin saves goes to `workspace/plugin-data/<id>.json`
rather than beside its files, because a built-in plugin's folder is inside the
bundle, read-only and replaced by every update.

**Why not VS Code's.** An extension host is a process of its own, an API
surface measured in thousands of calls and an activation model — months of work
and a contract this app would then owe its extensions forever. And the half of
"extending" people mostly want here is already done without this app: every
chat runs the user's own `claude` with no `--mcp-config`, so their MCP servers,
skills, plugins and hooks reach a turn as they would in a shell. What was left
is the studio's own surface, and Obsidian shows that a directory and an
`onload` cover it.

**Not a sandbox, and it does not pretend to be.** `main.js` runs in this page,
so it can reach `window.desktop` — terminals included — whatever `PluginApp`
leaves out. The narrow API buys stability and registrations that undo
themselves (`lib/plugins/registry.ts`: everything added through `PluginApp`
is taken back, newest first, when the plugin is switched off or its `onload`
throws), not containment. The Plugins view said so in a standing line, and no
longer does: with installing hidden every plugin listed is one the app ships,
so the caution had nothing in the list to be about. It returns with the
install buttons, as a standing line rather than a confirm clicked through once. Real isolation — a sandboxed `iframe` per plugin
on its own origin, talking `postMessage` — is the next step if plugins are ever
installed from somewhere other than the user's own hands.

**A plugin's surface is a chat row's menu and the rail**, where the built-in
plugins' items already were. The palette had a `Commands` group for them too,
and it was removed: it broke the palette's "opens things and nothing more" for
a list that only repeated buttons already on screen — `Show usage` was the
rail's `Usage`, and the export commands were the chat row's own items. So
`addCommand` is gone from `PluginApp`. A plugin that still calls it throws in
`onload` and is switched back off with the reason shown, which is what an
unknown call on that object would do anyway. A plugin's menu item names one of a few marks
(`PLUGIN_ICONS`) rather than handing over a component. The rest of what a
plugin might want — a tab, a rail button, a settings page of its own — is
deliberately not in this cut.

**A built-in plugin may import the renderer's pure modules** — they are bundled
into its `main.js` as a copy — and nothing that holds state or that the app
already loads: a second copy of a store is a second store, and a second
Milkdown or CodeMirror is weight and, for CodeMirror, the trap CLAUDE.md warns
about. That is why the transcript's renderer is on `PluginApp` as
`renderMarkdown` rather than imported.

### Chat export, the first built-in plugin

`Copy as Markdown`, `Export as Markdown…` and `Export as HTML…` were three items
on a chat row's menu with their logic in `lib/chat/export*.ts`. They are
now `plugins/chat-export/`: the same three items in the same menu, contributed
through `addChatMenuItem`, plus the same three in the palette for the chat on
screen. Chosen first because it was already a self-contained errand — read a
chat, write a file — and so needed only API every plugin will want
(`chats.read`, `saveTextFile`, `renderMarkdown`). Switching it off in Settings
removes the items, which is the point of its being a plugin.

### Usage, the second

The rail's `Usage` dialog is `plugins/usage/`: its button is an
`addRailButton` at the rail's foot above Terminal — it sat under Search once,
where a button that opens a dialog read as a third view of the projects column
— the same dialog is `Show usage` in the palette, and
what it reads is `chats.spend()` — the `chatSpend` channel, which stays in main
because the transcripts are main's to read. `dashboard.tsx` and `spend.ts` moved
with it; `test/chat-spend.ts` follows them.

It is the first plugin that draws **React**, which needed two things from the
platform. The app's own React, not a copy: `exposeSharedModules`
(`lib/plugins/shared-modules.ts`) puts `react`, `react/jsx-runtime`, `react-dom`
and `react-dom/client` on a global, and `scripts/build-plugins.mjs` rewrites a
plugin's imports of exactly those into reads of it — two Reacts in one page are
two sets of hooks, and base-ui reaches for `react-dom`'s `createPortal`, so that
one is shared too. And the app's **Tailwind**: `globals.css` scans `plugins/`, so
a built-in plugin's classes exist; a user's plugin is not scanned and brings its
own `styles.css`. What is not shared is copied — the shadcn `Dialog` and `Button`
and the base-ui under them, about 60 KB of the plugin's 118 KB — because a
stateless copy costs bytes and nothing else, and sharing it would make the
app's component internals a contract.

What main serves is `main.js` and `styles.css` and nothing else under a
plugin's directory (`pluginFileOf`). Plugins load in the studio's window only; a
popped-out chat is a second page and a plugin started in both would answer every
event twice. An example of a user's plugin, in plain JavaScript, is
`examples/plugins/chat-counter/`.

### ESLint, the third

`plugins/eslint/` draws the project's own ESLint in the file editor: squiggles
on `.js`/`.ts` and their family, the message and rule on hover, and the rule's
autofix and suggestions as the tooltip's buttons. It brings the squiggles back
that leaving Monaco cost (§ The editor) — for lint, not for type errors — and it
is a plugin so that it can be switched off: a lint nobody wants is a process per
project and a red line under work in progress.

It needed two things a plugin cannot do for itself, and both went into the
platform rather than the plugin.

- **A way into the editor that is not CodeMirror.** `app.editor.addLinter`
  takes extensions and a `lint({ path, text })` answering with 1-based
  positions and fixes as offsets into that text
  (`PluginDiagnostic`). The app turns them into marks
  (`lib/plugins/editor-lint.ts`, on every file editor whether or not a linter
  is registered, so one switched on reaches tabs already open). A plugin
  bundling `@codemirror/lint` would be a second copy of the view package — the
  trap CLAUDE.md warns about — and a user's plugin cannot be expected to match
  the app's CodeMirror version. A fix applies only while the buffer is the one
  that was linted; past a keystroke its offsets point elsewhere, and the next
  lint brings a fresh one. A linter answering null (no answer in time) keeps
  its marks rather than wiping them.
- **Node.** A plugin is a page module with no process of its own, so ESLint
  runs in main (`main/eslint.ts`, `IPC.eslintLint`) and the plugin reaches it as
  `app.eslint.lint`. The runner is the capability, the plugin the policy — which
  files, how a message reads, what a fix is called. A main-side half for
  plugins in general was the alternative and was not taken: it would give a
  user's plugin Node, which is a much larger door than `window.desktop`.

The runner makes `tsserver.ts`'s bargain, stricter. **The project's own ESLint
or nothing**: a config resolves its plugins against the project's
`node_modules`, so a copy inside the app would not find them, and ESLint 9
cannot read the `.eslintrc` an ESLint 8 project is written in. The nearest
`node_modules/eslint` from the file up to its workspace folder (a monorepo
installing per package is common), run where the nearest `eslint.config.*` is,
or from the install for an `.eslintrc`; no config at all is no lint, since an
`eslint` hoisted in by somebody else's dependencies is not a project asking to
be linted. **In a process** — `eslint-worker.ts`, its own esbuild entry, one per
installation on Electron-as-Node: a config is the project's code, run, and a
type-aware rule set builds a whole program before its first answer; either in
main is a frozen studio. Its stdout is the protocol, so every `console` method
in it writes to stderr. An instance is rebuilt when a config file's mtime moves,
so editing `eslint.config.js` does not need a restart. A config that throws is
one mark at line 1 saying why, rather than silence. `test/eslint.ts` runs it
against this repository's own config; `test/plugin-lint.ts` checks the rest.

### Git blame, the fourth

The current-line blame (§ Who last changed a line) is `plugins/git-blame/`. It
was a switch in Settings › Tabs & editor; the plugin's row in the Plugins view
is that switch now, and the `gitBlame` setting is deleted. A stored
`gitBlame: false` is not carried over — the plugin starts on, once, for
somebody who had turned it off.

The same split as ESLint's. **The editor half is the app's**,
`app.editor.addLineAnnotation` → `lib/plugins/editor-line-annotation.ts`: the
words laid over the line's end, asked on open, on focus and after typing
settles, hidden while stale, the hover delays, the tooltip box. That is the old
`lib/editor-git-blame.ts` with git taken out of it — the plugin answers a buffer
with "what to write at line n, and the card behind it", and only the first
annotator registered is drawn, since the end of a line has room for one
sentence. **The git half and the card are the plugin's**: one `app.git.blame`
per ask, read a line at a time, and the card (moved whole from
`components/studio/files/blame-card.tsx`) mounted into the box the app hands
over.

What the card reached into the app for became `PluginApp` calls rather than
imports, because a store bundled into a plugin is a second store:
`git.lineHistory`, `git.openCommitFile` / `canOpenCommit` (the checkout's diff
tab), `composer.insert` (`Ask in chat`), and **`t` / `locale`** — the app's own
strings in the app's language. Bundling `lib/i18n` would have carried every
message of both languages and a locale the Settings switch never reaches; the
plugin's words (`src/words.ts`: `2 months ago`, the annotation, a commit's size)
take `t` and the locale as arguments instead, and `lib/files/git-blame.ts` lost
its i18n import so the pure half can be bundled. `GIT_TONES` and `dateTimeOf`
are copied, two lines each, because their modules hold a store and a locale.
147 KB minified, nearly all of it the base-ui tooltip the card's buttons use —
the same bargain the usage plugin made with its dialog.

### Ports, the fifth

The system bar's `Ports` — the TCP ports being listened on and a Stop for what
holds one — is `plugins/ports/`. It is a tool for one moment, the `EADDRINUSE`
a dev server left behind, and somebody who never meets that moment has a button
they never press; as a plugin it can be switched off.

It stays where it was rather than moving to the rail, which needed one thing
from the platform: **`app.addStatusBarItem`**, a button on the system bar's
right beside Feedback (`PluginStatusBarItem`, drawn by `system-bar.tsx`, a
throw reported through the same `runPluginButton` the rail's buttons use). The
rail's foot is for views of the workspace; a word at the window's edge is
enough to be found by when the error names a port. Its icon is a name from
`PLUGIN_ICONS` (`network`), so it is drawn in the bar's muted tone — the sky
blue it had was the app styling its own button, and a plugin hands over no
colour.

The listing and the signal stay in main (`main/ports.ts`, `IPC.listPorts` /
`IPC.stopPortProcess`, unchanged and still `test/ports.ts`'s) and the plugin
reaches them as **`app.ports.list` / `app.ports.stop`** — ESLint's split again:
the runner is the capability, the plugin the policy. The dialog moved whole
from `components/studio/ports-dialog.tsx`; its words are still `nav.ports.*`,
through `app.t`. The button's label and title are read once at load, so a
language switch reaches them on the plugin's next load.

## MCP: what the user's own `claude` has

**This app passes no MCP config, and serves one server of its own** — the
chat's browser, in-process (§ The chat's browser). Otherwise a turn gets exactly
the servers the CLI finds in that directory — `~/.claude.json`, `.mcp.json`,
plugins, claude.ai connectors. The cost: `Plan` and `Read only` cannot refuse a
server by name; an unlisted tool is still refused by `deciding`.

### Per chat, in the composer

The composer's MCP dialog (`chat/chat-mcp.tsx`, `MCP servers…` in the `+`
menu) lists the servers, asked of the CLI in the project's directory
(`mcpServerStatus()`, not cached, re-asked for up to 8 s while servers are
pending — claude.ai connectors take ~4 s). Trouble sorts first; headers are
never drawn.

It was a popover off a toolbar button, and that was wrong twice: a connector's
forty tools folded into a 26rem card, and a control set once per chat sat
beside the model and permission, which are reached for every few messages. It
is Settings' shape now — servers down the left, the chosen one's tools on the
right with a filter — and the toolbar keeps a `MCP · n off` chip only while
something is switched off, since that is a property of the next message.

- **Switches** are this app's refusal, per chat (`disabledTools`), sent as
  `disallowedTools` so the tools are **absent** from the prompt, not refused on
  use. They change rarely, so they live in the cached prefix and in
  `signatureOf`. Entries are **wire** names (`wireServer`, tested).
- **Remove** runs `claude mcp remove`, only where a scope allows it.
- A **`needs-auth`** claude.ai connector links to its settings page; any other
  points at `/mcp` in a terminal.

## Explorer

The files of **the project being worked in**, one tree with no root row
(`shownRootOf`). `fileRootsOf` is every root — what may be read, which tabs
survive — and keeping the two apart is what stops switching project from
closing the other project's tabs. Its header is two tabs, `All files` and
`Git`; `Git` holds `Changes` and `Commits`.

- **Only expanded folders are watched**, one non-recursive `fs.watch` each; each
  root's `.git` is watched for status. Refresh re-reads everything for
  filesystems `fs.watch` misses.
- **Rows are coloured and lettered by git** (`M`, `U`, `A`, `D`, `C`), ignored
  ones greyed, in the editors' own colours. A deleted file keeps its tab, marked
  `deleted` — from git, or from the listing only where git has nothing to say.
- **A path is the identity**: `file:` + absolute path. `lib/files/paths.ts`
  accepts both separators.
- **Every `files:*` call goes through `insideAny`**; deleting is
  `shell.trashItem`. Adding, renaming and removing workspace folders is here;
  removing one never touches the directory. Rows are renamed in place.
- **Viewers** (`lib/files/viewers.ts`): text, image (on a checkerboard,
  editable — § Editing a picture),
  markdown preview, HTML preview (a sandboxed `srcdoc` frame without
  `allow-same-origin`), the block editor for `.md` (by choice), and
  diff. Binary files and anything over 2 MB are reported, not opened.

### Closing it takes it away

The column collapses to **nothing**, and its toggle is in the title bar's
right corner, over the column it opens and shuts. It used to collapse to a 36px
rail holding that button, positioned over the tree's header: the way back had
to be somewhere on screen while the column was shut, and the title bar is on
screen whatever the column is doing, so the rail only cost the pane 36px and
the gap beside it. The gap is hidden with the column, as the chats column's
is. Contents are hidden
with `opacity-0`, not `invisible`: `visibility` transitions with `Button`'s
`transition-all` and held the rows on screen for 150ms.

### Changes

The list is a **folder tree** (`lib/files/change-tree.ts`, tested), with
single-child chains folded into one row, in two piles — `Staged` and `Changes` —
so one path can be two rows with each side's own counts. Counts are
`git diff --numstat`; untracked files are read under a cap. A row opens the
project's **one diff tab**; a new directory opens in `All files` instead.

### Staging, discarding, and where this stops

Stage, unstage and discard are on the row, on a pile's heading and on the
right-click menu. **Discard means back to `HEAD`**; a file `HEAD` lacks goes to
the **trash**, never `unlink`, and a rename is restored whole. Every write is
gated twice (`ipc.ts` and `main/git.ts`) and ends by re-reading git.

### Commits

The checked-out branch's commits — or every branch's (§ The commit graph) —
twenty at a time with `Show 20 more` (`log`, one extra row asked to know
whether more exist). Read-only. Re-read off the same git signal as `Changes`,
so a commit in the dock's shell lands without Refresh.

**It now opens a commit, which reverses "no commit diff".** The list answered
"what has this branch had done to it lately" and stopped one question short —
_what did that one change_ — which sent the reader to the dock's shell for a
`git show`. A row opens into its files (`commitFiles`, against the **first
parent**, so a merge is what it brought onto the branch), and a file opens in
the checkout's **one diff tab**, the same tab `Changes` uses: one tab either
way, and whichever was picked last is drawn (`commitFile` beside `selectedPath`
in `lib/files/changes.ts`). Both sides come out of the object store
(`commitFileDiff`), never off disk, and the merge view takes the right side as
fixed text (`modified`) so it stays out of the shared buffers. Binary or over
2 MB is said, not drawn.

Three more, each something a reader kept leaving the list for:

- **Not pushed** — an arrow on each commit the upstream lacks and `↑2 ↓1` over
  the list (`upstream`). A branch with no upstream counts against every remote
  (`--not --remotes`), since a branch nobody has pushed is where it matters most;
  a repository with no remote marks nothing. Beside the count, a **Push**
  button: `git push` (`-u origin HEAD` with no upstream) run by main in the
  background (`push`), with the login shell's env so an ssh agent exported in a
  profile is seen. It **never prompts** — detached from any tty, git's and
  GCM's prompts off, a timeout behind them — because there is nothing here to
  answer a prompt in. A push that needed somebody to type (a key's passphrase
  no agent or Keychain holds, a host key to accept) answers `auth`, and the
  same command is typed into a **dock shell**, which can ask; a refusal is
  git's own words under the line. It was a shell every time at first, which
  put a terminal on screen for the push that needed nothing.
- **A filter** — message, author or the start of the hash, matched in main
  (`commitMatches`) rather than by `--grep`/`--author`, which git **ands**. The
  log is streamed and the process killed once a page of matches is in, so a
  recent match costs a screen and a miss costs one walk.
- **The blame card's menu** on a row — copy SHA or message, `Ask in chat`
  (typed, unsent), open on the forge.

Still refused here: checkout, revert, cherry-pick — the dock's shell is the git
client. The `Git Graph` tab's menu has since let checkout, cherry-pick and
making a branch or tag in (§ The Git Graph tab's menu); this sidebar's menu
stayed the blame card's.

### The commit graph

**This reverses "one branch, no graph".** History is drawn as a graph — a dot
per commit in its lane, a lane per line of work, bends where one branches off
and comes back, a ring for a merge — in the **`Git Graph` tab** (below), and
an `All branches` toggle beside the `Commits` filter widens that list from the
checked-out branch to every local branch, remote-tracking branch and tag.

**The `Commits` view itself draws no graph.** It did, a lane down the left of
each row, and it was taken off once the tab existed: a sidebar's width holds
one lane legibly and little more, the tab draws the same history with room,
and the line down a straight branch was ink saying nothing.

The list without it answered "what happened on this branch" and could not say
**where a commit came from**: a merge's twenty commits read as twenty commits on
`main`, and the branch a teammate pushed this morning was not there at all
without a `git log --graph --all` in the dock's shell, which is the question
the view exists to save a trip for. A graph is still a reading of history, not
a client — nothing on it merges, rebases or moves an existing ref (its menu's
four writes are § The Git Graph tab's menu).

- **Drawn from `%P`**, the parents the log already walks — one field more, no
  second git call. The lanes are computed in the renderer
  (`lib/files/commit-graph.ts`, `test/commit-graph.ts`) over the commits as
  listed, so a page's last lanes run off the bottom until `Show more` reads the
  parents they wait for.
- **`--date-order`, not git's plain order.** The plain order was tried first,
  to spare the walk `--date-order` makes before its first line wherever there
  is no commit-graph file, and it drew broken graphs: two commits with one
  timestamp — a rebase, a script committing twice in a second — could come out
  parent first, and the child's lane had nowhere to go but to end in mid-air.
  `--date-order` is the same dates with "no parent before its children"
  promised. A filtered log, which draws no graph, keeps the plain order and
  streams.
- **Not `--all`**: `--branches --remotes --tags HEAD`. `--all` walks
  `refs/stash`, whose commits are a working tree's index drawn as branches
  nobody made, and `refs/notes/*`, which is not the project's history.
- **No graph under a filter.** The matches are commits with the history between
  them taken out, and a lane drawn across a gap joins two commits that are not
  parent and child. The filter does search every branch when the toggle is on.
- Lane colours are fixed hues, the first the palette's primary, since some
  palettes make the chart colours greys.
- **The toggle is held for the session**, across projects, and not written
  down.

### The Git Graph tab

The same history with room: a tab in the pane strip (`graph`, one per
checkout, its id the root's — the shape the `Changes` tab has), opened from
the graph button beside the `Commits` filter. A table — **Graph,
Description, Date, Author, Commit**, one line a commit — over every branch by
default, with a `Branches` list to narrow it to the checked-out one or to
**any set of** local and remote-tracking branches, ticked together and drawn
together, and `Show Remote Branches` to take the remotes out of "every". The Explorer's view stayed: it answers "what did this
branch just do" without leaving the files, and a sidebar has no room for four
columns and ten lanes side by side.

- **A ref is read with its kind** (`--decorate=full`, `refOf`), so a chip can
  say branch, remote-tracking branch or tag — a local `backup/x` and the remote
  `origin/x` are otherwise the same shape of string.
- **Fewer chips than refs** (`lib/files/ref-chips.ts`, `test/ref-chips.ts`,
  drawn by `files/ref-chip.tsx` in both views). `origin/main` beside `main` on
  one commit is one chip, `main` with a cloud; `origin/HEAD` is dropped, being
  the remote's pointer at a branch already chipped. The `Commits` view shows
  two and a `+n` naming the rest: in a sidebar, five chips were the difference
  between a subject and none.
- **The `Commits` view's row is this table folded in two** — chips, subject
  and age on the first line, author, the unpushed arrow and the hash on the
  second — in the tab's marks: the same chips, the checked-out branch's
  subject in medium weight, the hash a muted monospace rather than an amber
  pill, an open commit tinted the way a selected one is here. The age stays
  relative (`45m`, `1d`) where the tab gives the date, since the sidebar has
  room for one and the full date is on hover.
- **The scope is a type on the wire** (`GitLogScope`), and a picked branch is a
  full `refs/…` name, narrowed in main (`logScopeOf`): a string from the
  renderer that git could read as an option or a range is dropped, and a pick
  with nothing left is the checked-out branch. `--ignore-missing`, so a branch
  deleted since it was ticked drops out rather than emptying the graph.
- **The list is ticks** (`lib/files/branch-pick.ts`, `test/branch-pick.ts`),
  with a filter over them. `Show All` and `Current branch` stand alone —
  ticking either clears the branches, ticking a branch clears them — and
  taking the last tick off is every branch again, never a graph of nothing.
  Several branches read as `main +2` in the button.
- **Uncommitted Changes** is a row over `HEAD` while the checkout has any — a
  grey ring and a dashed line, fed to the lane algorithm as a commit whose one
  parent is `HEAD` — and it is **picked like a commit**: its files open in the
  panel under the list, `Staged` and `Changes` as the Explorer piles them, each
  opening the checkout's diff tab, read off the `Changes` list's own store so
  nothing asks git twice. It only opened the Explorer's `Changes` list at
  first, and with the Explorer already there a click on it did nothing anybody
  could see. Staging and committing stay that list's: `Stage & commit…` in the
  panel goes to it.
- **The columns are dragged by their borders** (`lib/files/graph-columns.ts`,
  `test/graph-columns.ts`), the border following the pointer: the columns on
  either side trade width, Description stretches to take what the others give
  up, each has a floor, and a double-click resets them all. Kept as a setting
  (`graphColumns`). A graph column dragged narrower than its lanes cuts the
  outer ones off rather than drawing them over the descriptions.
- **One drawing, fixed rows.** The graph is a single SVG over rows of one
  height (`CommitGraphCanvas`, off `graphSegments`), each line running dot to
  dot and bending across the whole gap. It was a slice per row first, the
  Explorer's way, and read as kinked: a slice can only bend inside its own half
  row, and two slices meet at a seam.
- **A commit opens in a panel under the list**, not under its row: its line,
  hash, author, date, parents and files, at a fixed height, so picking one —
  or walking with ↑/↓, Esc to close — never moves a row. Spliced in under the
  row it pushed everything below down by the length of the commit. A file
  opens the checkout's diff tab, as from the `Commits` view. Its top edge drags,
  the Accounts foot's way — a double-click resets it — and the height is kept
  as a setting (`graphDetailsHeight`), never more than 85% of the tab.
- **Re-reads that change nothing draw nothing.** The log is re-read on every
  status change, which during an agent's turn is every saved file; an answer
  with the same commits and refs keeps the one on screen, and the rows are
  memoised. The next page is asked for before the end is reached, and a new
  branch or filter dims the list only once it has taken a moment. The right-click menu is
  its own — next section.
- Refresh is a button as well as the status signal: a fetch in another app moves
  the remote-tracking refs without touching anything watched.

### The Git Graph tab's menu

**This reverses "nothing here writes".** A row's right-click menu is the one
GitLens taught people to expect, in its order: `Open Changes`, `Checkout
(Detached)`, `Create Branch…`, `Create Tag…`, `Cherry Pick`, three `Compare
with…`, copy hash and message, `Add to Chat`, `Explain Changes`
(`files/graph-commit-menu.tsx`). The tab was a reading of history that sent
the reader to the dock's shell for the first thing they wanted to do with what
they had read — make a branch at this commit, bring that fix onto this
branch — and the shell then needed the hash copied across by hand. The argument
that kept them out ("the shell is the git client") was about not growing a
second client; four writes that each **make something new or move `HEAD`**, and
that git itself refuses where they would lose work, are not that. Merge,
rebase, reset, revert, amend and deleting a ref stay the shell's.

- **main runs them** (`checkoutDetached`, `createBranch`, `createTag`,
  `cherryPick` in `main/git.ts`, `test/git-graph-menu.ts`), each answering
  with git's own words rather than throwing — a refusal is a sentence for the
  reader, drawn in a line under the toolbar (gone after a few seconds when it
  worked, kept when it did not). Nothing prompts: no terminal, and
  `GIT_EDITOR=:`. A name is checked before git sees it (no leading `-`, then
  `check-ref-format`) and a commit is a hash and nothing else.
- **A cherry-pick that conflicts is left conflicted** — the markers in the
  files are what the `Changes` list and the editor's Accept buttons exist for,
  and the line says so with a way there. One that comes out **empty** (the
  branch already has the change) is aborted: it stops in progress waiting for
  a `--skip`, and a sequencer left open over nothing is a trap for the next
  `git commit`. A merge is picked against its first parent.
- **A comparison is the commit panel with another left side**: `commitFiles`
  and `commitFileDiff` take a `base`, which `compareBase` resolved to a hash
  first — the branch's upstream, the merge base with `HEAD` (greyed when that
  is the commit itself, as it is for anything already in `HEAD`'s history), or
  any revision typed or picked in `Compare with…` (read with
  `--end-of-options`, so never a flag). A file opens in the checkout's one diff
  tab, its header naming both sides; picking another row ends the comparison.
- **`Open Changes`** picks the commit and puts its first file in the diff tab,
  the rest listed in the panel.
- **`Explain Changes` starts a chat** in the project and sends it at once — a
  conversation somebody can keep talking in, asked for out loud, not a helper
  turn. It names the hash and leaves the reading to the CLI's `git show`
  rather than pasting a diff that may be thousands of lines. `Add to Chat` is
  the blame card's `Ask in chat`: typed into the composer on screen, unsent.
- `Copy Commit Message` copies the whole message, body and trailers
  (`commitMessage`), since the log row carries the subject alone.

### Who last changed a line

The caret line's blame is drawn faintly after it, with a card on hover:
author, date, the whole message, the commit's size, the line's own `-`/`+`
rows, hash and forge links — the built-in **`git-blame` plugin**
(`plugins/git-blame/`, § Git blame, the fourth) over the app's line annotation
(`lib/plugins/editor-line-annotation.ts`) and `main/git.ts`'s `blame`. One
`git blame --porcelain` per file with the buffer on stdin, laid over the line
rather than in it, and never cut: on a line that reaches the edge the words go
past it, behind a horizontal scrollbar, since trimming them to the room left
hid them — and the card — on exactly the long lines.

The card also lists **the line's history** — `git log -L` from the blamed
commit, at the line and path that commit had (`GitBlame.sources`), so an
unsaved buffer cannot throw the walk off; `lineHistory`, capped at 30, asked
once when the card opens. Stepping down that list is GitLens's "blame before
this change" without a git call per step. `Open this commit's diff` puts the
selected commit's version of the file in the checkout's diff tab, the one the
`Commits` view opens into — the diff in the app, not drawn inside the card. No
avatars, no forge API. `Ask in chat` types the commit into the composer,
unsent.

### Committing

A message box above the piles while something is staged; `⌘⏎` commits with
`git commit -m` (an argument, hooks left to run). **`Draft`** asks the
read-only one-turn `claude` (`draftCommitMessage`) for a message off the staged
diff and the last ten subjects — a button pressed, its output text in a box
somebody still has to commit, which is why it passes the rule against helper
turns. A failed commit **rejects** and keeps the message.

**What a draft runs on is set beside it**: the gear next to `Draft` opens one
dialog with the model, the account and the rules a message must follow, all
held until Save. It was a Settings row (model and account) and a rules button
of its own; both are wanted at the moment a draft comes back wrong, which is in
front of this box, not a dialog away. The gear is lit while there are rules.

**A draft is one commit.** It was a plan of several once — a JSON answer,
read against the staged paths, shown as a card a commit — and it came out as
the wrong shape for the box: a staged change is one message, and a split the
draft proposed was a second reading of the diff nobody checked before it was
committed in order. Removed, with `commitSeries` and `readPlan`: a draft that
wants splitting is pressed again, or split by hand with the dock's shell. No
amend, branch
or stash: the dock's shell is the git client. Push is the `Commits` view's
button (§ Commits).

### Resolving a conflict in the file

Each `<<<<<<<` block gets **Accept Current | Incoming | Both** in the file
editor (`lib/editor-conflicts.ts`, parsing tested). It is an edit to the buffer,
read off the text, and a conflicted row opens on the editor rather than the
diff.

### The diff pane

CodeMirror's merge view, **read-only on both sides**; the right side is the
file's shared buffer (so unsaved edits show) and the left is `HEAD`. The changed
ranges come from **git** (`git diff HEAD --unified=0` through
`DiffConfig.override`), so the pane and the row's counts are one algorithm — and
the patch is checked against both texts and dropped whole if it does not match.
Inline or side by side, and whitespace, are settings. The diff is the one
editor **unmounted** rather than hidden, since a live one painted through other
panes.

**Every file at once** is the other way to read it (`changesStacked`, the `Rows3`
toggle in the Git tab row; `files/changes-stack.tsx`): GitHub's "Files
changed", each file a section whose path header sticks to the top while it is
being read, a row picked in the list scrolled to. Only the diffs near the visible part are built: a diff is a CodeMirror view,
and keeping each one built once scrolled past put a hundred of them in the page
for a large change. So the stack is **windowed** — every header stays, and a
diff is built as it nears the viewport and destroyed as it leaves, a block of
its measured height left behind so nothing moves; what was read is cached per
answer from git. The reading position is **held by hand** when a section above
it changes height (a diff rebuilt on the way back up, side by side's spacers):
the browser's scroll anchoring cannot anchor inside CodeMirror, whose scrollers
turn it off and are nested scroll containers besides. Its working side is read **from disk**, not the shared buffer
— git's patch is about the disk — and a file's `Open` puts it in the single
view for `Diff | Edit`, a picture's comparison and unsaved edits.

### The editor

**Every editor is CodeMirror**, set up in `lib/editor.ts` and always behind a
`lazy`. A language is a dynamic import (`lib/editor-languages.ts`, 143 via
`@codemirror/language-data`, plus `.env` and Makefile grammars of our own). One
copy of `@codemirror/view` is enforced twice — see `CLAUDE.md`.
**The file editor does not wrap**, as VS Code does not: a long line runs off
behind the horizontal scrollbar, so a row on screen is a line of the file. The
diffs and the fields still wrap (`baseChrome({ wrap })`), being narrow panes
read rather than code navigated.
`lib/files/documents.ts` lets several views share one path's buffer. `⌘S` saves;
**closing a tab with unsaved edits asks** — Save / Don't Save / Cancel
(`files/unsaved-dialog.tsx`, `unsaved` in `lib/files/store.ts`), one dialog for
every dirty file a `Close all` meets. It used to write rather than ask, on the
grounds that the edit was deliberate; but × is also how an experiment is thrown
away, and writing somebody's source because they closed the tab kept edits they
meant to drop. A preview tab replaced by the next click still writes, since
nobody closed it. The cost of leaving Monaco: `.ts` files get no syntax
squiggles from the editor itself — a project with ESLint gets its parse errors
back through the ESLint plugin (§ ESLint, the third).

### Editing a picture

A PNG, JPEG or WebP tab has `Edit image` in its header, which swaps the preview
for a canvas editor (`file-image-editor.tsx`): crop, rotate, flip, resize, and
a pen, rectangle and arrow for marking a screenshot up before it goes into a
chat. The arithmetic — pointer to picture pixels, the crop, the ratio — is
`lib/files/image-edit.ts` (`test/image-edit.ts`).

- **Only what a canvas can encode.** `encodableTypeOf` in `shared/image-files.ts`
  is the one list, asked by both sides: a GIF or BMP would come back from
  `toDataURL` as a PNG, and PNG bytes under `.gif` is a file other tools misread.
  An SVG keeps its text editor; flattening it to pixels is not an edit of it.
- **One write, `files:write-image`**, under `insideAny`, which refuses a `data:`
  URL whose type is not the one the extension names. A `.jpg` saved is a JPEG
  re-encoded — what any other editor would do to it.
- **Each step is a whole canvas** on an undo stack of 30, not operations
  replayed from the original: rotate, crop and a stroke compose in an order
  that matters. The stack is the pane's, not the store's — closing the editor
  with unsaved steps asks; closing the tab does not keep them.
- **Not on the `Changes` tab**, which is reading what changed in a picture
  rather than changing it.

### Hover and go-to-definition

A real **`tsserver`** per root, using that root's own `typescript` and nothing
if it has none, started with automatic typing acquisition off and fed the
editor's buffer. Spoken to directly rather than through an LSP layer
(`test/tsserver.ts` runs it for real).

**Unused code is drawn faded**, as VS Code draws it: the diagnostics tsserver
marks `reportsUnnecessary` (unused imports, locals, parameters, unreachable
code), from the semantic list and the suggestion list both, since
`noUnusedLocals` decides which one carries them (`IPC.tsUnused`). Asked after
each sync lands, applied only if the buffer still holds the text synced. The
rest of the diagnostics stay out — the only squiggles are ESLint's, through
its plugin (§ ESLint, the third).

## The block editor

BlockNote, behind a `.md` by choice. A `.md` is printed back lossily, so it is
never the default: frontmatter is set aside and restored byte for byte, and
drawings and uploads are switched off for it — which, with `.note` gone, leaves
the two sections below with no file that reaches them.

### Images

A dropped, pasted or uploaded picture becomes a file under
`workspace/note-files/` named by UUID, addressed as `note-file://workspace/<name>`
and served by `main/protocol.ts` (with `Range` for media). One type table in
`shared/note-files.ts` serves both directions. Nothing deletes one. The upload
panel is the studio's own.

### Drawings

`/drawing` is **Excalidraw**, edited in a dialog and shown in the document as an
SVG. The scene is `workspace/drawings/<id>.excalidraw`; the document holds only
the id in a ```drawing fence. Shapes default to straight (roughness 0, Nunito).
Excalidraw and its fonts are loaded on demand and served by this app. Numbered
**badges** are a group (circle + digit) so they resize as one, numbered from the
scene's `customData`, with their button portalled into Excalidraw's toolbar.

## The system bar

CPU and memory for the machine and this app, polled every two seconds by one
poller (each figure is a delta). Available memory includes reclaimable cache;
CPU is a share of all cores. The dock's shells are not counted as the app's.

Ahead of the meters, two things that change while somebody is reading something
else. The **branch** carries `↑`/`↓` against its upstream (`gitUpstream`,
re-read on the git status signal the `Commits` list uses) and the count of
changed files; a click opens the Explorer on `Changes`. Then **the chats across
the workspace** — waiting on a question, answered and unread, working — drawn
only when one of the three is not zero, since the projects column may be shut.
A click goes to the next chat of the most urgent kind (question, then unread,
then working), so repeated clicks walk them. Neither is a total that only grows
— § What the chats have cost, removed.

### The usage dashboard counts tokens, not dollars

The rail's `Usage` dialog — the built-in `usage` plugin, § Plugins — groups
**tokens** (prompt on both sides of the cache, plus output) by day, project,
model and chat (`spendRows`, `plugins/usage/src/spend.ts`). On a subscription, a dollar estimate is a price
nobody pays.

## Updating

A pill in the status bar when GitHub has a newer release. `main/updater.ts`
checks `releases/latest` (at launch, then every six hours); `isNewer` is
numeric and strictly newer (`test/updates.ts`). Nothing pops up; skipping is
per version.

On **macOS** the button is **`electron-updater`**, which drives Squirrel.Mac
(`main/electron-updates.ts`): it downloads the release's `-<arch>.zip` with a
progress bar, Squirrel checks the new bundle's signature against the running
app's designated requirement and stages it, and the app quits through its
own `before-quit`. ShipIt then swaps the bundle in place and reopens it. The
feed is the release's own download directory (`releaseFeedUrl`), pinned to
the version the button was pressed for, not whatever is latest by then. So
`release.yml` publishes the zips and `latest-mac.yml` beside the dmgs, and
`package.json` carries a `publish` block that is never uploaded through,
because that is what makes electron-builder write `latest-mac.yml` and the
bundle's `app-update.yml`. A differential download is turned off: it reports
no progress, and the bar is what the wait has to show.

It used to be the other way round. While the builds were unsigned, Squirrel
would not replace them, so the app downloaded the `.dmg` and ran a bundled
`install.sh` detached, the same script the README once told people to pipe
into `bash`, because `curl` sets no quarantine flag. Once the builds were
signed and notarized, that reason was gone, and the script had three faults
the signing brought out. It asked the app to quit with a `quit app` Apple Event
from a child of a hardened-runtime app with no Apple Events entitlement, and
its error went to `/dev/null`. It waited for the quit with a `pgrep` on the
executable's name, which the pty daemon (the same binary, alive a minute after
the app) always matched, so it went ahead after five seconds whether or not
the app was gone. And the app reopened `/Applications/Vey.app`, the name from
the rename below, while the bundle actually installed was `Vey Studio.app`:
the 0.0.4 update installed and never came back. It also verified nothing
about who built what it copied. `install.sh` is **deleted**. A build up to
0.0.4 still updates through its own bundled copy, which is why the releases
keep their `-<arch>.dmg`. Those builds still will not reopen on their own,
once.

**After** an update, one thing does: the first launch on a new build opens
`whats-new-dialog.tsx` with the notes of every release since the build last
seen (`seenVersion` in the settings, `whatsNewOf` in `lib/whats-new.ts`,
`notesBetween` in `updater.ts`, one `releases?per_page=30` request). It is not
the interruption the rule above refuses: the update was asked for, and this is
the end of that gesture. A fresh install is recorded, not announced — its
welcome and tour are the introduction. A failed fetch records nothing, so an
update installed offline is announced on the next launch that can reach
GitHub; a build with no release of its own (a checkout ahead of the latest) is
recorded silently.

On **Windows** the same button downloads the NSIS `.exe`, quits the app the
ordinary way, and starts the installer at `will-quit` with `/S --updated
--force-run` (`WINDOWS_INSTALLER_ARGS`): silent, closing any copy of the
executable still running — the pty daemon, a copy opened from elsewhere —
without asking, and reopening the app afterwards. It exists because a
hand-run installer left the old version on screen often enough to be asked
about: a prompt cancelled, a shortcut pointing elsewhere. A PowerShell wrapper
waiting on the app's pid was tried first and does not work: spawned `detached`
it has no console and exits having run nothing. On Linux it links to the release
page.

The installer carries one change to electron-builder's template,
`resources/installer.nsh`: when the old version's uninstaller fails — exit 2,
its `Abort` on a file still held after five attempts, every file already put
back — the install goes on over that copy instead of ending on "Failed to
uninstall old application files". That box has no `/SD`, so it appeared under
`/S` too, and the update from 1.0.13 to 1.0.14 stopped on it with 1.0.13 still
installed. Installing over is safe because the extraction already retries a
busy file and then overwrites regardless. Which file was held was not found.

It was found later, on a 1.0.16 → 1.0.17 update that reported success and
reopened as 1.0.16: every file in the install directory was new except
`Vey Studio.exe` and `resources/app.asar`, and the pty daemon — that same
`.exe` running `daemon.cjs` out of `app.asar` — was still alive from two hours
before. The installer's running-app check had let it through; why is still not
known, since the same PowerShell and `tasklist` queries find it when run by
hand. So the app no longer leaves it to the installer: `endOtherCopies` in
`updater.ts`, run synchronously just before the installer is spawned, stops
every process on this executable that is not this one or one of Chromium's
`--type=` helpers, and waits for each to exit. Since the app that runs it is
the old version, it takes effect from the update _after_ the one that ships it;
a machine stuck like this one needs the installer run once by hand with the app
and the daemon closed.

## Usage counts

How many machines run the app, how often and for how long was not knowable:
GitHub's `download_count` is one running total per file, with no time, and it
counts every in-app update as a download. So the app sends **two events**
(`main/telemetry.ts`): `app_opened` at launch, and a `heartbeat` every fifteen
minutes carrying the focused seconds since the last one — flushed on quit, so
only a crash loses time. Each carries the version, OS and CPU, under a random
id minted on first launch (`telemetry.installId` in the manifest's settings).

They go to **the studio's own server**, `POST /api/telemetry` on
`vsclaude-cloud`, one row each in its D1 `app_events` table
(`server/utils/app-usage.ts`), with the server's clock as `at` and
Cloudflare's reading of the country — the address itself is not kept. Same
`serverUrl()` as sign-in, so a build without a server sends nothing.

PostHog was the first version and was taken out the same week: it put the
counts with a third party for nothing the questions needed — a day's active
machines, the minutes, the versions are each one `GROUP BY` over two event
kinds — and its key had to ship in the bundle. The endpoint takes no sign-in,
since the counts are of machines and not people; what stands in for one is
that `appUsageOf` lets a row hold nothing but those few fields, each held to a
shape, and a heartbeat at most an hour (`test/app-usage.test.ts` there).

What it deliberately does not carry is the rule: **no path, project, chat,
account or email**. A count is all this is for, and what somebody works on
never leaves the machine. A send that fails is not retried: a count missed
offline is a count, not somebody's work.

Only **focused** minutes count — an app left open behind everything all day is
not a day of use. A **dev build** reports only to a server on this machine
(`reportsTo`: plain `http:`, which `normalizeAiUrl` allows for localhost
alone), so `bun run dev` against `nitro dev` can be watched end to end without
a developer's restarts reaching the real counts.

It is **on unless switched off** — Settings › Updates, `TELEMETRY_KEY`, read
(only `"off"` is off). The update check
has no switch because it carries nothing about the user; this does — that they
were here, and for how long — so it gets one. The sentence under the switch is
the whole of what is sent, and has to stay true. Time counted while it is off
is dropped, not sent later (`test/telemetry.ts`).

## The name

The app was **Yasuo**. The first run moves `~/.yasuo` to `~/.vsclaude`
(`migrateLegacyDataDir`) — except `workspace/worktrees`, which stays where its
absolute paths point — re-points profile directories, and renames Electron's
`userData`. Old `yasuo/untitled-…` branches still count as untitled. An update
from a build still called Yasuo installs beside it and has to be opened by hand
once.

It was then written **VS Claude**, with the VS drawn rather than typed — a
lettermark, the S run through the V's right arm in slanted round strokes.
The app icon was that glyph in white on a violet-to-amber plate, where code
brackets around a spark used to be — an icon saying one thing beside a name
written as another was two brands.

**The mark is no longer letters.** It is a lane stepping up onto the next,
the lane it joined running on to the left of the step and the one it left
running on to the right (`resources/mark.svg`): the switch that does not
stop — a chat moved from an account that has run out to one that has not,
mid-conversation, and carried on — which is the thing this studio does that
the plain CLI does not (`Continue with …`, § Projects and chats). Black and
white: white on a black plate for the icon (`logo.svg`), and alone in
`currentColor` where the app draws it, so it is the text's ink in either
theme. One stroke width, ends cut square, a mitred step — the register of
the marks it was measured against (a bar with a crescent, stacked ribbons,
a pixel arrow): flat geometry, drawn rather than written.

The way there, in order, since each step was a reason: the gradient plate
went first — two colours sit beside whatever is on screen where a five-stop
gradient argued with all of it, and the loader, the wordmark and the icon
each carried their own copy of the stops. Then the letters were redrawn
three times — a plate split on a slant with a letter on each half (striking,
and bad), a wedge V with a semicircle S, the same with the V's right arm
straight — and each was a better-set "VS", which was still only the
initials. The sheet that replaced them asked what the product does instead:
lanes merging (many chats, one project), a prompt chevron, a lens, a pixel
stream, nested chevrons, and this. The merge was the obvious one and the
step the true one — the studio's reason to exist is the switch, not the
fan-out. The loader draws it stroke by stroke the way it drew the letters:
the step, then the stubs.
Only the words changed then: `productName`, `app.setName` and the
`/Applications` path stayed "Visual Studio Claude".

It is now **Vey Studio**, all the way down, because a release to people who
are not its author cannot carry two trademarks that are not its own —
"Visual Studio" and "Claude" — in its name. The VS glyph stays: it is Vey
Studio's initials, and the wordmark is it followed by the name. Done before
there were users to speak of, so the bundle moved too rather than keeping a
third name underneath: `productName`, `app.setName`, `/Applications/Vey
Studio.app`, the `Vey-Studio-…` installers, `~/.veystudio` and `VEYSTUDIO_*`.
The first run moves `~/.vsclaude` (or a `~/.yasuo` that never became one) to
`~/.veystudio` and renames `userData` from either old name, the same way as
before, worktrees again left where they are; the old variables are still read.
`install.sh` removes `Visual Studio Claude.app` and `Yasuo.app`. An update
from a build still called Visual Studio Claude is run by **that** build's
script, which knows neither, so on macOS it installs Vey Studio beside it,
reopens the old one and has to be opened by hand once — the Yasuo move again.

What did **not** move, because each is written somewhere the app cannot
rewrite or would sign everybody out for nothing: `appId` (`vn.app.vsclaude` —
a new one is a new app to macOS's permissions and a second install to
Windows'), the `vsclaude-free` profile id and its `vsclaude-token`, the
renderer's `vsclaude.*` storage keys, the server's token issuer, the D1
database, the `vsclaude-cloud` directory and the GitHub repository.

It is now **Vey**, with "Studio" dropped: the mark had stopped being the
initials (above), so the name no longer had a lettermark to explain, and
beside a mark a one-word name is what the wordmark wanted — `Vey Studio` was
two words doing one word's job. Everything a person reads moved —
`productName`, `app.setName`, the menu bar and About, every UI string, the
site, the mails, the pay pages, the README — and so did the gestures a user
can type: `/Applications/Vey.app`, the `Vey-<version>-<arch>` installers,
`Vey.exe`. Still before there were users, which is what made the installer
rename free: `install.sh` and the updater pick an asset by its `-arm64.dmg`
suffix rather than its name, and `install.sh` removes a `Vey Studio.app`
beside the other two old bundles. What did not move is the same list as
above plus one layer: `~/.veystudio`, `VEYSTUDIO_*`, the daemon's pipe
names and the `veystudio` package name — internal names nobody reads, each with a migration behind it
that a second rename would only repeat.

## The launch screen

`splash.tsx` draws the studio assembling in miniature, held for
`SPLASH_ASSEMBLE_MS` and crossfaded into the workbench. Animation is CSS, in
`styles/motion.css`, by three rules: a movement says where a thing came from,
anything a click waits on is over in 250ms, and only opacity and transform are
animated. Under reduced motion the entrances go; the loops stay, so the launch
does not look hung.

## Removed

Removing a feature means deleting it — store, channels, types, tests — not
hiding it. What it left on disk stays (see The workspace). Kept here so a
reference to it still lands somewhere; the full argument for each is in git.

### Credits and the free AI, removed

**Studio AI** — the free AI — let anybody signed in to the studio chat on
Haiku, Sonnet or Opus through this app's own server, with no Claude account of
their own, paid for out of **credits**: packs of 20.000 to 200.000 ₫ bought by
VietQR transfer (SePay) or by card (Paddle). The CLI was pointed at the server
(`ANTHROPIC_BASE_URL`) from a `CLAUDE_CONFIG_DIR` of its own,
`workspace/claude-free`, whose `apiKeyHelper` printed an hour's token main kept
renewed; the server forwarded to Anthropic through a failover list of
providers and charged each request to the balance at its model's price. The
composer had a `Pay with credits` row and a balance meter, the Accounts foot a
credits card, the account menu `Buy credits`, a refusal for an empty balance
was a card to buy more, the way out of a limit offered credits, and every
turn's usage line said what it took off the balance. It was sold as monthly
**plans** for a day before that (`Hobby`, `Starter`, `Plus`, `Pro`), withdrawn
for credits alone.

Deleted on 2026-10-28, in favour of Vey Pro (§ Pro, removed). Credits resold
Anthropic's API at 1.6× to 1.9× — below cost against Anthropic's own price,
thin against the reseller the server used — under a payment provider's fees
and a fleet of keys somebody had to keep topped up, and nobody was buying.
Worse, it pulled the other way from the studio: the app is for running chats
on accounts somebody already pays for, and credits were a reason not to add
one. Deleted with it: `shared/credits.ts`, `shared/free-ai.ts`,
`main/free-ai.ts`, `lib/credits.ts`, `lib/free-ai.ts`,
`lib/chat/credits-refusal.ts`, the credits dialog, badge, meter and refusal
card, `TurnUsage.credits` and `creditsOf`, `FREE_PROFILE_ID` and every branch
on it, `closeProfile`, the four `free-ai:*` channels, the `buy`/`signIn` ways
out of a limit, and on the server `/v1/*`, `/api/usage`, `/api/orders`, the
Paddle checkout and webhook, the providers and their failover. What stayed is
the server itself, for Pro, and then for the usage counts alone once Pro
went (§ Pro, removed). `accountEnv` moved to `main/claude-profiles.ts`, where it
is only `CLAUDE_CONFIG_DIR`.

What is on disk stays. `workspace/claude-free` is deleted by nothing; a chat
whose `profileId` is still `vsclaude-free` resolves to no profile and runs on
the default login, the way a removed profile's chats do, and its transcript is
carried there out of `claude-free` because the chat's `startedIn` names that
directory. A usage line written with `credits` keeps the
field, and nothing draws it. On the server, `users.credits`, `users.used`, the
`paddle` rows of `transactions` and the `upstreams` table are left in D1; a
balance somebody bought is refunded by hand.

### Tasks, removed

A layer of named tasks gathering members from every panel. Deleted when the
column became projects.

### Board, removed

A kanban per project. A backlog is the one thing this studio cannot read off the
repository, so it was a duplicate of the team's tracker or its stale half.

### Watching ClickUp tasks, removed

A poll of watched tasks with agents assignable to them. A second account of
somebody else's tracker, with a key on the machine and a poll always running.

### The ClickUp inbox, removed

One ClickUp list per project, polled in main, every change to it an item
with its own before and after — new tasks, statuses, titles, descriptions,
priorities, due dates, tags, assignees, comments, mentions and edits — read
through a sign-in to ClickUp's own MCP server or a personal key. Deleted on
the word of the person it was built for, after using it: it was **a list of
events**, and what following a project closely needs is the reading of them —
what was decided, what changed in the spec, which question is still waiting
on whom. An AI summary per item was tried on top and made each item quicker
to read without changing that; the reading was still somebody's, one item at
a time. It also saw one list, could not say who changed a status or a
description (ClickUp's v2 API does not), and missed a comment on a task quiet
for a day. A **bot** (§ Bots) with a daily prompt over the tracker, through
the user's own ClickUp connector, does the reading and is not limited to one
list. Nothing reads `workspace/clickup-inbox.json` or the sealed
`clickup.mcpGrant` / `clickup.inboxToken` settings any more, and nothing
deletes them; `host.openExternal`, which only the sign-in used, went with it.

### Worktrees, removed

A layer between project and chat (`worktreeId` everywhere). The isolation was
paid for on every chat and wanted on few. The checkout came back as a project,
and then went too — below.

### Worktrees, as projects, removed

The button beside a project's `+` made a `git worktree` under
`workspace/worktrees/<folderId>/` and added it as an ordinary folder, with a
base to cut from, `.worktreeinclude` copied in, a setup command in a dock
shell, ahead/behind marks on its row, `Remove worktree…`, an untitled branch
renamed after its first chat's title, and the column filing a checkout under the
project it was cut from. Deleted whole — `main/worktrees.ts`, the two dialogs,
`lib/project-tree.ts`, six channels — because it was not used: a second
checkout is `git worktree add` in the dock's shell and `Add project`, which is
what this app does with any other folder on the machine. With it went the app's
one branch write (`git branch -m` on a `vsclaude/untitled-…` branch).

A checkout an older build made is left alone: it is still a folder in the
manifest, so it is still a project in the column — top-level now, with
`Remove project` as its way out — and its directory is still where git expects
it. Nothing deletes it, and `migrateLegacyDataDir` still leaves
`workspace/worktrees` in place.

### Worktrees, back inside their project

A project's menu has `New worktree…` again (`main/worktrees.ts`,
`project/new-worktree-dialog.tsx`, `IPC.addWorktree` / `IPC.removeWorktree`):
a branch and an optional base, `git worktree add` under
`workspace/worktrees/<folderId>/<slug>`. An existing branch is checked out
rather than refused. Asked for by the person using it, which is the answer to
"it was not used".

The first try added the checkout as a project of its own, an icon in the rail
beside the one it came from. That read wrong at once — a worktree is the same
project on another branch, not another project. So the folder carries
`worktreeOf` (written only by `addWorktree`), the rail draws one icon per
project and counts its worktrees' chats in its badge, and the column lists the
project's chats and its worktrees' **together**. `Needs you` and `Running` stay
one list across them; `Recent` is grouped under a heading per checkout — the
project's own directory, then each worktree, labelled by branch, each with a
`+` for a chat there (`byCheckout` in `lib/project-checkouts.ts`,
`test/project-checkouts.ts`). Each group folds by its chevron, remembered per
folder id with the rest of the column (`shutCheckouts` in `lib/projects.ts`);
folded, it shows its count and still lists the selected chat. A row of checkout chips under the header was
tried first and taken off: it was a switch somebody had to remember was there,
hiding the other branches' chats behind it. Picking a heading or opening a chat
picks that folder, so Explorer and the dock's shell follow with nothing taught
about checkouts. A heading's menu has `Remove worktree…`: `git worktree remove
--force`, the branch kept, its chats left under Ungrouped. A worktree whose
project has left the workspace is a project again.

Still not back: ahead/behind marks, `.worktreeinclude`, a setup command, a
branch renamed after its first chat.

### Distilling learnings, removed

A read-only turn proposing skills and `CLAUDE.md` lines from a chat. Unused; the
CLI's own `#` and a chat in `Edits` do the same.

### Run, removed

A `Run` tab with one command per folder. A second shell does it better.

### Preview, removed

A `<webview>` of the project's dev server in the dock. Unused; a page is read in
the user's own browser. A `<webview>` is back as the chat's browser — one the
chat's `claude` drives, which is a different thing to have (§ The chat's
browser).

### Vertical tabs, removed

The strip as a column beside the pane. Nine `vertical` branches in one component
for a layout that took width from the pane.

### Grouped tabs, removed

A setting gathering a panel's tabs under one tab per folder, with a second strip
inside it. The strip is already per project, so the folder a tab would fold
under was nearly always the one on screen; what replaced it is the choice
between that and every project's tabs at once (§ One project's tabs, or every
project's). `orderWhere`, the in-place reorder
that keeps another project's tabs from closing on a drag, moved to `lib/tabs.ts`.
A stored `groupTabs` key is ignored.

### The assistant, removed

A workspace-wide read-only chat in the dock. Replaced by the project's chat.

### Comments, removed

Threads pinned to diff lines, a `Comments` tab and badges. Heavy for a gesture
that ended as a prompt; remarks go in the composer.

### Whose work this is, removed

Per-chat filter chips on `Changes`. Always incomplete — a `Bash` write named no
chat.

### Conversations, removed

A list of every CLI transcript on disk. Nothing reads `~/.claude/projects/` any
more except `retitle` and `chat-fork.ts`, for this app's own chats.

### Terminal sessions, removed

A Terminal panel whose chat view tailed the CLI transcript. Split into the
project's hosted chat and the dock's shells.

### Database and API, removed

Postgres/MySQL and an HTTP client. They worked, but nobody would choose this app
for them over TablePlus and Postman. Their panel windows went with them.

### Mail, removed

An SMTP sink (and before it a webhook catcher).

### Notes, removed

A Notes panel with its own tree and preview server. The block editor stayed, as
the Explorer's `.note` / `.md` viewer.

### `.note` files, removed

The tree's `New note…` and every recognition of the extension — its icon, the
block editor as its default viewer, the `Note editor` label, the JSON reading
and writing in `lib/files/block-doc.ts`. A note was the Notes panel's document
kept in a repository, and with the panel gone it was a format only this app
could read, sitting in somebody's working tree. A `.note` already on disk is now
an ordinary text file; nothing converts or deletes it.

### The Env editor, removed

A `.env` as a table. Replaced by highlighting in the text editor.

### What the chats have cost, removed

A lifetime spend total in the system bar. A number that only grows answers no
question in the moment; the usage dashboard does.

### A chat's budget, removed

A per-chat dollar cap that warned. Unused.

### Snapshots and chat blame, removed

A per-turn snapshot commit chain under `refs/vsclaude/snapshots/` and a gutter
naming which chat wrote each line. Never wired: no handler was registered.

### Pipelines, removed

Chats chained into stages. Never wired into the UI.

### Claude config, removed

A read-only listing of `.claude.json`, `settings.json` and `remote-settings.json`
in Settings, with the user / project / local / managed levels folded into
effective settings. The one place this app read the CLI's files instead of
asking it, for an answer `/status` and `/config` already give.

### The browser build, removed

The same renderer served over HTTP on `127.0.0.1` by `src/server/`. A second
host with its own security surface, for a tab that did less than the window.
`main/host.ts` stays, so `createIpc` remains free of `electron` for the tests.

### Community, removed

A `Community` menu in the system bar and a `Join the community on` line in the
feedback dialog, both listing `COMMUNITIES` — one entry, a Facebook group — each
under a mark drawn in `community-icon.tsx`. A second way out of the app for a
place to talk, beside the issues the Feedback button already opens, with nobody
tending it from this side. Deleted with the list, the icons, the type and the
README's line; the Feedback button and its GitHub issues stay.

## Development

```sh
bun run dev       # Vite, then Electron against it; the renderer hot reloads
bun run test      # every test/*.ts, plain bun scripts (see test/harness.ts)
bun run build     # bundle main/preload/daemon and the renderer
bun run package   # ...then an installer with electron-builder
```

Changes under `src/main/`, `src/preload/` or `src/shared/` need `bun run dev`
restarted. Tests that touch the world do it for real — `test/files.ts` makes
real files, `test/git-changes.ts` drives a real repository — because a fixture
only checks the code against a memory of the format.
