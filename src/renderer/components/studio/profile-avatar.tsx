import { cn } from "@/lib/utils"
import { avatarHue, avatarLetter } from "@/lib/chat/column"

/** The two sizes an account is drawn at: a row's mark beside its name, and
 * a picker's tile. */
const SIZES = {
  xs: "size-4 text-[0.5625rem]",
  sm: "size-8 text-sm",
}

/**
 * A profile as a letter on a hue — its name's first letter, a colour picked
 * by its id so a rename keeps the colour somebody has learnt to read it by.
 *
 * One component for every place a profile is shown — the Accounts foot, the
 * composer's account picker and its toolbar button — because the point of a
 * colour is that it is the same account wherever it is met. A key glyph per
 * row said only "this is a profile", which every row in that list already is.
 */
export function ProfileAvatar({
  profile,
  size = "xs",
  className,
}: {
  profile: { id: string; name: string }
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: `oklch(0.62 0.13 ${avatarHue(profile.id)})` }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full leading-none font-semibold text-white",
        SIZES[size],
        className
      )}
    >
      {avatarLetter(profile.name)}
    </span>
  )
}
