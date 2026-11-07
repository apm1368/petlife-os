const DATE_LOCALE: Record<string, string> = {
  fa: "fa-IR",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
};

/** Render a date in the selected UI locale, retaining the Persian calendar for fa. */
export function formatLocaleDate(value: Date | string | number, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-US").format(date);
}
