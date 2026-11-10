/**
 * Every word of the home page, in each language it is written in.
 *
 * English is the default (`/`), Vietnamese is `/vi/` — VitePress's locales,
 * one page each rather than a script swapping text, so the page arrives in
 * its language with nothing to flicker and a search engine can read both. It
 * was `/?lang=vi` while the Worker drew the page; `config.ts` sends that on.
 *
 * **The page is agent-first**: hand Claude Code several tasks at once, let it
 * work where a person would — the files, a terminal, a real browser — and read
 * what it changed. Its shape follows t3.codes': a hero, "bring your own" (the
 * plan and keys stay the user's, nothing resold — framed as that, never as
 * many accounts), three large rows each one claim with a picture and bullets,
 * the rest as a grid, the source on GitHub (`oss`), and a closing. What that
 * page has and this one does not is deliberate: no testimonials (there are
 * none to quote), no star count (a number fetched from GitHub is a number
 * that can be small), no pull requests (the app commits and pushes; it opens
 * none).
 *
 * It led with several accounts once, and before that with moving a stopped
 * chat to another account when a usage limit hit: a page selling a way past
 * another service's limits is selling the circumvention. So nothing here
 * talks about a limit as something to get around. There is no price on the
 * page either — the app has nothing to sell (Vey Pro is deleted), and a "free"
 * pillar was a pricing section by another name.
 *
 * **Plain words first**, and short sentences. What the page promises is what
 * the app does. Accounts are added from the Accounts list at the foot of the
 * chats column — there is no Settings › Claude any more.
 *
 * What stays English on purpose is the app's own vocabulary — the studio's UI
 * is English, so "Account", "Git" and the mode names are written
 * as the reader will find them on screen. The picture of the app in the hero
 * and the text inside the illustrations stay English for the same reason.
 *
 * Every language has the same shape (`Copy`), so a missing sentence is a type
 * error rather than a blank on the page.
 */

export type Lang = "en" | "vi"

export const LANGS: Lang[] = ["en", "vi"]

/** A locale's language, or English. */
export function langOf(value: unknown): Lang {
  return value === "vi" ? "vi" : "en"
}

/** Where a language's home page lives. English keeps the bare root. */
export function pathOf(lang: Lang): string {
  return lang === "en" ? "/" : `/${lang}/`
}

/** Where a language's guide lives. */
export function docsPathOf(lang: Lang): string {
  return `${pathOf(lang)}docs/`
}

/** Where the bar's Docs link goes: the guide's first page rather than its
 * index, which is a cover with nothing to read on it. */
export function docsStartOf(lang: Lang): string {
  return `${docsPathOf(lang)}getting-started`
}

/** Where a language's install page lives (`install.md`, `Install.vue`). */
export function installPathOf(lang: Lang): string {
  return `${pathOf(lang)}install`
}

/** Where a language's plugin marketplace lives (`plugins.md`, `Plugins.vue`). */
export function pluginsPathOf(lang: Lang): string {
  return `${pathOf(lang)}plugins`
}

type Section = {
  kicker: string
  title: string
  body: string
  items: { title: string; body: string }[]
}

type Spotlight = {
  kicker: string
  title: string
  body: string
  bullets: string[]
}

