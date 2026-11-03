<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import { useData } from "vitepress"

import { MARK, WORDMARK } from "../brand.ts"
import { COPY, docsPathOf, langOf, pathOf } from "../copy.ts"
import {
  hashOf,
  OSES,
  osOfHash,
  useBuild,
  useOs,
  useVersion,
  type Os,
} from "../download.ts"
import InlineStyle from "../InlineStyle.ts"
import { ICON, RELEASES_URL } from "../links.ts"
import css from "./install.css?inline"

/*
 * The install page, `/install` and `/vi/install`: every build, named, with
 * what each OS asks before it opens one — the download section the home page
 * used to send people to the guide for. A tab per OS, the reader's own open.
 *
 * **On a Mac the `.dmg` comes with its `xattr` line.** The builds are
 * unsigned, so a `.dmg` from a browser is quarantined and Gatekeeper calls
 * the app "damaged" until the quarantine is lifted.
 */

const { lang } = useData()
const current = computed(() => langOf(lang.value))
const t = computed(() => COPY[current.value].install)
const nav = computed(() => COPY[current.value].nav)
const home = computed(() => pathOf(current.value))
const docs = computed(() => docsPathOf(current.value))
const year = new Date().getFullYear()
const LOGO = MARK + WORDMARK

// The tab the address names (`#windows`, as the home page's button links
// here) over the one guessed from the browser; macOS until either is known,
// which is also what the server renders.
const detected = useOs()
const tab = ref<Os>("macOS")
const onHash = () => {
  const os = osOfHash(location.hash)
  if (os) tab.value = os
}
onMounted(() => {
  tab.value = osOfHash(location.hash) ?? detected.value ?? "macOS"
  window.addEventListener("hashchange", onHash)
})
onBeforeUnmount(() => window.removeEventListener("hashchange", onHash))

/** A tab chosen here goes into the address too, so a copied link opens on
 * it. Replaced rather than pushed: Back leaves the page, not the tab, and
 * VitePress keeps its scroll position in `history.state`. */
function select(os: Os) {
  tab.value = os
  history.replaceState(history.state, "", hashOf(os))
}
const version = useVersion()

// `reactive`, because a template unwraps only top-level refs: a ref inside a
// plain object reached `href` as itself, `[object Object]`.
const builds = reactive({
  macArm64: useBuild("mac-arm64").href,
  macX64: useBuild("mac-x64").href,
  windows: useBuild("windows").href,
  linux: useBuild("linux").href,
})

const COMMANDS = {
  quarantine: `xattr -dr com.apple.quarantine "/Applications/Vey.app"`,
  appImage: "chmod +x Vey-*.AppImage\n./Vey-*.AppImage",
  fuse: "sudo apt install libfuse2",
}

// Which block's Copy says "Copied", for a moment.
const copied = ref<string | null>(null)
let reset: ReturnType<typeof setTimeout> | undefined
async function copy(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  copied.value = id
  clearTimeout(reset)
  reset = setTimeout(() => (copied.value = null), 1600)
}

// The tabs as a tablist: the arrow keys move between them.
function step(by: number) {
  const i = OSES.indexOf(tab.value)
  select(OSES[(i + by + OSES.length) % OSES.length]!)
  document.getElementById(`tab-${tab.value}`)?.focus()
}
</script>

