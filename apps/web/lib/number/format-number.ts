const LOCALE_TAG: Record<string, string> = { fa: "fa-IR", en: "en-US", de: "de-DE", es: "es-ES" };

/** Counts and plain numbers use the active UI locale's digits and grouping. */
export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(LOCALE_TAG[locale] ?? "en-US");
}

/** ISO country code → its name in the UI language ("IR" → "ایران" / "Iran"); the code itself if unknown. */
export function countryName(code: string | null | undefined, locale: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([LOCALE_TAG[locale] ?? "en-US"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
