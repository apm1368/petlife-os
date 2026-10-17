"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Select } from "@petlife/ui";
import { calendarFromIso, isoFrom, localizeDigits, monthLength, monthName, todayIso, type CalendarSystem } from "@/lib/date/jalali";

/**
 * A day far in the past (a birth date): year, month and day selects in the UI calendar — Jalali with
 * Persian digits in fa, Gregorian in en, with an explicit calendar selector. A month-by-month calendar is the wrong tool for a date years
 * back, and the browser's native date input is always Gregorian. The value stays an ISO day.
 */
export function BirthDateField({ label, value, onChange, yearsBack = 30 }: { label: string; value: string; onChange: (iso: string) => void; yearsBack?: number }) {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const t = useTranslations("birthDateField");
  const [system, setSystem] = useState<CalendarSystem>(locale === "fa" ? "jalali" : "gregorian");
  const today = calendarFromIso(system, todayIso());
  const initial = value ? calendarFromIso(system, value) : null;
  const [year, setYear] = useState(initial ? String(initial.year) : "");
  const [month, setMonth] = useState(initial ? String(initial.month) : "");
  const [day, setDay] = useState(initial ? String(initial.day) : "");

  function selectDate(y: string, m: string, d: string) {
    const maxM = Number(y) === today.year ? today.month : 12;
    const nextMonth = m ? String(Math.min(Number(m), maxM)) : "";
    const maxD = y && nextMonth ? Math.min(monthLength(system, Number(y), Number(nextMonth)), Number(y) === today.year && Number(nextMonth) === today.month ? today.day : 31) : 31;
    const nextDay = d ? String(Math.min(Number(d), maxD)) : "";
    setYear(y); setMonth(nextMonth); setDay(nextDay);
    onChange(y && nextMonth && nextDay ? isoFrom(system, { year: Number(y), month: Number(nextMonth), day: Number(nextDay) }) : "");
  }

  function changeSystem(next: CalendarSystem) {
    const converted = value ? calendarFromIso(next, value) : null;
    setSystem(next);
    setYear(converted ? String(converted.year) : "");
    setMonth(converted ? String(converted.month) : "");
    setDay(converted ? String(converted.day) : "");
  }

  const digits = (n: number) => localizeDigits(n, locale);
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => today.year - i);
  const maxMonth = Number(year) === today.year ? today.month : 12;
  const days = year && month ? monthLength(system, Number(year), Number(month)) : 31;
  const maxDay = Number(year) === today.year && Number(month) === today.month ? today.day : days;
  return (
    <fieldset className="birth-date">
      <legend>{label}</legend>
      <Select label={t("calendar")} value={system} onChange={e => changeSystem(e.target.value as CalendarSystem)} options={[{value:"jalali",label:t("jalali")},{value:"gregorian",label:t("gregorian")}]} />
      <p className="text-metadata text-text-secondary">{t("hint")}</p>
      <div className="birth-date__row">
        <Select label={t("day")} value={day} onChange={(e) => selectDate(year, month, e.target.value)} placeholder={t("day")} options={Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: digits(i + 1) }))} />
        <Select label={t("month")} value={month} onChange={(e) => selectDate(year, e.target.value, day)} placeholder={t("month")} options={Array.from({ length: maxMonth }, (_, i) => ({ value: String(i + 1), label: monthName(system, i + 1, locale) }))} />
        <Select label={t("year")} value={year} onChange={(e) => selectDate(e.target.value, month, day)} placeholder={t("year")} options={years.map((y) => ({ value: String(y), label: digits(y) }))} />
      </div>
    </fieldset>
  );
}
