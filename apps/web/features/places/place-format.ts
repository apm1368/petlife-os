import { countryName } from "@/lib/number/format-number";

/** "Shiraz, Iran" / «شیراز، ایران» — city and the country's name (never its ISO code) in the UI language. */
export function placeLocation(place: { city: string | null; country: string | null }, locale: "fa" | "en"): string {
  return [place.city, countryName(place.country, locale)].filter(Boolean).join(locale === "fa" ? "، " : ", ");
}

/** Metres → kilometres with one decimal, in the UI language's digits. */
export function formatDistanceKm(meters: number, locale: "fa" | "en"): string {
  return (meters / 1000).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
