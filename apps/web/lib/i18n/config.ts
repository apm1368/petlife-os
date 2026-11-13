export const locales = ["fa", "en", "de", "es", "ar", "nl"] as const;
export type RouteLocale = (typeof locales)[number];
/** Locales with complete copy for the currently localized public/auth surfaces. */
export type AppLocale = "fa" | "en";
export const defaultLocale: AppLocale = "fa";

export const localeDirection: Record<RouteLocale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
  de: "ltr",
  es: "ltr",
  ar: "rtl",
  nl: "ltr",
};

export function isAppLocale(value: string): value is AppLocale {
  return value === "fa" || value === "en";
}

export function isRouteLocale(value: string): value is RouteLocale {
  return (locales as readonly string[]).includes(value);
}

const LOCALE_ALTERNATION = locales.join("|");

/**
 * The language segment at the start of a path ("/ar", "/nl/shop", "/fa?x=1"), built from `locales` so every
 * language — including one added later — is recognised everywhere. Use it instead of a hand-written
 * /^\/(fa|en|…)/ (four such copies once broke /ar and /nl: links became /ar/ar/…).
 */
export const LOCALE_PREFIX = new RegExp(`^/(${LOCALE_ALTERNATION})(?=[/?#]|$)`);

/** The path without its language segment ("/ar/shop" → "/shop", "/ar" → ""). */
export function stripLocalePrefix(path: string): string {
  return path.replace(LOCALE_PREFIX, "");
}

/** True when the path already starts with a language segment. */
export function hasLocalePrefix(path: string): boolean {
  return LOCALE_PREFIX.test(path);
}
