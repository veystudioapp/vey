# Getting started

Vey is a desktop app for running Claude Code conversations against the
folders already on your machine, and reading what they changed — chats,
editor, diffs, commits and a terminal in one window.

## Install

### macOS

macOS 12 (Monterey) or newer.

<DownloadButton build="mac-arm64">Apple Silicon (M1 and later)</DownloadButton>
<DownloadButton build="mac-x64">Intel</DownloadButton>

Open the `.dmg` and drag **Vey** into **Applications**.

### Windows

x64.

<DownloadButton build="windows">Windows (.exe)</DownloadButton>

Run the `.exe`.

### Linux

x64.

<DownloadButton build="linux">Linux (AppImage)</DownloadButton>

Then:

```bash
chmod +x Vey-*.AppImage
./Vey-*.AppImage
```

It needs FUSE (`sudo apt install libfuse2` on Debian and Ubuntu).

## Claude Code

Chats run on your own `claude` — the Claude Code CLI. The app opens without
it, but you need it to chat.

## Your first chat

1. **Add a project.** Click **+** beside **Projects**, choose a folder (or drag
   one in from Finder) and click **Add folder**. A project is a folder already
   on your machine: Vey works on it where it is, and never copies it.

   ![The Add a folder dialog](/screenshots/add-project.png)

2. **Check your account.** The `claude` you already use is listed under
   **Accounts** at the foot of the chats column, as **This account**; another
   account or an API endpoint is added with **+** beside it — see
   [Claude accounts](/docs/accounts).
3. **Press `+`** on the project's row to open a chat, and type. See
   [Chats](/docs/chats) for everything the composer can do.

## Updating

When a new release is out, a button appears in the status bar. Click it and the
app downloads and installs the update itself. On Linux it links to the release
page instead.
