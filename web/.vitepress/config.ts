import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { defineConfig, type HeadConfig } from "vitepress"

import { MARK_ICON_URL } from "./theme/brand.ts"
import { COPY, installPathOf, LANGS, pathOf, type Lang } from "./theme/copy.ts"
import { REPO_URL } from "./theme/links.ts"

/*
 * The site — the home page and the user's guide — built into `.vitepress/dist/`
 * (VitePress's default), which is gitignored and emptied by each build: a file
 * meant to be served goes in `public/`, which VitePress copies across.
 */

/*
 * The address the site is served at. The build cannot know its own domain, and
 * a search engine or a link card needs an absolute one for the canonical, the
 * sitemap, `og:url` and the hreflang alternates — so `SITE_URL` is set at build
 * time (`SITE_URL=https://… bun run build`). Unset, those are left out rather
 * than written as a path nothing can resolve.
 */
const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/+$/, "")

/** `path` as an absolute URL when the site's address is known. */
function absoluteOf(path: string): string {
  return SITE_URL ? `${SITE_URL}${path}` : path
}

/** The paths a crawler has no reason to read: the Worker's API and the
 * pages the app opens, which are reached from it, not searched for. */
const NOT_CRAWLED = ["/api/", "/v1/", "/signin/", "/pay/", "/checkout"]

/** `<` is written as `<`, so a string in the JSON cannot end its script. */
function ldJson(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c")
}

const OG_LOCALE: Record<Lang, string> = { en: "en_US", vi: "vi_VN" }

/**
 * The home page's head: what a search engine reads for its title, its
 * description and what it is about (`robots`, the canonical, the structured
 * data), and what a link card reads (`og:*`, `twitter:*`).
 */
function homeHead(lang: Lang): HeadConfig[] {
  const t = COPY[lang]
  const url = absoluteOf(pathOf(lang))
  const image = absoluteOf("/screenshots/chat.png")

  const software = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Vey",
    description: t.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    inLanguage: lang,
    url: SITE_URL ? url : undefined,
    image,
    // Free, all of it — nothing is sold.
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    license: "https://opensource.org/licenses/MIT",
    sameAs: [REPO_URL],
  }
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }

  return [
    ...(SITE_URL
      ? [["link", { rel: "canonical", href: url }] as HeadConfig]
      : []),
    [
      "meta",
      { name: "robots", content: "index, follow, max-image-preview:large" },
    ],
    ["meta", { property: "og:title", content: "Vey" }],
    ["meta", { property: "og:description", content: t.ogDescription }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Vey" }],
    ["meta", { property: "og:locale", content: OG_LOCALE[lang] }],
    ...(SITE_URL
      ? [["meta", { property: "og:url", content: url }] as HeadConfig]
      : []),
    // Without `SITE_URL` this is a path: Slack, Discord and X resolve it,
    // Facebook wants it absolute.
    ["meta", { property: "og:image", content: image }],
    ["meta", { property: "og:image:alt", content: `Vey: ${t.windowCaption}` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "Vey" }],
    ["meta", { name: "twitter:description", content: t.ogDescription }],
    ["meta", { name: "twitter:image", content: image }],
    ...LANGS.map((l): HeadConfig => [
      "link",
      {
        rel: "alternate",
        hreflang: COPY[l].htmlLang,
        href: absoluteOf(pathOf(l)),
      },
    ]),
    [
      "link",
      { rel: "alternate", hreflang: "x-default", href: absoluteOf("/") },
    ],
    ["script", { type: "application/ld+json" }, ldJson(software)],
    ["script", { type: "application/ld+json" }, ldJson(faq)],
  ]
}

/** The install page's head: its canonical and its other language. */
function installHead(lang: Lang): HeadConfig[] {
  const t = COPY[lang].install
  const url = absoluteOf(installPathOf(lang))
  return [
    ...(SITE_URL
      ? [["link", { rel: "canonical", href: url }] as HeadConfig]
      : []),
    ["meta", { property: "og:title", content: t.title }],
    ["meta", { property: "og:description", content: t.description }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: OG_LOCALE[lang] }],
    ...LANGS.map((l): HeadConfig => [
      "link",
      {
        rel: "alternate",
        hreflang: COPY[l].htmlLang,
        href: absoluteOf(installPathOf(l)),
      },
    ]),
  ]
}

/** Which language's install page a page is, if it is one. */
function installOf(relativePath: string): Lang | null {
  return (
    LANGS.find(
      (lang) => `${installPathOf(lang).slice(1)}.md` === relativePath
    ) ?? null
  )
}

/** Which language's home page a page is, if it is one. */
function homeOf(relativePath: string): Lang | null {
  return (
    LANGS.find((lang) => `${pathOf(lang).slice(1)}index.md` === relativePath) ??
    null
  )
}

const searchVi = {
  translations: {
    button: { buttonText: "Tìm kiếm", buttonAriaLabel: "Tìm kiếm" },
    modal: {
      noResultsText: "Không tìm thấy kết quả cho",
      resetButtonTitle: "Xoá",
      footer: {
        selectText: "chọn",
        navigateText: "di chuyển",
        closeText: "đóng",
      },
    },
  },
}

