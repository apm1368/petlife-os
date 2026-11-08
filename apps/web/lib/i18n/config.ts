export const locales = ["fa", "en", "de", "es"] as const;
export type RouteLocale = (typeof locales)[number];
/** Locales with complete copy for the currently localized public/auth surfaces. */
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
