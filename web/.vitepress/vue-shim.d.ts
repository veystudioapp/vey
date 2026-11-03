// `tsc -p .` sees the theme's `.vue` and `?inline` imports; Vite resolves
// both itself, so all the type check needs is that they exist.
declare module "*.vue" {
  import type { DefineComponent } from "vue"
  const component: DefineComponent
  export default component
}

declare module "*.css?inline" {
  const css: string
  export default css
}
