import { formatDay, todayIso } from "./jalali";

/**
 * Instants are shown in Tehran time everywhere (the platform's operating zone), and a value that is only a calendar
 * day is shown as a day, never with a time (QA L12):
 * - "last seen 2026-11-11T21:30Z" is Thursday 01:00 in Tehran, not Wednesday (its UTC day) at 01:00;
 * - a vaccine's next due date stored as 2026-12-15T00:00Z is "15 December", not "15 December, 03:30".
 */
export const TEHRAN_TIME_ZONE = "Asia/Tehran";

type Lang = "fa" | "en" | "de" | "es";

const ZONE_LABEL: Record<Lang, string> = { fa: "به وقت تهران", en: "Tehran time", de: "Teheraner Zeit", es: "hora de Teherán" };
const TIME_LOCALE: Record<Lang, string> = { fa: "fa-IR-u-nu-arabext", en: "en-GB", de: "de-DE", es: "es-ES" };

const lang = (locale: string): Lang => (locale === "fa" || locale === "de" || locale === "es" ? locale : "en");

/** The calendar day (ISO "YYYY-MM-DD") an instant falls on in Tehran. */
export function tehranDay(instant: string | Date): string {
  return todayIso(typeof instant === "string" ? new Date(instant) : instant, TEHRAN_TIME_ZONE);
}

/** True for a bare day ("2026-12-15") or a day stored as UTC midnight (a database date column). */
export function isDateOnlyValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/.test(value);
}

/** "۰۱:۰۰" / "01:00" in Tehran. */
export function formatTehranTime(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(TIME_LOCALE[lang(locale)], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TEHRAN_TIME_ZONE }).format(new Date(instant));
}

/** "پنجشنبه، ۲۱ آبان ۱۴۰۵، ساعت ۰۱:۰۰ (به وقت تهران)" — day and time from the same zone, the zone stated when asked. */
export function formatTehranDateTime(instant: string, locale: string, options: { weekday?: boolean; zone?: boolean } = {}): string {
  const l = lang(locale);
  const day = formatDay(tehranDay(instant), l, { weekday: options.weekday });
  const time = formatTehranTime(instant, l);
  const joined = l === "fa" ? `${day}، ساعت ${time}` : `${day}, ${time}`;
  return options.zone ? `${joined} (${ZONE_LABEL[l]})` : joined;
}

/** A due date or similar: a day when the value has no time of day, otherwise day and time in Tehran. */
export function formatDayOrDateTime(value: string, locale: string, options: { weekday?: boolean } = {}): string {
  const l = lang(locale);
  if (isDateOnlyValue(value)) return formatDay(value.slice(0, 10), l, { weekday: options.weekday });
  return formatTehranDateTime(value, l, { weekday: options.weekday });
}

/** The day a date-only value means, or the Tehran day of an instant. */
export function dayOf(value: string): string {
  return isDateOnlyValue(value) ? value.slice(0, 10) : tehranDay(value);
}
