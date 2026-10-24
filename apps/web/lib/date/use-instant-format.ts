"use client";

import { useLocale } from "next-intl";
import { formatAppointmentDateTime, formatDateLabel, type AppLocale } from "./appointment-date";

const TEHRAN = "Asia/Tehran";

/**
 * Dates, times and plain numbers in the viewer's UI language: Jalali with Persian digits in fa,
 * Gregorian in en — never the browser's own default (which showed Gregorian dates and Latin digits
 * on Persian pages). Instants are shown on the Tehran calendar day, like the rest of the product.
 */
export function useInstantFormat() {
  const locale: AppLocale = useLocale() === "en" ? "en" : "fa";
  const iso = (value: string | Date) => (typeof value === "string" ? value : value.toISOString());
  return {
    locale,
    date: (value: string | Date) => formatDateLabel(iso(value), locale, TEHRAN),
    dateTime: (value: string | Date) => formatAppointmentDateTime(iso(value), locale, TEHRAN),
    number: (value: number) => value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US"),
  };
}
