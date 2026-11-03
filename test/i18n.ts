import { en } from "../src/renderer/lib/i18n/en"
import { vi } from "../src/renderer/lib/i18n/vi"
import {
  isLanguageChoice,
  resolveLocale,
  translate,
} from "../src/renderer/lib/i18n"
import { check, finish, section } from "./harness"

/** Every leaf as `path → text`. */
function leaves(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else for (const [k, v] of leaves(value, path)) out.set(k, v)
  }
  return out
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

section("the dictionaries agree")
{
  const english = leaves(en)
  const vietnamese = leaves(vi)
  // The types already refuse a missing key; this is for the one they cannot
  // see — a placeholder renamed on one side, which would print `{name}`.
  const extra = [...vietnamese.keys()].filter((key) => !english.has(key))
  check("no key only Vietnamese has", extra.length === 0, extra)
  const mismatched = [...english].filter(([key, text]) => {
    const other = vietnamese.get(key)
    return (
      other === undefined ||
      placeholders(other).join() !== placeholders(text).join()
    )
  })
  check(
    "every key has the same placeholders",
    mismatched.length === 0,
    mismatched.map(([key]) => key)
  )
  const empty = [...vietnamese].filter(([, text]) => text.trim() === "")
  check("no empty translation", empty.length === 0, empty)
}

section("translate")
check(
  "fills a placeholder",
  translate("vi", "settings.plugins.updated", { name: "X" }) ===
    "Đã cập nhật X."
)
check(
  "leaves an unfilled placeholder showing",
  translate("en", "settings.updates.current").includes("{version}")
)
check(
  "an unknown key comes back as itself",
  translate("vi", "nope.missing" as never) === "nope.missing"
)

section("language choice")
check("system is a choice", isLanguageChoice("system"))
check("vi is a choice", isLanguageChoice("vi"))
check("fr is not", !isLanguageChoice("fr"))
check("a locale resolves to itself", resolveLocale("vi") === "vi")

finish()
