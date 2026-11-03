<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useData } from "vitepress"

import { APP_MARK, MARK, WORDMARK } from "../brand.ts"
import {
  COPY,
  LANGS,
  docsStartOf,
  installPathOf,
  langOf,
  pathOf,
} from "../copy.ts"
import InlineStyle from "../InlineStyle.ts"
import { hashOf, useDownload } from "../download.ts"
import { ICON, ISSUES_URL, RELEASES_URL, REPO_URL } from "../links.ts"
import { FEATURE_ART } from "./art.ts"
import {
  demoCss,
  FEATURE_ORDER,
  nth,
  SPARKLE,
  SPOTLIGHT_ORDER,
} from "./demo.ts"
import css from "./home.css?inline"

/*
 * The home page: what Vey is and where to download it. The words are
 * `copy.ts`', one set per language.
 *
 * **Restraint is the look.** The first version had a gradient on every
 * headline, glows, twinkling sparks and a ring of light round a price — and
 * read as generated. What is left: one accent colour, hairlines, small radii,
 * cells that share their borders like a table, a serif italic where a
 * headline wants weight, and motion only where it shows the product working.
 * The violet-to-amber gradient is the logo's.
 *
 * Every animation arrives at what the markup already draws, so taking it
 * away — reduced motion, no script — leaves the page whole.
 */

const { lang } = useData()
const t = computed(() => COPY[langOf(lang.value)])
const home = computed(() => pathOf(langOf(lang.value)))
const guide = computed(() => docsStartOf(langOf(lang.value)))
// Every build, named — for a Mac the button guessed wrong for, or another OS.
const downloads = computed(() => installPathOf(langOf(lang.value)))
const year = new Date().getFullYear()
const style = css + "\n" + demoCss()
const LOGO = MARK + WORDMARK
const STACK = "<span></span><span></span>" + APP_MARK

// The install page open on this OS's tab, for when the button is not the
// file: a Mac, or a release GitHub has not answered for.
const installHref = computed(() =>
  os.value ? downloads.value + hashOf(os.value) : downloads.value
)
const { os, href: fileHref } = useDownload(() => installHref.value)
// Not the file on a Mac: a browser's .dmg is quarantined and Gatekeeper calls
// the unsigned app "damaged", so the button goes to the install page, which
// hands over the `.dmg` with the `xattr` line that opens it. Windows and Linux
// open the file they are handed, so they are still handed it.
const downloadHref = computed(() =>
  os.value === "macOS" ? installHref.value : fileHref.value
)
const downloadIcon = computed(() =>
  os.value === "macOS" ? ICON.arrow : ICON.download
)
const downloadLabel = computed(() =>
  os.value ? t.value.cta.downloadFor + os.value : t.value.cta.download
)

const root = ref<HTMLElement>()
const demo = ref<HTMLVideoElement>()
let seen: IntersectionObserver | undefined

onMounted(() => {
  // Autoplay ignores the stylesheet's reduced-motion rule, so the video
  // is held on its first frame here instead.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    demo.value?.pause()
  }

  // Each section comes up once, as it is reached. No observer, no hiding:
  // everything is shown at once instead.
  const items = root.value?.querySelectorAll(".reveal") ?? []
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"))
    return
  }
  seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add("in")
        seen?.unobserve(entry.target)
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  )
  items.forEach((el) => seen?.observe(el))
})

onBeforeUnmount(() => seen?.disconnect())
</script>

