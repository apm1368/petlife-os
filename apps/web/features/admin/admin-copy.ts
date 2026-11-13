import { LEGACY_COPY } from "./admin-legacy-copy";

/** Picks one of a page's inline copy pairs for the viewer's locale: Persian, English, or German/Spanish from the sheet. */
export type Tr = (fa: string, en: string) => string;
/** The same for a pattern with {placeholders}; the German/Spanish sheet is keyed by the English pattern. */
export type TrFormat = (fa: string, en: string, values: Record<string, string | number>) => string;

const cache = new Map<string, { tr: Tr; trf: TrFormat }>();

export function pickCopy(locale: string, fa: string, en: string): string {
  if (locale === "fa") return fa;
  if (locale === "de" || locale === "es") {
    const row = LEGACY_COPY[en];
    if (row) return locale === "de" ? row[0] : row[1];
  }
  return en;
}

function fill(pattern: string, values: Record<string, string | number>) {
  return pattern.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** Stable per locale, so it can sit in hook dependency lists without re-running effects. */
export function copyFor(locale: string): { tr: Tr; trf: TrFormat } {
  let entry = cache.get(locale);
  if (!entry) {
    entry = {
      tr: (fa, en) => pickCopy(locale, fa, en),
      trf: (fa, en, values) => fill(pickCopy(locale, fa, en), values),
    };
    cache.set(locale, entry);
  }
  return entry;
}

/** Intl locale for numbers and dates on these pages (English keeps its historical en-US formatting). */
export function intlLocale(locale: string): string {
  return locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US";
}
