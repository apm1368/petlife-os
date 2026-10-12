import type { PetExpenseCategory, PetExpenseEntryDto, PetExpenseSource } from "@petlife/types";
import { calendarFromIso, isoFrom, monthLength, type CalendarSystem } from "@/lib/date/jalali";

export type Locale = "fa" | "en";

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

export const CATEGORY_LABELS: Record<PetExpenseCategory, { fa: string; en: string }> = {
  FOOD: { fa: "غذا", en: "Food" },
  VET: { fa: "دامپزشکی", en: "Vet" },
  MEDICATION: { fa: "دارو", en: "Medication" },
  GROOMING: { fa: "آرایش و نظافت", en: "Grooming" },
  TRAINING: { fa: "آموزش", en: "Training" },
  BOARDING: { fa: "نگهداری و پانسیون", en: "Sitting & boarding" },
  SUPPLIES: { fa: "لوازم و خرید", en: "Supplies" },
  INSURANCE: { fa: "بیمه", en: "Insurance" },
  TRANSPORT: { fa: "حمل‌ونقل", en: "Transport" },
  OTHER: { fa: "سایر", en: "Other" },
};

export const SOURCE_LABELS: Record<PetExpenseSource, { fa: string; en: string }> = {
  MANUAL: { fa: "ثبت دستی", en: "Added by you" },
  BOOKING: { fa: "رزرو در پت‌لایف", en: "PET LIFE booking" },
  SHOP: { fa: "خرید از فروشگاه", en: "PET LIFE shop" },
};
