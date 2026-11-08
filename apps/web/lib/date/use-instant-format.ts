"use client";

import { useLocale } from "next-intl";
import { formatAppointmentDateTime, formatDateLabel, type AppLocale } from "./appointment-date";
import { formatLocaleNumber } from "@/lib/i18n/format";

const TEHRAN = "Asia/Tehran";

/**
 * Dates, times and plain numbers follow the active UI locale: Jalali with Persian digits in fa,
 * Gregorian with locale-appropriate formatting in en/de/es. Instants are shown in Tehran time.
 */
export function useInstantFormat() {
  const locale = useLocale() as AppLocale;
  const iso = (value: string | Date) => (typeof value === "string" ? value : value.toISOString());
  return {
    locale,
    date: (value: string | Date) => formatDateLabel(iso(value), locale, TEHRAN),
    dateTime: (value: string | Date) => formatAppointmentDateTime(iso(value), locale, TEHRAN),
    number: (value: number) => formatLocaleNumber(value, locale),
  };
}
