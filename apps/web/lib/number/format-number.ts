/** Counts and plain numbers in the UI language, preserving Persian digits and locale separators. */
export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : locale);
}

/** ISO country code → its name in the UI language ("IR" → "ایران" / "Iran"); the code itself if unknown. */
export function countryName(code: string | null | undefined, locale: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale === "fa" ? "fa" : locale], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
