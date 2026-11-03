<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { Content, useData } from "vitepress"
import DefaultTheme from "vitepress/theme"

import NavBar from "./NavBar.vue"

const { Layout: GuideLayout } = DefaultTheme
const { frontmatter } = useData()

/** `index.md` and `vi/index.md`: the home page, drawn by `Home.vue` alone. */
const isHome = computed(() => frontmatter.value.layout === "home-page")
/** A page drawn by its own component rather than the guide's layout: the
 * home page, or the install page (`Install.vue`). */
const isOwn = computed(
  () => isHome.value || frontmatter.value.layout === "install-page"
)

// Clear over the haze at the top; a surface only once there is text
// scrolling under it.
const scrolled = ref(false)
const onScroll = () => (scrolled.value = window.scrollY > 0)
onMounted(() => {
  onScroll()
  window.addEventListener("scroll", onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll))
</script>

<!--
  Every page of the site comes through here, so the bar is drawn once, in
  one place, above whichever page it is — the home page and the guide cannot
  disagree about it. Under it is the home page, the install page, or
  VitePress's layout for the guide, whose own bar `site.css` hides.
-->
<template>
  <div class="sky" aria-hidden="true"></div>
  <header class="site-header" :class="{ scrolled }">
    <div class="site-header-inner">
      <NavBar :on-home="isHome" />
    </div>
  </header>
  <Content v-if="isOwn" />
  <GuideLayout v-else />
</template>
