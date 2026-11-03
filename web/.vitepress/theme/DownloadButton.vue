<script setup lang="ts">
import { useBuild, type Build } from "./download.ts"
import { ICON } from "./links.ts"

/*
 * A download in the guide's own words, for `getting-started.md`: one named
 * build, straight to its file, so the page never has to send anybody to the
 * releases page to find it.
 */
const props = defineProps<{ build: Build }>()
const { href } = useBuild(props.build)
</script>

<template>
  <a class="button ghost download-build" :href="href"
    ><span><slot /></span><i v-html="ICON.download"></i
  ></a>
</template>

<style scoped>
/* `.vp-doc a` underlines and colours every link in a page's body. */
.vp-doc a.download-build {
  color: var(--vp-c-text-1);
  text-decoration: none;
  margin: 0.25rem 0.5rem 0.25rem 0;
}
.vp-doc a.download-build span {
  padding: 0.5rem 0.9rem;
}
</style>
