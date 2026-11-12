import type { RouteLocale } from "./config";

const intlLocale: Record<RouteLocale, string> = {
  fa: "fa-IR-u-ca-persian-nu-arabext",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  ar: "ar",
  nl: "nl-NL",
};

export function formatLocaleNumber(value: number, locale: RouteLocale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale[locale], options).format(value);
}

export function formatLocaleDate(value: Date | string | number, locale: RouteLocale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat(intlLocale[locale], options).format(new Date(value));
}
