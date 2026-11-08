/** Counts and plain numbers in the selected interface locale. */
export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US");
}

/** ISO country code → its name in the UI language ("IR" → "ایران" / "Iran"); the code itself if unknown. */
export function countryName(code: string | null | undefined, locale: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale === "fa" ? "fa" : locale === "de" || locale === "es" ? locale : "en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