<template>
  <div class="install-page">
    <InlineStyle :css="css" />

    <div class="wrap">
      <header class="hero">
        <span class="chip">{{ t.eyebrow }}</span>
        <h1>
          {{ t.h1[0] }} <em class="accent">{{ t.h1[1] }}</em>
        </h1>
        <p class="lede">{{ t.lede }}</p>
      </header>

      <section class="platforms">
        <div class="tabs-row">
          <div
            class="os-tabs"
            role="tablist"
            :aria-label="t.platform"
            @keydown.right.prevent="step(1)"
            @keydown.left.prevent="step(-1)"
          >
            <button
              v-for="os in OSES"
              :id="`tab-${os}`"
              :key="os"
              type="button"
              role="tab"
              :aria-selected="tab === os"
              :aria-controls="`panel-${os}`"
              :tabindex="tab === os ? 0 : -1"
              :class="{ on: tab === os }"
              @click="select(os)"
            >
              {{ os }}
            </button>
          </div>
          <span v-if="version" class="version">{{ t.version(version) }}</span>
        </div>

        <!-- Every panel is drawn, and only `.js` hides the ones not chosen
             (`install.css`): without a script the page is all three. -->
        <div
          id="panel-macOS"
          class="panel"
          :class="{ on: tab === 'macOS' }"
          role="tabpanel"
          aria-labelledby="tab-macOS"
        >
          <article class="option primary">
            <header>
              <h2>{{ t.mac.app }}</h2>
            </header>
            <div class="buttons">
              <a class="button primary" :href="builds.macArm64"
                ><span>{{ t.mac.arm64 }}</span
                ><i v-html="ICON.download"></i
              ></a>
              <a class="button ghost" :href="builds.macX64"
                ><span>{{ t.mac.x64 }}</span
                ><i v-html="ICON.download"></i
              ></a>
            </div>
            <p>{{ t.mac.appBody }}</p>
            <div class="command">
              <pre><code><span class="prompt">$ </span>{{ COMMANDS.quarantine }}</code></pre>
              <button
                type="button"
                @click="copy('quarantine', COMMANDS.quarantine)"
              >
                {{ copied === "quarantine" ? t.copied : t.copy }}
              </button>
            </div>
            <p class="note">{{ t.mac.why }}</p>
          </article>
        </div>

        <div
          id="panel-Windows"
          class="panel"
          :class="{ on: tab === 'Windows' }"
          role="tabpanel"
          aria-labelledby="tab-Windows"
        >
          <article class="option primary">
            <header>
              <h2>{{ t.windows.app }}</h2>
            </header>
            <p>{{ t.windows.appBody }}</p>
            <div class="buttons">
              <a class="button primary" :href="builds.windows"
                ><span>{{ t.windows.button }}</span
                ><i v-html="ICON.download"></i
              ></a>
            </div>
            <p class="note">{{ t.windows.smartScreen }}</p>
          </article>
        </div>

        <div
          id="panel-Linux"
          class="panel"
          :class="{ on: tab === 'Linux' }"
          role="tabpanel"
          aria-labelledby="tab-Linux"
        >
          <article class="option primary">
            <header>
              <h2>{{ t.linux.app }}</h2>
            </header>
            <p>{{ t.linux.appBody }}</p>
            <div class="buttons">
              <a class="button primary" :href="builds.linux"
                ><span>{{ t.linux.button }}</span
                ><i v-html="ICON.download"></i
              ></a>
            </div>
            <div class="command">
              <pre><code>{{ COMMANDS.appImage }}</code></pre>
              <button
                type="button"
                @click="copy('appImage', COMMANDS.appImage)"
              >
                {{ copied === "appImage" ? t.copied : t.copy }}
              </button>
            </div>
            <p>{{ t.linux.fuse }}</p>
            <div class="command">
              <pre><code><span class="prompt">$ </span>{{ COMMANDS.fuse }}</code></pre>
              <button type="button" @click="copy('fuse', COMMANDS.fuse)">
                {{ copied === "fuse" ? t.copied : t.copy }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section>
        <div class="head">
          <span class="kicker">{{ t.after.kicker }}</span>
          <h2>{{ t.after.title }}</h2>
        </div>
        <ol class="steps grid">
          <li v-for="(item, i) in t.after.items" :key="i" class="cell">
            <span class="num">{{ String(i + 1).padStart(2, "0") }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
            <a class="more" :href="`${docs}${item.doc}`"
              >{{ item.more }} <i v-html="ICON.arrow"></i
            ></a>
          </li>
        </ol>
      </section>

      <section class="last">
        <div class="head">
          <span class="kicker">{{ t.more.kicker }}</span>
          <h2>{{ t.more.title }}</h2>
        </div>
        <div class="grid">
          <a
            class="cell link"
            :href="RELEASES_URL"
            target="_blank"
            rel="noopener"
          >
            <h3>{{ t.more.releases.title }} <i v-html="ICON.arrow"></i></h3>
            <p>{{ t.more.releases.body }}</p>
          </a>
          <a class="cell link" :href="`${docs}getting-started#updating`">
            <h3>{{ t.more.update.title }} <i v-html="ICON.arrow"></i></h3>
            <p>{{ t.more.update.body }}</p>
          </a>
          <a class="cell link" :href="`${docs}troubleshooting`">
            <h3>{{ t.more.trouble.title }} <i v-html="ICON.arrow"></i></h3>
            <p>{{ t.more.trouble.body }}</p>
          </a>
        </div>
      </section>
    </div>

    <footer>
      <div class="wrap">
        <a class="logo" :href="home" v-html="LOGO"></a>
        <nav>
          <a :href="`${home}#why`">{{ nav.why }}</a>
          <a :href="`${home}#features`">{{ nav.features }}</a>
          <a :href="`${docs}getting-started`">{{ nav.docs }}</a>
        </nav>
        <p class="copy">© {{ year }} Vey</p>
      </div>
    </footer>
  </div>
</template>
