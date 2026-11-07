export const locales = ["fa", "en", "de", "es"] as const;
export type RouteLocale = (typeof locales)[number];
/** Locales persisted by the current account API. New UI locales roll out by page family. */
export type AppLocale = "fa" | "en";
export const defaultLocale: AppLocale = "fa";

export const localeDirection: Record<RouteLocale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
  de: "ltr",
  es: "ltr",
};

export function isAppLocale(value: string): value is AppLocale {
  return value === "fa" || value === "en";
}

export function isRouteLocale(value: string): value is RouteLocale {
  return (locales as readonly string[]).includes(value);
}
