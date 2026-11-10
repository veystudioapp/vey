<script setup lang="ts">
import { computed, ref } from "vue"
import { useData } from "vitepress"

import { MARK, WORDMARK } from "../brand.ts"
import { COPY, docsPathOf, langOf, pathOf } from "../copy.ts"
import InlineStyle from "../InlineStyle.ts"
import { ICON, REPO_URL } from "../links.ts"
import { BUILTIN, COMMUNITY, matches } from "./catalog.ts"
import css from "./plugins.css?inline"

/*
 * The plugin marketplace, `/plugins` and `/vi/plugins`: every plugin there is,
 * searched — the built-in ones, then the catalog's. **For looking only.**
 * Installing is the app's (Plugins › Marketplace), which downloads the zip and
 * checks it against the catalog's checksum; a download button here would be a
 * second install path that checks nothing.
 */

const { lang } = useData()
const current = computed(() => langOf(lang.value))
const t = computed(() => COPY[current.value].plugins)
const nav = computed(() => COPY[current.value].nav)
const home = computed(() => pathOf(current.value))
const docs = computed(() => docsPathOf(current.value))
const year = new Date().getFullYear()
const LOGO = MARK + WORDMARK
const LISTING_URL = `${REPO_URL}/blob/main/marketplace/README.md`

const query = ref("")
const builtin = computed(() => BUILTIN.filter((p) => matches(p, query.value)))
const community = computed(() =>
  COMMUNITY.filter((p) => matches(p, query.value))
)
const total = computed(() => builtin.value.length + community.value.length)
</script>

<template>
  <div class="plugins-page">
    <InlineStyle :css="css" />

    <div class="wrap">
      <header class="hero">
        <span class="chip">{{ t.eyebrow }}</span>
        <h1>
          {{ t.h1[0] }} <em class="accent">{{ t.h1[1] }}</em>
        </h1>
        <p class="lede">{{ t.lede }}</p>
      </header>

      <div class="search">
        <input
          v-model="query"
          type="search"
          :placeholder="t.search"
          :aria-label="t.search"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="count" aria-live="polite">{{ t.count(total) }}</span>
      </div>

      <p v-if="total === 0" class="empty">{{ t.noMatch }}</p>

      <section v-if="builtin.length" class="group">
        <h2 class="kicker">{{ t.builtin }}</h2>
        <ul class="cards">
          <li v-for="p in builtin" :key="p.id" class="card">
            <div class="card-head">
              <img v-if="p.icon" :src="p.icon" alt="" class="icon" />
              <span v-else class="icon blank"></span>
              <h3>{{ p.name }}</h3>
              <span class="badge">{{ t.builtin }}</span>
            </div>
            <p>{{ p.description }}</p>
            <div class="card-foot">
              <span>{{ t.builtinNote }}</span>
              <a
                v-if="p.repo"
                :href="p.repo"
                target="_blank"
                rel="noopener"
                class="source"
                >{{ t.source }} <i v-html="ICON.arrow"></i
              ></a>
            </div>
          </li>
        </ul>
      </section>

      <section class="group">
        <h2 class="kicker">{{ t.community }}</h2>
        <p v-if="COMMUNITY.length === 0" class="empty">
          {{ t.communityEmpty }}
        </p>
        <ul v-else-if="community.length" class="cards">
          <li v-for="p in community" :key="p.id" class="card">
            <div class="card-head">
              <span class="icon blank"></span>
              <h3>{{ p.name }}</h3>
              <span v-if="p.version" class="version">v{{ p.version }}</span>
            </div>
            <p>{{ p.description }}</p>
            <div v-if="p.tags.length" class="tags">
              <span v-for="tag in p.tags" :key="tag">{{ tag }}</span>
            </div>
            <div class="card-foot">
              <span v-if="p.author">{{ t.by(p.author) }}</span>
              <a
                v-if="p.repo"
                :href="p.repo"
                target="_blank"
                rel="noopener"
                class="source"
                >{{ t.source }} <i v-html="ICON.arrow"></i
              ></a>
            </div>
          </li>
        </ul>
      </section>

      <section class="how">
        <div class="head">
          <span class="kicker">{{ t.how.kicker }}</span>
          <h2>{{ t.how.title }}</h2>
        </div>
        <ol class="steps">
          <li v-for="(item, i) in t.how.items" :key="i">
            <span class="num">{{ String(i + 1).padStart(2, "0") }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
          </li>
        </ol>
        <a class="submit" :href="LISTING_URL" target="_blank" rel="noopener">
          <h3>{{ t.submit.title }} <i v-html="ICON.arrow"></i></h3>
          <p>{{ t.submit.body }}</p>
          <span class="more">{{ t.submit.link }}</span>
        </a>
      </section>
    </div>

    <footer>
      <div class="wrap">
        <a class="logo" :href="home" v-html="LOGO"></a>
        <nav>
          <a :href="`${home}#features`">{{ nav.features }}</a>
          <a :href="`${docs}settings`">{{ nav.docs }}</a>
        </nav>
        <p class="copy">© {{ year }} Vey</p>
      </div>
    </footer>
  </div>
</template>
