import type { PetExpenseCategory, PetExpenseEntryDto, PetExpenseSource } from "@petlife/types";
import { calendarFromIso, isoFrom, monthLength, type CalendarSystem } from "@/lib/date/jalali";
import type { RouteLocale } from "@/lib/i18n/config";

export type Locale = RouteLocale;

export const systemFor = (locale: Locale): CalendarSystem => (locale === "fa" ? "jalali" : "gregorian");

/** The ISO day range of one calendar year in the locale's calendar (a Jalali year starts on Nowruz). */
export function yearRange(system: CalendarSystem, year: number): { from: string; to: string } {
  return { from: isoFrom(system, { year, month: 1, day: 1 }), to: isoFrom(system, { year, month: 12, day: monthLength(system, year, 12) }) };
}

export function currentYear(system: CalendarSystem, todayIso: string): number {
  return calendarFromIso(system, todayIso).year;
}

/** Twelve buckets, month 1..12 of the year in the locale's calendar. */
export function monthlyTotals(entries: PetExpenseEntryDto[], system: CalendarSystem, year: number): number[] {
  const months = Array.from({ length: 12 }, () => 0);
  for (const entry of entries) {
    const c = calendarFromIso(system, entry.spentOn);
    if (c.year === year) months[c.month - 1]! += entry.amountIrr;
  }
  return months;
}

/**
 * Amount typed in Toman (the only unit the UI shows) → IRR integer for the API. Accepts Persian or Latin
 * digits and thousands separators; anything else, zero, or a fraction of a toman is rejected as null.
 */
export function parseTomanToIrr(input: string): number | null {
  const normalized = input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,،٬\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const toman = Number(normalized);
  if (!Number.isSafeInteger(toman) || toman <= 0) return null;
  const irr = toman * 10;
  return irr > 2_000_000_000 ? null : irr;
}

export const CATEGORY_LABELS: Record<PetExpenseCategory, Record<Locale, string>> = {
  FOOD: { fa: "غذا", en: "Food", de: "Futter", es: "Alimentación" },
  VET: { fa: "دامپزشکی", en: "Vet", de: "Tierarzt", es: "Veterinario" },
  MEDICATION: { fa: "دارو", en: "Medication", de: "Medikamente", es: "Medicamentos" },
  GROOMING: { fa: "آرایش و نظافت", en: "Grooming", de: "Pflege", es: "Peluquería y aseo" },
  TRAINING: { fa: "آموزش", en: "Training", de: "Training", es: "Adiestramiento" },
  BOARDING: { fa: "نگهداری و پانسیون", en: "Sitting & boarding", de: "Betreuung und Pension", es: "Cuidado y residencia" },
  SUPPLIES: { fa: "لوازم و خرید", en: "Supplies", de: "Zubehör", es: "Suministros" },
  INSURANCE: { fa: "بیمه", en: "Insurance", de: "Versicherung", es: "Seguro" },
  TRANSPORT: { fa: "حمل‌ونقل", en: "Transport", de: "Transport", es: "Transporte" },
  OTHER: { fa: "سایر", en: "Other", de: "Sonstiges", es: "Otros" },
};

export const SOURCE_LABELS: Record<PetExpenseSource, Record<Locale, string>> = {
  MANUAL: { fa: "ثبت دستی", en: "Added by you", de: "Von Ihnen hinzugefügt", es: "Añadido por ti" },
  BOOKING: { fa: "رزرو در پت‌لایف", en: "PET LIFE booking", de: "PET-LIFE-Buchung", es: "Reserva de PET LIFE" },
  SHOP: { fa: "خرید از فروشگاه", en: "PET LIFE shop", de: "PET-LIFE-Shop", es: "Tienda de PET LIFE" },
};