export type Copy = {
  htmlLang: string
  /** The switch's own label for this language. */
  short: string
  title: string
  description: string
  ogDescription: string
  nav: {
    why: string
    features: string
    faq: string
    /** The user's guide, `docsPathOf`. */
    docs: string
    /** The plugin marketplace, `pluginsPathOf`. */
    plugins: string
    download: string
    language: string
    /** The bar's link to the repository. */
    github: string
  }
  eyebrow: string
  /** The second half is the accent — set in serif italic. */
  h1: [plain: string, accent: string]
  lede: string
  /** `source` is the hero's second button, to the repository. */
  cta: { download: string; downloadFor: string; source: string }
  /** Under the buttons: the platforms, linking to the install page — every
   * build, for whoever the button's guess was wrong for — then the rest of
   * the line. */
  fine: [platforms: string, rest: string]
  /** What a chat can run on. `name` and `cmd` are the product's and the
   * CLI's own words, so they read the same in every language. */
  byo: {
    kicker: string
    title: string
    body: string
    items: { name: string; plan: string; cmd: string }[]
    note: string
  }
  /** The large rows, text beside a picture — in the order of
   * `SPOTLIGHT_ORDER` in `home/demo.ts`. */
  spotlights: Spotlight[]
  /** The studio's other parts — in the order of `FEATURE_ORDER`. */
  features: Section
  /** The source, MIT, on GitHub — a row like a spotlight, with buttons. */
  oss: Spotlight & { star: string; browse: string; license: string }
  faq: { kicker: string; title: string; items: { q: string; a: string }[] }
  closing: [plain: string, accent: string]
  closingBody: string
  /** The closing's second button, to the install page. */
  otherPlatforms: string
  /** Under the picture of the app in the hero. */
  windowCaption: string
  footer: {
    download: string
    product: string
    tagline: string
    /** The column of the repository's own pages. */
    source: string
    releases: string
    issues: string
  }
  /** The install page (`install/Install.vue`). */
  install: InstallCopy
  /** The plugin marketplace (`plugins/Plugins.vue`). */
  plugins: PluginsCopy
}

type PluginsCopy = {
  title: string
  description: string
  eyebrow: string
  h1: [plain: string, accent: string]
  lede: string
  search: string
  /** "3 plugins" — the count under the search box. */
  count: (n: number) => string
  noMatch: string
  builtin: string
  /** A built-in plugin's line in place of a version: it comes with the app. */
  builtinNote: string
  community: string
  communityEmpty: string
  by: (author: string) => string
  source: string
  how: {
    kicker: string
    title: string
    items: { title: string; body: string }[]
  }
  submit: { title: string; body: string; link: string }
}

type InstallCopy = {
  title: string
  description: string
  eyebrow: string
  h1: [plain: string, accent: string]
  lede: string
  /** The tabs' own label, for a screen reader. */
  platform: string
  /** "v1.0.17", once the latest release has answered. */
  version: (v: string) => string
  copy: string
  copied: string
  mac: {
    app: string
    appBody: string
    /** Why the `xattr` line: the builds are unsigned. */
    why: string
    arm64: string
    x64: string
  }
  windows: { app: string; appBody: string; button: string; smartScreen: string }
  linux: { app: string; appBody: string; button: string; fuse: string }
  after: {
    kicker: string
    title: string
    /** `doc` is the guide's page the step is told in full on, `docs/<doc>`. */
    items: { title: string; body: string; doc: string; more: string }[]
  }
  more: {
    kicker: string
    title: string
    releases: { title: string; body: string }
    update: { title: string; body: string }
    trouble: { title: string; body: string }
  }
}