<template>
  <div ref="root" class="home-page">
    <InlineStyle :css="style" />

    <div class="wrap">
      <header class="hero">
        <span class="chip enter"
          ><span class="contents" v-html="SPARKLE"></span>{{ t.eyebrow }}</span
        >
        <h1 class="enter" style="--d: 0.08s">
          {{ t.h1[0] }} <em class="accent">{{ t.h1[1] }}</em>
        </h1>
        <p class="lede enter" style="--d: 0.16s">{{ t.lede }}</p>
        <div class="ctas enter" style="--d: 0.24s">
          <a class="button primary download" :href="downloadHref"
            ><span>{{ downloadLabel }}</span
            ><i v-html="downloadIcon"></i
          ></a>
          <a class="button ghost" :href="REPO_URL"
            ><span>{{ t.cta.source }}</span
            ><i v-html="ICON.github"></i
          ></a>
        </div>
        <p class="fine enter" style="--d: 0.3s">
          <a :href="downloads">{{ t.fine[0] }}</a
          >&nbsp;·&nbsp;{{ t.fine[1] }}
        </p>

        <figure class="window-frame enter" style="--d: 0.4s">
          <video
            ref="demo"
            class="window"
            src="/demo/vey-studio-demo.mp4"
            autoplay
            muted
            loop
            playsinline
            preload="metadata"
            aria-hidden="true"
          ></video>
          <figcaption>{{ t.windowCaption }}</figcaption>
        </figure>
      </header>

      <section id="why" class="spots">
        <article v-for="(spot, i) in t.spotlights" :key="i" class="spot reveal">
          <div class="spot-text">
            <span class="kicker">{{ spot.kicker }}</span>
            <h2>{{ spot.title }}</h2>
            <p>{{ spot.body }}</p>
            <ul>
              <li v-for="(bullet, j) in spot.bullets" :key="j">
                {{ bullet }}
              </li>
            </ul>
          </div>
          <div class="art" v-html="FEATURE_ART[SPOTLIGHT_ORDER[i]]()"></div>
        </article>
      </section>

      <section class="byo">
        <div class="head reveal">
          <span class="kicker">{{ t.byo.kicker }}</span>
          <h2>{{ t.byo.title }}</h2>
          <p>{{ t.byo.body }}</p>
        </div>
        <div class="grid">
          <div
            v-for="(item, i) in t.byo.items"
            :key="i"
            class="cell reveal"
            :style="`--d:${(i % 3) * 0.06}s`"
          >
            <span class="plan">{{ item.plan }}</span>
            <h3>{{ item.name }}</h3>
            <code>{{ item.cmd }}</code>
          </div>
        </div>
        <p class="note reveal">{{ t.byo.note }}</p>
      </section>

      <section id="features">
        <div class="head reveal">
          <span class="kicker">{{ t.features.kicker }}</span>
          <h2>{{ t.features.title }}</h2>
          <p>{{ t.features.body }}</p>
        </div>
        <div class="grid">
          <article
            v-for="(item, i) in t.features.items"
            :key="i"
            class="cell reveal"
            :style="`--d:${(i % 3) * 0.06}s`"
          >
            <span class="num">{{ nth(i) }}</span>
            <div class="art" v-html="FEATURE_ART[FEATURE_ORDER[i]]()"></div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
          </article>
        </div>
      </section>

      <section id="source" class="spots oss">
        <article class="spot reveal">
          <div class="spot-text">
            <span class="kicker">{{ t.oss.kicker }}</span>
            <h2>{{ t.oss.title }}</h2>
            <p>{{ t.oss.body }}</p>
            <ul>
              <li v-for="(bullet, j) in t.oss.bullets" :key="j">
                {{ bullet }}
              </li>
            </ul>
            <div class="oss-ctas">
              <a class="button primary" :href="REPO_URL"
                ><span>{{ t.oss.star }}</span
                ><i v-html="ICON.github"></i
              ></a>
              <a class="button ghost" :href="REPO_URL + '/tree/main'"
                ><span>{{ t.oss.browse }}</span
                ><i v-html="ICON.arrow"></i
              ></a>
            </div>
            <p class="license">{{ t.oss.license }}</p>
          </div>
          <div class="art" v-html="FEATURE_ART.source()"></div>
        </article>
      </section>

      <section id="faq">
        <div class="head reveal">
          <span class="kicker">{{ t.faq.kicker }}</span>
          <h2>{{ t.faq.title }}</h2>
        </div>
        <div class="faq">
          <details v-for="(item, i) in t.faq.items" :key="i" class="reveal">
            <summary>{{ item.q }}</summary>
            <p>{{ item.a }}</p>
          </details>
        </div>
      </section>

      <section class="closing">
        <div class="stack reveal" aria-hidden="true" v-html="STACK"></div>
        <h2 class="reveal">
          {{ t.closing[0] }}<em class="accent">{{ t.closing[1] }}</em>
        </h2>
        <p class="closing-body reveal">{{ t.closingBody }}</p>
        <div class="ctas reveal">
          <a class="button primary download" :href="downloadHref"
            ><span>{{ downloadLabel }}</span
            ><i v-html="downloadIcon"></i
          ></a>
          <a class="button ghost" :href="downloads"
            ><span>{{ t.otherPlatforms }}</span
            ><i v-html="ICON.arrow"></i
          ></a>
        </div>
      </section>
    </div>

    <footer>
      <div class="wrap">
        <div class="brand">
          <a class="logo" :href="home" v-html="LOGO"></a>
          <p>{{ t.footer.tagline }}</p>
          <p class="copy">© {{ year }} Vey</p>
        </div>
        <div>
          <h4>{{ t.footer.product }}</h4>
          <ul>
            <li>
              <a href="#features">{{ t.nav.features }}</a>
            </li>
            <li>
              <a href="#faq">{{ t.nav.faq }}</a>
            </li>
            <li>
              <a :href="downloads">{{ t.footer.download }}</a>
            </li>
            <li>
              <a :href="guide">{{ t.nav.docs }}</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>{{ t.footer.source }}</h4>
          <ul>
            <li>
              <a :href="REPO_URL">{{ t.nav.github }}</a>
            </li>
            <li>
              <a :href="RELEASES_URL">{{ t.footer.releases }}</a>
            </li>
            <li>
              <a :href="ISSUES_URL">{{ t.footer.issues }}</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>{{ t.nav.language }}</h4>
          <ul>
            <li v-for="l in LANGS" :key="l">
              <a :href="pathOf(l)" :hreflang="COPY[l].htmlLang">{{
                l === "en" ? "English" : "Tiếng Việt"
              }}</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  </div>
</template>
