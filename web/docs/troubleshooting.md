# Troubleshooting

## "Could not find `claude`"

Vey runs your own Claude Code CLI, and looks for it the way your login
shell would. If it is installed somewhere your shell's `PATH` does not reach,
set `CLAUDE_BIN` to the full path of the `claude` executable before starting
the app. **Settings › Updates** shows which version was found.

## An account is not signed in

Open the account's menu under **Accounts**, at the foot of the chats column.
**Check again** asks the account again; **Sign in…** signs it in once more. Each account is its own Claude Code login, so signing out of
one does not touch the others.

## A chat stopped at the limit

That account is out of its five-hour (or weekly) window. The card on the chat
says when it resets; send your next message after that and the chat carries
on with the whole conversation.

## A chat seems stuck

- A **shield** on its row means it is waiting for you: open it and answer the
  card above the composer.
- Otherwise press **Stop**, then send your message again.

## Where is my data?

Your projects stay where they are. Vey's own data — the list of projects,
your settings, chats and Claude account logins — is under
`~/.veystudio` on your machine. Every chat goes straight from your own
Claude accounts to Anthropic, or to the custom API endpoint you set up. Vey's
own server only receives anonymous usage counts — how long the app is in use,
its version and OS — never anything about your projects or chats.
