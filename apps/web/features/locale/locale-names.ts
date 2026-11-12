import type { RouteLocale } from "@/lib/i18n/config";

/**
 * Language names in the language of the current page, so the visible UI never mixes languages.
 * German and Spanish are offered as beta at launch (market-readiness #290, Q8: fa and en complete, de and es beta),
 * so both switchers mark them; drop a locale from BETA_LOCALES when its copy is signed off.
 */
export const LANGUAGE_NAMES: Record<RouteLocale, { label: string } & Record<RouteLocale, string>> = {
  fa: { label: "زبان", fa: "فارسی", en: "انگلیسی", de: "آلمانی", es: "اسپانیایی" },
  en: { label: "Language", fa: "Persian", en: "English", de: "German", es: "Spanish" },
  de: { label: "Sprache", fa: "Persisch", en: "Englisch", de: "Deutsch", es: "Spanisch" },
  es: { label: "Idioma", fa: "persa", en: "inglés", de: "alemán", es: "español" },
};

export const BETA_LOCALES: readonly RouteLocale[] = ["de", "es"];

const BETA_WORD: Record<RouteLocale, string> = { fa: "آزمایشی", en: "beta", de: "Beta", es: "beta" };

/** The option text for `code` on a page in `pageLocale`, e.g. "Deutsch (Beta)" or «آلمانی (آزمایشی)». */
export function languageOptionName(pageLocale: string, code: RouteLocale): string {
  const names = LANGUAGE_NAMES[pageLocale as RouteLocale] ?? LANGUAGE_NAMES.en;
  const name = names[code];
  return BETA_LOCALES.includes(code) ? `${name} (${(BETA_WORD[pageLocale as RouteLocale] ?? BETA_WORD.en)})` : name;
}

export function languageLabel(pageLocale: string): string {
  return (LANGUAGE_NAMES[pageLocale as RouteLocale] ?? LANGUAGE_NAMES.en).label;
}
