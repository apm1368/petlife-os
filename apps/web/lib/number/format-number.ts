/** Counts and plain numbers in the UI language: Persian digits and separators in fa, Latin in en. */
export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
}

/** ISO country code → its name in the UI language ("IR" → "ایران" / "Iran"); the code itself if unknown. */
export function countryName(code: string | null | undefined, locale: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale === "fa" ? "fa" : "en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