const en: Copy = {
  htmlLang: "en",
  short: "EN",
  title: "Vey: the agent-first studio for Claude Code",
  description:
    "A desktop studio for Claude Code agents. Hand Claude several tasks at once, let it work in your files, a terminal and a real browser, then review the diff, commit and push — all in one window.",
  ogDescription:
    "Hand Claude Code the work, several tasks at once, and review what comes back — in one window.",
  nav: {
    why: "How it works",
    features: "Features",
    faq: "FAQ",
    docs: "Docs",
    plugins: "Plugins",
    download: "Download",
    language: "Language",
    github: "GitHub",
  },
  eyebrow: "Agent-first desktop studio for Claude Code",
  h1: ["Put a team of Claude agents", "to work."],
  lede: "Give every task its own Claude Code agent. They work side by side — in your files, a terminal and a real browser — and every change waits in one diff for you to review, commit and push.",
  cta: {
    download: "Download",
    downloadFor: "Download for ",
    source: "View on GitHub",
  },
  fine: ["macOS · Windows · Linux", "open source, MIT licensed"],
  byo: {
    kicker: "Bring your own Claude",
    title: "Your plan. Your keys. Nothing resold.",
    body: "Vey runs the claude CLI already on your machine, signed in as you. It sells no tokens and caps no quota: requests go from your computer to Anthropic, or to the endpoint you pick.",
    items: [
      {
        name: "Claude Pro · Max",
        plan: "Subscription",
        cmd: "claude auth login --claudeai",
      },
      {
        name: "Anthropic Console",
        plan: "API billing",
        cmd: "claude auth login --console",
      },
      {
        name: "Claude for Work",
        plan: "Team · Enterprise SSO",
        cmd: "claude auth login --sso",
      },
      { name: "Z.ai · GLM", plan: "Custom API", cmd: "api.z.ai/api/anthropic" },
      { name: "Kimi", plan: "Custom API", cmd: "api.moonshot.ai/anthropic" },
      {
        name: "DeepSeek",
        plan: "Custom API",
        cmd: "api.deepseek.com/anthropic",
      },
    ],
    note: "Any other Anthropic-compatible endpoint works the same way — OpenRouter, or your company's gateway.",
  },
  spotlights: [
    {
      kicker: "Parallel",
      title: "Every task gets its own agent.",
      body: "Start one, start another, keep going. The chats column sorts them into Needs you, Running and Recent, so you only look where you're needed.",
      bullets: [
        "A notification when an agent stops to ask",
        "Send more while it works — the message waits its turn",
        "Pop a chat out into a window of its own",
        "A worktree per task, so branches never collide",
      ],
    },
    {
      kicker: "Browser",
      title: "It opens the app and checks its own work.",
      body: "Every chat has a tabbed browser beside it. Claude navigates, reads the page, clicks, types and takes screenshots — and you watch it happen.",
      bullets: [
        "Look-only in Plan and Read only",
        "Import cookies to reach pages you're signed in to",
        "Draw on a page and hand the picture to the chat",
        "A popup opens as a new tab",
      ],
    },
    {
      kicker: "Review",
      title: "Read the diff. Draft the message. Push.",
      body: "Everything the agents changed lands in the Git tab. Read it, have Claude draft the commit message from what's staged, then commit and push without leaving the window.",
      bullets: [
        "Stage, unstage or discard file by file",
        "A commit message drafted from the staged diff",
        "Push runs in the background",
        "Who last changed a line, right in the editor",
      ],
    },
  ],
  features: {
    kicker: "And the rest",
    title: "Everything around the agent",
    body: "Room for Claude to work, and for you to keep it in check.",
    items: [
      {
        title: "Undo by editing",
        body: "Edit an earlier message, and the files Claude changed after it go back too.",
      },
      {
        title: "You decide what it may do",
        body: "Five modes, from Plan (only reads and plans) to Full access. Change it any time, even mid-chat.",
      },
      {
        title: "A branch per task",
        body: "Open a worktree inside the project and give it its own chats, so two agents never edit the same checkout.",
      },
      {
        title: "Editor and terminal",
        body: "Open any file, see who last changed each line, and run commands right under the chat.",
      },
      {
        title: "Search everything",
        body: "Find any text across all your files and every past conversation.",
      },
      {
        title: "Your MCP servers, per chat",
        body: "Every server your claude already has, as it has them — with any tool switched off for one chat alone.",
      },
    ],
  },
  oss: {
    kicker: "Open source",
    title: "Don't like something? Change it.",
    body: "Every line of Vey is on GitHub under the MIT licence, and every release is published next to the code it was built from. Read it, build it, fork it.",
    bullets: [
      "Read exactly what talks to claude and to the network",
      "Extend it with a plugin — chat export and the usage dashboard are plugins",
      "Build your own copy: bun install, then make app",
      "Bugs and ideas go to GitHub Issues",
    ],
    star: "Star on GitHub",
    browse: "Browse the source",
    license: "MIT licensed",
  },
  faq: {
    kicker: "FAQ",
    title: "Questions, answered",
    items: [
      {
        q: "What is Vey?",
        a: "A desktop studio for running Claude Code as an agent: several tasks at once, each with your files, a terminal and a browser to work in, and the diffs they leave in one place to review. It runs your own claude CLI, signed in as you.",
      },
      {
        q: "Is Vey open source?",
        a: "Yes — the whole app, under the MIT licence, at github.com/veystudioapp/vey. The releases are published there too, next to the code they are built from.",
      },
      {
        q: "Can Claude change my files without asking?",
        a: "Only as far as you let it. Each chat has a mode, from Plan (it only reads and plans) to Full access, and you can change it mid-chat. Edit an earlier message and the files Claude changed after it go back too.",
      },
      {
        q: "Can two agents work on one repository?",
        a: "Yes. Give each its own worktree — New worktree… in the project's menu — and they work on separate branches, with their chats listed together under the project.",
      },
      {
        q: "Do I need Claude Code installed?",
        a: "Yes. Vey runs your own claude CLI, with your login, your settings and your MCP servers.",
      },
      {
        q: "Where do my requests go?",
        a: "Straight from the app to Anthropic on your own account, or to the endpoint you set up. Vey's own server only receives anonymous usage counts — how long the app is in use, its version and OS — never anything about what you work on.",
      },
      {
        q: "Which platforms?",
        a: "macOS 12 or newer, on Apple Silicon or Intel; Windows and Linux on x64. The app updates itself when a new release is out.",
      },
    ],
  },
  closing: ["Hand it off. ", "Read it back."],
  closingBody:
    "Download Vey, open a folder you already work in, and give Claude its first task.",
  otherPlatforms: "Other platforms",
  windowCaption: "An agent at work, and what it changed.",
  footer: {
    download: "Download",
    product: "Product",
    tagline: "The agent-first studio for Claude Code.",
    source: "Open source",
    releases: "Releases",
    issues: "Issues",
  },
  install: {
    title: "Install Vey for macOS, Windows or Linux",
    description:
      "Download Vey, the agent-first desktop studio for Claude Code, for macOS, Windows or Linux.",
    eyebrow: "Agent-first desktop studio for Claude Code",
    h1: ["Install", "Vey."],
    lede: "Download the app for your computer, open a project and hand Claude its first task.",
    platform: "Platform",
    version: (v) => `Latest: v${v}`,
    copy: "Copy",
    copied: "Copied",
    mac: {
      app: "Download the .dmg",
      appBody:
        "Open it and drag Vey into Applications. Then run this once, or macOS will say the app is damaged:",
      why: "Vey isn't signed with an Apple certificate yet, so macOS quarantines a .dmg downloaded in a browser and then says the app is “damaged”. The command above lifts that quarantine.",
      arm64: "Apple Silicon",
      x64: "Intel",
    },
    windows: {
      app: "Download the installer",
      appBody: "x64. Run the .exe; it installs the app and opens it.",
      button: "Download for Windows",
      smartScreen:
        "The installer isn't signed yet, so SmartScreen stops it the first time: click “More info”, then “Run anyway”.",
    },
    linux: {
      app: "Download the AppImage",
      appBody:
        "x64. The AppImage is the whole app: make it executable and run it.",
      button: "Download AppImage",
      fuse: "It needs FUSE. On Debian and Ubuntu:",
    },
    after: {
      kicker: "After installing",
      title: "Your first chat in three steps",
      items: [
        {
          title: "Open a project",
          body: "Click + beside Projects and pick a folder already on your computer. Vey works on it where it is.",
          doc: "projects-and-files",
          more: "Projects and files",
        },
        {
          title: "Check Claude Code",
          body: "The claude you already use is listed under Accounts at the bottom of the chats column, as This account.",
          doc: "accounts",
          more: "Claude accounts",
        },
        {
          title: "Hand off a task",
          body: "Press + Chat and describe the work. What it changes shows up in the Git tab, ready to review.",
          doc: "chats",
          more: "Chats",
        },
      ],
    },
    more: {
      kicker: "More",
      title: "Everything else",
      releases: {
        title: "Every release",
        body: "Older versions and every build, with their notes, on GitHub.",
      },
      update: {
        title: "Updating",
        body: "The app checks for new releases itself. When one is out, a button appears in the status bar: click it and it installs. On Linux it opens the release page instead.",
      },
      trouble: {
        title: "Something not working?",
        body: "claude can't be found, an account won't sign in, a chat seems stuck: the fixes are in the guide.",
      },
    },
  },
  plugins: {
    title: "Plugins for Vey",
    description:
      "Browse the plugins for Vey, the agent-first desktop studio for Claude Code — the ones built in and the ones the community writes.",
    eyebrow: "Plugin marketplace",
    h1: ["Plugins for", "Vey."],
    lede: "What the app can be taught to do beyond what it ships with. This page is for looking: installing happens inside Vey, under Plugins › Marketplace.",
    search: "Search plugins",
    count: (n) => (n === 1 ? "1 plugin" : `${n} plugins`),
    noMatch: "No plugin matches that.",
    builtin: "Built in",
    builtinNote: "Comes with Vey, on unless you switch it off.",
    community: "Community",
    communityEmpty:
      "No community plugins yet. Yours could be the first — see below.",
    by: (author) => `by ${author}`,
    source: "Source",
    how: {
      kicker: "Installing",
      title: "Install from inside the app",
      items: [
        {
          title: "Open Plugins",
          body: "Click the puzzle piece in the rail on the left of the window.",
        },
        {
          title: "Search the Marketplace",
          body: "Switch to the Marketplace tab, search, and press Install. Vey downloads the plugin and checks it against the marketplace's checksum.",
        },
        {
          title: "Switch it on",
          body: "A new plugin arrives off. Turn it on in the Installed tab once you've decided to run it — a plugin has the whole of the app's access.",
        },
      ],
    },
    submit: {
      title: "List your plugin",
      body: "The marketplace is one file in the repository. Open a pull request adding your plugin's entry — its zip's URL and checksum — to marketplace/plugins.json.",
      link: "How to list a plugin",
    },
  },
}

