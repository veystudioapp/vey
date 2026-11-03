/** The first launch — `claude-setup.tsx`, `onboarding-tour.tsx`, the splash. */
export const onboarding = {
  language: "Language",
  lookingForClaude: "Looking for Claude Code…",
  setup: {
    pageInstall: "Install",
    pageSignIn: "Sign in",
    pageWelcome: "Welcome",
    installedTitle: "Claude Code is installed",
    installedDetail:
      "{claude} {version} — every chat here runs on it, in the project’s own folder.",
    signedInTitle: "You are signed in",
    signedInDetail: "Chats run under one of your Claude profiles.",
    checkingSignIn: "Checking your sign-in…",
    signIn: "Sign in",
    getStarted: "Get started",
    skipInstall: "Already installed? Continue without checking",
    skipSignIn: "Continue without signing in",
    checkAgain: "Check again",
    accountsChip: "3 accounts",
    installTitle: "Install Claude Code",
    installBody:
      "Chats run on the Claude Code CLI, which this machine does not have yet. Run this in {shell}, then press Check again.",
    installElsewhere:
      "Installed elsewhere? Set {env} to its path and restart. More options in the {guide}.",
    setupGuide: "setup guide",
    signInTitle: "Sign in to Claude",
    signInBody:
      "{claude} is installed. Sign in once, with a Claude subscription or a Console account, and every chat runs as that account.",
    signInMore:
      "More accounts can be added later under Accounts, at the foot of the chats column.",
    welcomeTitle: "Welcome to Vey",
    welcomeBody: "You are all set. A short tour of the window comes next.",
    accountsTitle: "All your Claude accounts",
    accountsDetail:
      "Sign in to as many as you have, each with its five-hour window in view.",
    switchTitle: "Switch without starting over",
    switchDetail:
      "A chat that hits its limit continues on another account, conversation and all.",
    copyCommand: "Copy the command",
  },
  tour: {
    progress: "{index} of {total}",
    skip: "Skip tour",
    projectsTitle: "Your projects",
    projectsBody:
      "One icon per folder this workspace points at. Pick one and the column beside it lists its chats; pick it again to hide the column. A number on an icon is chats waiting on you, a spinner is one working.",
    paletteTitle: "Run a command",
    paletteBody:
      "{shortcut} opens the palette: go to a file or a chat by name, or run anything the studio can do.",
    composerTitle: "Chats, side by side",
    composerBody:
      "Each chat is a claude conversation in one project's directory. Several can run at once, and the row in the column says which are answering and which are waiting on you.",
    accountsTitle: "Your accounts",
    accountsBody:
      "Every Claude account you sign in to, with how much of its five-hour window is used. + adds another. A chat stopped by its limit offers to continue on one with room.",
    explorerTitle: "The Explorer",
    explorerBody:
      "Every file in the checkout, and under Git, what has changed since the last commit and the commits before it.",
  },
}
