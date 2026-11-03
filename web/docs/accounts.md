# Claude accounts

Vey runs your own Claude Code, signed in as you. If you use more than one
Claude account — work, personal, a team — sign each in once and pick which one
each chat runs on, so work for a client stays on that client's account.

## Adding an account

1. At the foot of the chats column, under the project's chats, find
   **Accounts** and click **+** beside it.
2. Give the account a name — _Work_, _Personal_, _Team_.
3. Sign in. It is Claude Code's own login, so your password never passes
   through Vey.

The `claude` you already use is listed first, as **This account**. Each account
you add is kept in a directory of its own and stays signed in. Every row says
whether it is signed in, and as whom. Open a row's menu to **Check again**, or
to **Sign in…** again (or **Sign in as another account…** on one that is
already signed in).

Each account row also shows how much of its five-hour and weekly limit is
used.

![The Accounts section at the foot of the chats column: This account with its five-hour and weekly meters](/screenshots/accounts.png)

## Adding a custom API

1. Click **+** beside **Accounts** and choose **Custom API**.
2. Pick your provider to fill in the base URL, or type your own.
3. Paste the API key. Fill in **Model** and **Fast model** if your provider's
   Claude Code guide names them; left empty, the endpoint decides.
4. Click **Save**. The endpoint appears in the list and in every chat's account
   menu, like any account.

To change it later, open its row's menu and choose **Edit endpoint…**. Leave
the key empty to keep the one already saved.

::: warning
Use endpoints you have the right to use — your provider's own plan, or your
company's gateway. Services reselling access to other people's Claude accounts
break Anthropic's terms.
:::

## Choosing the account a chat runs on

Every chat has an **Account** menu in its composer. Pick an account there
before you send, and the chat runs on it.

## How much of a plan is left

Beside the composer, a meter shows how much of the account's five-hour window
has been used. Click it for every window, including the weekly one.

![Plan usage: the 5-hour window at 19% and the 7-day window at 40%, each with when it resets](/screenshots/plan-usage.png)
