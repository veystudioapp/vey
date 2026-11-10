import { useState } from "react"
import { Puzzle } from "lucide-react"

import { pluginUrl, type PluginInfo } from "@shared/plugins"
import { cn } from "@/lib/utils"

/**
 * The icon a plugin's manifest names, or the puzzle piece for one that names
 * none — or whose file does not decode.
 *
 * An `img`, so the icon is drawn in its own colours: it may be a PNG logo as
 * easily as an SVG mark. The cost is that an SVG written the way the app's own
 * marks are, `stroke="currentColor"`, comes out black, since an image has no
 * current colour to inherit — a plugin's icon carries its colour in the file.
 * An `img` is also the element that never runs an SVG's scripts.
 *
 * The version is the cache-buster, so an update's new icon is fetched rather
 * than the old one kept.
 */
export function PluginIcon({
  plugin,
  className,
}: {
  plugin: PluginInfo
  className?: string
}) {
  const url =
    plugin.hasIcon && !plugin.error
      ? pluginUrl(plugin.id, "icon", plugin.manifest?.version)
      : null
  // Keyed by URL rather than a flag, so a Reload that brings a fixed icon
  // tries again.
  const [broken, setBroken] = useState<string | null>(null)

  if (!url || broken === url) {
    return (
      <Puzzle
        aria-hidden
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    )
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setBroken(url)}
      className={cn("size-4 shrink-0 object-contain", className)}
    />
  )
}
