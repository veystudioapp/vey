import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { PluginApp } from "@/lib/plugins/app"

import { PortsDialog } from "./dialog"

/**
 * The system bar's `Ports`: what is listening, and a Stop for it.
 *
 * A plugin so it can be switched off — it is a tool for the `EADDRINUSE` a dev
 * server leaves behind, and somebody who never meets one has a button they
 * never press. Listing and signalling stay in main (`main/ports.ts`), reached
 * as `app.ports`: a page has no `lsof` and no `kill`. The dialog draws itself
 * the way the usage dashboard does, in a React root of its own under `body`,
 * one at a time.
 */
export default {
  onload(app: PluginApp) {
    let open: { root: Root; host: HTMLElement } | null = null

    const close = () => {
      if (!open) return
      open.root.unmount()
      open.host.remove()
      open = null
    }

    const show = () => {
      if (open) return
      const host = document.createElement("div")
      host.dataset.plugin = app.manifest.id
      document.body.append(host)
      const root = createRoot(host)
      open = { root, host }
      root.render(
        createElement(PortsDialog, {
          t: app.t,
          ports: app.ports,
          onClose: close,
        })
      )
    }

    // Switching the plugin off with the dialog up takes the dialog down too.
    app.register(close)

    app.addStatusBarItem({
      id: "open",
      label: app.t("nav.systemBar.ports"),
      title: app.t("nav.systemBar.portsTitle"),
      icon: "network",
      run: show,
    })
  },
}
