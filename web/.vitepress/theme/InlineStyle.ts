import { defineComponent, h } from "vue"

/**
 * A `<style>` that lives exactly as long as the component holding it — how
 * the home page's stylesheet stays off the guide's pages, including after a
 * client-side navigation between them. A template cannot hold `<style>`, and
 * a text child would be HTML-escaped by the server render (`>` in a selector
 * becomes `&gt;`), so it is `innerHTML`.
 */
export default defineComponent({
  props: { css: { type: String, required: true } },
  setup(props) {
    return () => h("style", { innerHTML: props.css })
  },
})