const vi: Copy = {
  htmlLang: "vi",
  short: "VI",
  title: "Vey: studio agent-first cho Claude Code",
  description:
    "Studio desktop cho các agent Claude Code. Giao cho Claude nhiều việc cùng lúc, để nó làm trong file, terminal và một trình duyệt thật, rồi xem lại diff, commit và push — tất cả trong một cửa sổ.",
  ogDescription:
    "Giao việc cho Claude Code, nhiều việc cùng lúc, rồi xem lại những gì nó làm — trong một cửa sổ.",
  nav: {
    why: "Cách hoạt động",
    features: "Tính năng",
    faq: "Hỏi đáp",
    docs: "Hướng dẫn",
    plugins: "Plugin",
    download: "Tải về",
    language: "Ngôn ngữ",
    github: "GitHub",
  },
  eyebrow: "Studio desktop agent-first cho Claude Code",
  h1: ["Cả một đội agent Claude,", "làm việc cho bạn."],
  lede: "Mỗi việc một agent Claude Code. Chúng làm song song — trong file, terminal và một trình duyệt thật — và mọi thay đổi nằm chung trong một diff, chờ bạn xem lại, commit và push.",
  cta: {
    download: "Tải về",
    downloadFor: "Tải cho ",
    source: "Xem trên GitHub",
  },
  fine: ["macOS · Windows · Linux", "mã nguồn mở, giấy phép MIT"],
  byo: {
    kicker: "Dùng Claude của bạn",
    title: "Gói của bạn. Key của bạn. Không bán lại.",
    body: "Vey chạy chính claude CLI có sẵn trên máy bạn, đăng nhập bằng tài khoản của bạn. Không bán token, không giới hạn quota: yêu cầu đi thẳng từ máy bạn đến Anthropic, hoặc đến endpoint bạn chọn.",
    items: [
      {
        name: "Claude Pro · Max",
        plan: "Gói thuê bao",
        cmd: "claude auth login --claudeai",
      },
      {
        name: "Anthropic Console",
        plan: "Trả theo API",
        cmd: "claude auth login --console",
      },
      {
        name: "Claude for Work",
        plan: "Team · Enterprise SSO",
        cmd: "claude auth login --sso",
      },
      { name: "Z.ai · GLM", plan: "Custom API", cmd: "api.z.ai/api/anthropic" },
      { name: "Kimi", plan: "Custom API", cmd: "api.moonshot.ai/anthropic" },
      {
        name: "DeepSeek",
        plan: "Custom API",
        cmd: "api.deepseek.com/anthropic",
      },
    ],
    note: "Mọi endpoint tương thích Anthropic khác cũng dùng được như vậy — OpenRouter, hay gateway của công ty bạn.",
  },
  spotlights: [
    {
      kicker: "Song song",
      title: "Mỗi việc một agent.",
      body: "Giao việc này, giao việc khác, cứ thế làm tiếp. Cột chat chia chúng thành Needs you, Running và Recent, nên bạn chỉ cần nhìn chỗ đang cần mình.",
      bullets: [
        "Có thông báo khi một agent dừng lại để hỏi",
        "Gửi thêm trong lúc nó đang làm — tin nhắn chờ đến lượt",
        "Tách một chat ra cửa sổ riêng",
        "Mỗi việc một worktree, các nhánh không bao giờ đụng nhau",
      ],
    },
    {
      kicker: "Trình duyệt",
      title: "Nó tự mở app và tự kiểm tra việc mình làm.",
      body: "Mỗi chat có một trình duyệt nhiều tab bên cạnh. Claude tự điều hướng, đọc trang, bấm, gõ và chụp màn hình — còn bạn ngồi xem.",
      bullets: [
        "Chỉ được nhìn ở Plan và Read only",
        "Nhập cookie để vào những trang bạn đã đăng nhập",
        "Vẽ lên trang rồi gửi ảnh cho chat",
        "Popup mở thành tab mới",
      ],
    },
    {
      kicker: "Duyệt lại",
      title: "Đọc diff. Soạn message. Push.",
      body: "Mọi thứ các agent đã sửa đều hiện trong tab Git. Đọc lại, để Claude soạn commit message từ những gì đã stage, rồi commit và push mà không rời cửa sổ.",
      bullets: [
        "Stage, unstage hay discard từng file",
        "Commit message soạn từ diff đã stage",
        "Push chạy ngầm",
        "Ai sửa dòng này gần nhất, ngay trong editor",
      ],
    },
  ],
  features: {
    kicker: "Và còn nữa",
    title: "Mọi thứ quanh agent",
    body: "Đủ chỗ cho Claude làm việc, và để bạn kiểm soát nó.",
    items: [
      {
        title: "Sửa tin nhắn để hoàn tác",
        body: "Sửa một tin nhắn trước đó, và các file Claude đã sửa sau tin nhắn ấy cũng trở về như cũ.",
      },
      {
        title: "Bạn quyết định nó được làm gì",
        body: "Năm chế độ, từ Plan (chỉ đọc và lên kế hoạch) đến Full access. Đổi bất cứ lúc nào, kể cả giữa cuộc chat.",
      },
      {
        title: "Mỗi việc một nhánh",
        body: "Mở một worktree ngay trong project và cho nó các chat riêng, để hai agent không bao giờ sửa chung một checkout.",
      },
      {
        title: "Editor và terminal",
        body: "Mở bất kỳ file nào, xem ai sửa từng dòng gần nhất, và chạy lệnh ngay dưới chat.",
      },
      {
        title: "Tìm kiếm mọi thứ",
        body: "Tìm bất kỳ đoạn chữ nào trong mọi file và mọi cuộc chat trước đây.",
      },
      {
        title: "MCP server của bạn, theo từng chat",
        body: "Mọi server claude của bạn đang có, giữ nguyên như vậy — và tắt được bất kỳ tool nào cho riêng một chat.",
      },
    ],
  },
  oss: {
    kicker: "Mã nguồn mở",
    title: "Có gì không ưng? Sửa nó.",
    body: "Toàn bộ mã nguồn Vey nằm trên GitHub theo giấy phép MIT, và mọi bản phát hành được đăng ngay cạnh mã nguồn đã build ra nó. Đọc, tự build, hay fork tuỳ bạn.",
    bullets: [
      "Đọc chính xác phần nào nói chuyện với claude và với mạng",
      "Mở rộng bằng plugin — xuất chat và bảng thống kê usage đều là plugin",
      "Tự build bản của bạn: bun install, rồi make app",
      "Báo lỗi và góp ý qua GitHub Issues",
    ],
    star: "Star trên GitHub",
    browse: "Xem mã nguồn",
    license: "Giấy phép MIT",
  },
  faq: {
    kicker: "Hỏi đáp",
    title: "Câu hỏi thường gặp",
    items: [
      {
        q: "Vey là gì?",
        a: "Một studio desktop để chạy Claude Code như một agent: nhiều việc cùng lúc, việc nào cũng có file, terminal và trình duyệt để làm, và các diff chúng để lại nằm ở một chỗ để bạn duyệt. Nó chạy chính claude CLI của bạn, đăng nhập bằng tài khoản của bạn.",
      },
      {
        q: "Vey có phải mã nguồn mở không?",
        a: "Có — toàn bộ ứng dụng, theo giấy phép MIT, tại github.com/veystudioapp/vey. Các bản phát hành cũng được đăng ở đó, ngay cạnh mã nguồn đã build ra chúng.",
      },
      {
        q: "Claude có tự sửa file mà không hỏi không?",
        a: "Chỉ trong phạm vi bạn cho phép. Mỗi chat có một chế độ, từ Plan (chỉ đọc và lên kế hoạch) đến Full access, và đổi được giữa chừng. Sửa một tin nhắn trước đó thì các file Claude đã sửa sau tin nhắn ấy cũng trở về như cũ.",
      },
      {
        q: "Hai agent làm chung một repository được không?",
        a: "Được. Cho mỗi agent một worktree riêng — New worktree… trong menu của project — là chúng làm trên các nhánh khác nhau, còn chat của chúng vẫn nằm chung dưới project.",
      },
      {
        q: "Tôi có cần cài Claude Code không?",
        a: "Có. Vey chạy chính claude CLI của bạn, với thông tin đăng nhập, cấu hình và các MCP server của bạn.",
      },
      {
        q: "Yêu cầu của tôi được gửi đi đâu?",
        a: "Đi thẳng từ ứng dụng đến Anthropic bằng tài khoản của bạn, hoặc đến endpoint bạn tự cấu hình. Server của Vey chỉ nhận số liệu sử dụng ẩn danh — ứng dụng được dùng bao lâu, phiên bản và hệ điều hành — không bao giờ có gì về những việc bạn làm.",
      },
      {
        q: "Chạy được trên nền tảng nào?",
        a: "macOS 12 trở lên, chip Apple Silicon hoặc Intel; Windows và Linux bản x64. Ứng dụng tự cập nhật khi có bản mới.",
      },
    ],
  },
  closing: ["Giao việc đi. ", "Rồi đọc lại."],
  closingBody:
    "Tải Vey, mở một thư mục bạn đang làm, và giao cho Claude việc đầu tiên.",
  otherPlatforms: "Nền tảng khác",
  windowCaption: "Một agent đang làm việc, và những gì nó đã sửa.",
  footer: {
    download: "Tải về",
    product: "Sản phẩm",
    tagline: "Studio agent-first cho Claude Code.",
    source: "Mã nguồn mở",
    releases: "Bản phát hành",
    issues: "Báo lỗi",
  },
  install: {
    title: "Cài Vey cho macOS, Windows hoặc Linux",
    description:
      "Tải Vey, studio desktop agent-first cho Claude Code, cho macOS, Windows hoặc Linux.",
    eyebrow: "Studio desktop agent-first cho Claude Code",
    h1: ["Cài đặt", "Vey."],
    lede: "Tải ứng dụng cho máy của bạn, mở một project và giao cho Claude việc đầu tiên.",
    platform: "Nền tảng",
    version: (v) => `Mới nhất: v${v}`,
    copy: "Chép",
    copied: "Đã chép",
    mac: {
      app: "Tải file .dmg",
      appBody:
        "Mở file và kéo Vey vào Applications. Sau đó chạy lệnh này một lần, nếu không macOS sẽ báo ứng dụng bị hỏng:",
      why: "Vey chưa được ký bằng chứng chỉ của Apple, nên macOS cách ly file .dmg tải bằng trình duyệt và báo ứng dụng “bị hỏng”. Lệnh trên gỡ việc cách ly đó.",
      arm64: "Apple Silicon",
      x64: "Intel",
    },
    windows: {
      app: "Tải bộ cài",
      appBody: "Bản x64. Chạy file .exe; nó cài ứng dụng rồi mở lên.",
      button: "Tải cho Windows",
      smartScreen:
        "Bộ cài chưa được ký, nên lần đầu SmartScreen sẽ chặn: bấm “More info”, rồi “Run anyway”.",
    },
    linux: {
      app: "Tải AppImage",
      appBody:
        "Bản x64. AppImage là toàn bộ ứng dụng: cấp quyền chạy rồi mở nó.",
      button: "Tải AppImage",
      fuse: "Cần có FUSE. Trên Debian và Ubuntu:",
    },
    after: {
      kicker: "Sau khi cài",
      title: "Cuộc chat đầu tiên trong ba bước",
      items: [
        {
          title: "Mở một project",
          body: "Bấm + cạnh Projects và chọn một thư mục đã có trên máy. Vey làm việc ngay tại chỗ, không sao chép nó.",
          doc: "projects-and-files",
          more: "Project và file",
        },
        {
          title: "Kiểm tra Claude Code",
          body: "claude bạn đang dùng có sẵn trong Accounts ở cuối cột chat, tên là This account.",
          doc: "accounts",
          more: "Tài khoản Claude",
        },
        {
          title: "Giao một việc",
          body: "Bấm + Chat và mô tả việc cần làm. Những gì nó sửa hiện trong tab Git, sẵn sàng để xem lại.",
          doc: "chats",
          more: "Chat",
        },
      ],
    },
    more: {
      kicker: "Thêm",
      title: "Những thứ khác",
      releases: {
        title: "Mọi phiên bản",
        body: "Các phiên bản cũ và mọi bản build, kèm ghi chú, trên GitHub.",
      },
      update: {
        title: "Cập nhật",
        body: "Ứng dụng tự kiểm tra bản mới. Khi có, một nút hiện ở thanh trạng thái: bấm vào là nó tự cài. Trên Linux, nút này mở trang phát hành.",
      },
      trouble: {
        title: "Gặp trục trặc?",
        body: "Không tìm thấy claude, tài khoản không đăng nhập được, chat có vẻ bị treo: cách xử lý có trong hướng dẫn.",
      },
    },
  },
  plugins: {
    title: "Plugin cho Vey",
    description:
      "Xem các plugin cho Vey, studio desktop agent-first cho Claude Code — plugin có sẵn và plugin do cộng đồng viết.",
    eyebrow: "Marketplace plugin",
    h1: ["Plugin cho", "Vey."],
    lede: "Những gì app có thể làm thêm ngoài phần có sẵn. Trang này để xem: việc cài đặt diễn ra ngay trong Vey, ở Plugin › Marketplace.",
    search: "Tìm plugin",
    count: (n) => `${n} plugin`,
    noMatch: "Không có plugin nào khớp.",
    builtin: "Có sẵn",
    builtinNote: "Đi kèm Vey, luôn bật trừ khi bạn tắt nó.",
    community: "Cộng đồng",
    communityEmpty:
      "Chưa có plugin cộng đồng nào. Plugin của bạn có thể là cái đầu tiên — xem bên dưới.",
    by: (author) => `của ${author}`,
    source: "Mã nguồn",
    how: {
      kicker: "Cài đặt",
      title: "Cài ngay trong app",
      items: [
        {
          title: "Mở Plugin",
          body: "Bấm biểu tượng mảnh ghép ở thanh bên trái cửa sổ.",
        },
        {
          title: "Tìm trong Marketplace",
          body: "Chuyển sang tab Marketplace, tìm và bấm Cài. Vey tải plugin về và đối chiếu với checksum của marketplace.",
        },
        {
          title: "Bật nó lên",
          body: "Plugin mới cài sẽ ở trạng thái tắt. Bật nó trong tab Đã cài khi bạn đã quyết định chạy — plugin có toàn bộ quyền của app.",
        },
      ],
    },
    submit: {
      title: "Đưa plugin của bạn lên",
      body: "Marketplace là một file trong repository. Mở pull request thêm mục của plugin — URL file zip và checksum — vào marketplace/plugins.json.",
      link: "Cách đưa plugin lên",
    },
  },
}

export const COPY: Record<Lang, Copy> = { en, vi }
