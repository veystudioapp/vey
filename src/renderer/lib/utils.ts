import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `text-chat` and `text-menu` are sizes from `globals.css`'s theme.
// Unregistered, the merge reads them as colours and keeps the `text-sm` they
// were meant to replace, and which of the two wins is down to stylesheet order.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["chat", "menu"] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
