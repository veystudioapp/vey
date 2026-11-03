import { cn } from "@/lib/utils"

// The drawing is `.spinner` in `styles/motion.css` — two sets of dots on its
// pseudo-elements — which says why it is no longer the VS lettermark.
function Spinner({
  className,
  "aria-label": label = "Loading",
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn("spinner size-4 shrink-0", className)}
      {...props}
    />
  )
}

export { Spinner }