export default defineConfig({
  title: "Vey",
  // Workers' static assets resolve `/docs/foo` to `foo.html` themselves.
  cleanUrls: true,
  lastUpdated: true,
  // The home page is dark and has no switch; the guide is part of it.
  appearance: "force-dark",
  head: [
    ["link", { rel: "icon", href: MARK_ICON_URL }],
    ["meta", { name: "theme-color", content: "#09090c" }],
    // Set before first paint, so a section waiting to `.reveal` is hidden
    // only when there is a script to reveal it.
    ["script", {}, `document.documentElement.classList.add("js")`],
    // Vietnamese was `/?lang=vi` while the Worker drew the home page. The
    // assets are answered before the Worker sees a request, so the old link
    // is sent on here rather than by a route.
    [
      "script",
      {},
      `if(location.pathname==="/"&&new URLSearchParams(location.search).get("lang")==="vi")location.replace("/vi/"+location.hash)`,
    ],
  ],

  // The home page's title, description and alternates are its copy's, so
  // they cannot drift from the words on it.
  transformPageData(pageData) {
    const install = installOf(pageData.relativePath)
    if (install) {
      const t = COPY[install].install
      pageData.title = t.title
      pageData.description = t.description
      pageData.titleTemplate = false
      pageData.frontmatter.head = installHead(install)
      return
    }
    const lang = homeOf(pageData.relativePath)
    if (!lang) return
    const t = COPY[lang]
    pageData.title = t.title
    pageData.description = t.description
    pageData.titleTemplate = false
    pageData.frontmatter.head = homeHead(lang)
  },

  // Only with an address to put in it: a sitemap of relative URLs is not one.
  sitemap: SITE_URL ? { hostname: SITE_URL } : undefined,

  // `robots.txt` is written after the build, because `public/` is emptied at
  // the start of it and the sitemap's line needs the address above.
  buildEnd(siteConfig) {
    const lines = [
      "User-agent: *",
      "Allow: /",
      ...NOT_CRAWLED.map((path) => `Disallow: ${path}`),
    ]
    if (SITE_URL) lines.push("", `Sitemap: ${SITE_URL}/sitemap.xml`)
    writeFileSync(
      join(siteConfig.outDir, "robots.txt"),
      lines.join("\n") + "\n"
    )
  },

  themeConfig: {
    logo: "/mark.svg",
    search: { provider: "local", options: { locales: { vi: searchVi } } },
  },

  locales: {
    root: {
      label: "English",
      lang: "en",
      description: "How to use Vey, the desktop studio for Claude Code.",
      themeConfig: {
        sidebar: [
          {
            text: "Guide",
            items: [
              { text: "Getting started", link: "/docs/getting-started" },
              { text: "Claude accounts", link: "/docs/accounts" },
            ],
          },
          {
            text: "Using the studio",
            items: [
              { text: "Chats", link: "/docs/chats" },
              { text: "Projects and files", link: "/docs/projects-and-files" },
              { text: "Git", link: "/docs/git" },
              {
                text: "Terminal and search",
                link: "/docs/terminal-and-search",
              },
              { text: "Settings and plugins", link: "/docs/settings" },
            ],
          },
          {
            text: "Reference",
            items: [
              { text: "Keyboard shortcuts", link: "/docs/shortcuts" },
              { text: "Troubleshooting", link: "/docs/troubleshooting" },
            ],
          },
        ],
      },
    },
    vi: {
      label: "Tiếng Việt",
      lang: "vi",
      description: "Hướng dẫn sử dụng Vey, studio desktop cho Claude Code.",
      themeConfig: {
        sidebar: [
          {
            text: "Hướng dẫn",
            items: [
              { text: "Bắt đầu", link: "/vi/docs/getting-started" },
              { text: "Tài khoản Claude", link: "/vi/docs/accounts" },
            ],
          },
          {
            text: "Dùng studio",
            items: [
              { text: "Chat", link: "/vi/docs/chats" },
              { text: "Project và file", link: "/vi/docs/projects-and-files" },
              { text: "Git", link: "/vi/docs/git" },
              {
                text: "Terminal và tìm kiếm",
                link: "/vi/docs/terminal-and-search",
              },
              { text: "Cài đặt và plugin", link: "/vi/docs/settings" },
            ],
          },
          {
            text: "Tham khảo",
            items: [
              { text: "Phím tắt", link: "/vi/docs/shortcuts" },
              { text: "Xử lý sự cố", link: "/vi/docs/troubleshooting" },
            ],
          },
        ],
        outline: { label: "Trên trang này" },
        docFooter: { prev: "Trang trước", next: "Trang sau" },
        lastUpdated: { text: "Cập nhật lần cuối" },
        darkModeSwitchLabel: "Giao diện",
        sidebarMenuLabel: "Menu",
        returnToTopLabel: "Lên đầu trang",
        langMenuLabel: "Ngôn ngữ",
      },
    },
  },
})
