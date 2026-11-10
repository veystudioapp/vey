<script setup lang="ts">
import { computed } from "vue"
import { useData } from "vitepress"
import { VPNavBarSearch } from "vitepress/theme"

import { MARK, WORDMARK } from "./brand.ts"
import {
  COPY,
  LANGS,
  docsStartOf,
  installPathOf,
  langOf,
  pathOf,
  pluginsPathOf,
} from "./copy.ts"
import { ICON, REPO_URL, slugOf } from "./links.ts"

/*
 * The bar across the top of every page, the same on each — search included,
 * so the guide can be searched from the home page. On the home page its
 * links are the page's own anchors; on the guide's they lead back to them.
 * The language switch goes to this same page in the other language.
 */
const props = defineProps<{ onHome?: boolean }>()

const LOGO = MARK + WORDMARK

const { lang, page } = useData()
const current = computed(() => langOf(lang.value))
const t = computed(() => COPY[current.value].nav)
const home = computed(() => pathOf(current.value))
const at = computed(() => (props.onHome ? "" : home.value))
const slug = computed(() => slugOf(page.value.relativePath))
</script>

<template>
  <nav class="site-nav">
    <a class="logo" :href="home" v-html="LOGO"></a>
    <div class="pill">
      <a :href="`${at}#why`">{{ t.why }}</a>
      <a :href="`${at}#features`">{{ t.features }}</a>
      <a :href="`${at}#faq`">{{ t.faq }}</a>
      <a :href="pluginsPathOf(current)">{{ t.plugins }}</a>
      <a :href="docsStartOf(current)">{{ t.docs }}</a>
    </div>
    <div class="nav-end">
      <VPNavBarSearch class="site-search" />
      <div class="lang" role="group" :aria-label="t.language">
        <span class="contents" v-html="ICON.globe"></span>
        <a
          v-for="l in LANGS"
          :key="l"
          :href="pathOf(l) + slug"
          :hreflang="COPY[l].htmlLang"
          :lang="COPY[l].htmlLang"
          :aria-current="l === current ? 'true' : undefined"
          >{{ COPY[l].short }}</a
        >
      </div>
      <a
        class="github"
        :href="REPO_URL"
        :aria-label="t.github"
        :title="t.github"
        v-html="ICON.github"
      ></a>
      <!-- The install page rather than a file: on a Mac a browser's .dmg is
           quarantined, and the page says how to open it anyway. -->
      <a class="button ghost download" :href="installPathOf(current)"
        ><span>{{ t.download }}</span
        ><i v-html="ICON.download"></i
      ></a>
    </div>
  </nav>
</template>
