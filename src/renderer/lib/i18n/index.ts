import { useCallback } from "react"
import { create } from "zustand"

import { en, type Messages } from "./en"
import { vi } from "./vi"

/**
 * The studio's words in more than one language.
 *
 * Written here rather than taken from i18next: what the UI needs is a key
 * looked up and a `{name}` filled in, and a library for that brings namespaces,
 * backends and a plural engine to hold two dictionaries that are imported
 * whole. Vietnamese has no plural forms at all, so the one rule English needs —
 * a `_one` sibling read when the count is 1 — is all there is.
 *
 * Free of the settings store on purpose: the pure modules under `lib/` that
 * produce a label can call `t()` and stay importable by the tests, which see
 * English. `applyLanguage` is what moves it, from a subscription in the
 * workbench — the same arrangement as `applyAppearance`.
 */

export const LOCALES = ["en", "vi"] as const
export type Locale = (typeof LOCALES)[number]

/** What the setting holds: a locale, or whatever the machine is set to. */
export type LanguageChoice = Locale | "system"

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return value === "system" || LOCALES.includes(value as Locale)
}

/** Each language named in itself, so the picker is readable by somebody who
 * cannot read the language it is currently in. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  vi: "Tiếng Việt",
}

const DICTIONARIES: Record<Locale, Messages> = { en, vi }

/** `"settings.title"` for every leaf of the dictionary. */
type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Paths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type MessageKey = Paths<Messages>

export type MessageVars = Record<string, string | number>

/** The locale a `"system"` choice comes out as. Electron's `navigator.language`
 * is the OS's, so this is the language the rest of the machine is in. */
export function systemLocale(): Locale {
  const language =
    typeof navigator === "undefined" ? "en" : navigator.language.toLowerCase()
  return language.startsWith("vi") ? "vi" : "en"
}

export function resolveLocale(choice: LanguageChoice): Locale {
  return choice === "system" ? systemLocale() : choice
}

const useLocaleStore = create<{ locale: Locale }>(() => ({ locale: "en" }))

/** The locale being drawn in right now. */
export function currentLocale(): Locale {
  return useLocaleStore.getState().locale
}

/** Switches the whole UI over: every `useT()` re-renders, and `<html lang>`
 * follows so the spell checker and hyphenation agree with the words. */
export function applyLanguage(choice: LanguageChoice): void {
  const locale = resolveLocale(choice)
  if (typeof document !== "undefined") document.documentElement.lang = locale
  if (useLocaleStore.getState().locale !== locale) {
    useLocaleStore.setState({ locale })
  }
}

function lookup(dictionary: Messages, key: string): string | undefined {
  let node: unknown = dictionary
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : undefined
}

/** `{name}` filled from `vars`; a placeholder with no value is left showing,
 * which is louder in review than an empty gap. */
function fill(template: string, vars: MessageVars | undefined): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  )
}

/**
 * One message in `locale`. A `count` of 1 reads the key's `_one` sibling when
 * there is one. A key missing from a dictionary falls back to English and
 * then to the key itself — the types keep the first from happening, but a
 * key built at runtime is not something they can see.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: MessageVars
): string {
  const dictionary = DICTIONARIES[locale]
  const singular =
    vars?.count === 1
      ? (lookup(dictionary, `${key}_one`) ?? lookup(en, `${key}_one`))
      : undefined
  const template = singular ?? lookup(dictionary, key) ?? lookup(en, key) ?? key
  return fill(template, vars)
}

/** For code outside a component. It reads the locale at the moment it is
 * called, so a label computed once and kept will not follow a switch. */
export function t(key: MessageKey, vars?: MessageVars): string {
  return translate(currentLocale(), key, vars)
}

export type Translate = typeof t

/** The component-side `t`, re-rendering its caller when the language moves.
 * Stable per locale, so it can sit in a dependency list. */
export function useT(): Translate {
  const locale = useLocaleStore((state) => state.locale)
  return useCallback<Translate>(
    (key, vars) => translate(locale, key, vars),
    [locale]
  )
}

export function useLocale(): Locale {
  return useLocaleStore((state) => state.locale)
}
