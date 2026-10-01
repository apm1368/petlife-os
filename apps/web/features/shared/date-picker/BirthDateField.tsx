"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Select } from "@petlife/ui";
import { calendarFromIso, isoFrom, localizeDigits, monthLength, monthName, todayIso, type CalendarSystem } from "@/lib/date/jalali";

/**
 * A day far in the past (a birth date): year, month and day selects in the UI calendar — Jalali with
 * Persian digits in fa, Gregorian in en. A month-by-month calendar is the wrong tool for a date years
 * back, and the browser's native date input is always Gregorian. The value stays an ISO day.
 */
export function BirthDateField({ label, value, onChange, yearsBack = 30 }: { label: string; value: string; onChange: (iso: string) => void; yearsBack?: number }) {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const system: CalendarSystem = locale === "fa" ? "jalali" : "gregorian";
  const today = calendarFromIso(system, todayIso());
  const initial = value ? calendarFromIso(system, value) : null;
  const [year, setYear] = useState(initial ? String(initial.year) : "");
  const [month, setMonth] = useState(initial ? String(initial.month) : "");
  const [day, setDay] = useState(initial ? String(initial.day) : "");

  useEffect(() => {
    if (!year || !month || !day) return onChange("");
    const y = Number(year);
    const m = Number(month);
    const d = Math.min(Number(day), monthLength(system, y, m));
    const iso = isoFrom(system, { year: y, month: m, day: d });
    onChange(iso > todayIso() ? todayIso() : iso);
    // onChange is the caller's setter; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, day, system]);

  const digits = (n: number) => localizeDigits(n, locale);
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => today.year - i);
  const maxMonth = Number(year) === today.year ? today.month : 12;
  const days = year && month ? monthLength(system, Number(year), Number(month)) : 31;
  const maxDay = Number(year) === today.year && Number(month) === today.month ? today.day : days;
  return (
    <fieldset className="birth-date">
      <legend>{label}</legend>
      <div className="birth-date__row">
        <Select label={locale === "fa" ? "روز" : "Day"} value={day} onChange={(e) => setDay(e.target.value)} placeholder={locale === "fa" ? "روز" : "Day"} options={Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: digits(i + 1) }))} />
        <Select label={locale === "fa" ? "ماه" : "Month"} value={month} onChange={(e) => setMonth(e.target.value)} placeholder={locale === "fa" ? "ماه" : "Month"} options={Array.from({ length: maxMonth }, (_, i) => ({ value: String(i + 1), label: monthName(system, i + 1, locale) }))} />
        <Select label={locale === "fa" ? "سال" : "Year"} value={year} onChange={(e) => setYear(e.target.value)} placeholder={locale === "fa" ? "سال" : "Year"} options={years.map((y) => ({ value: String(y), label: digits(y) }))} />
      </div>
    </fieldset>
  );
}
