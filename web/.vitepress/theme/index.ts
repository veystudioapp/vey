import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme"

import DownloadButton from "./DownloadButton.vue"
import Home from "./home/Home.vue"
import Install from "./install/Install.vue"
import Layout from "./Layout.vue"
import "./site.css"
import "./brand.css"

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // `index.md` and `vi/index.md` are `<Home />` and nothing else, under
    // `layout: home-page` (`Layout.vue`); `install.md` and `vi/install.md`
    // are `<Install />` the same way, under `layout: install-page`.
    app.component("Home", Home)
    app.component("Install", Install)
    app.component("DownloadButton", DownloadButton)
  },
} satisfies Theme
