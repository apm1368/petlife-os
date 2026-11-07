import type { RouteLocale } from "@/lib/i18n/config";

export type AppLocale = RouteLocale;

/**
 * Persian UI shows Jalali dates, English UI shows Gregorian — both via the
 * ICU calendars built into Node/V8 (`Intl.DateTimeFormat` with a `-u-ca-`
 * locale extension), not a custom conversion algorithm or an extra
 * dependency. The backend only ever stores/returns canonical UTC instants;
 * this is purely a display concern.
 */
function calendarLocale(locale: AppLocale): string {
  return ({ fa: "fa-IR-u-ca-persian", en: "en-US-u-ca-gregory", de: "de-DE-u-ca-gregory", es: "es-ES-u-ca-gregory" })[locale];
}

/** The provider location's timezone is authoritative for an appointment's time — always format in it, never the viewer's own. */
export function formatAppointmentDateTime(iso: string, locale: AppLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(calendarLocale(locale), { dateStyle: "long", timeStyle: "short", timeZone }).format(new Date(iso));
}

export function formatDayLabel(iso: string, locale: AppLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(calendarLocale(locale), { weekday: "short", day: "numeric", month: "short", timeZone }).format(
    new Date(iso),
  );
}

export function formatTimeLabel(iso: string, locale: AppLocale, timeZone: string): string {
  const languageLocale = ({ fa: "fa-IR", en: "en-US", de: "de-DE", es: "es-ES" })[locale];
  return new Intl.DateTimeFormat(languageLocale, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

export function formatDateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Date only, no time — used for multi-day (Sitting/Boarding) check-in/check-out display. */
export function formatDateLabel(iso: string, locale: AppLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(calendarLocale(locale), { dateStyle: "long", timeZone }).format(new Date(iso));
}

/**
 * A booking/calendar range that spans multiple calendar days (Sitting/
 * Boarding) renders as "start – end"; a same-day range collapses to the
 * existing single-timestamp format, matching every other (fixed-slot)
 * category exactly.
 */
export function formatDateTimeRange(startIso: string, endIso: string, locale: AppLocale, timeZone: string): string {
  if (formatDateKey(startIso, timeZone) === formatDateKey(endIso, timeZone)) {
    return formatAppointmentDateTime(startIso, locale, timeZone);
  }
  return `${formatDateLabel(startIso, locale, timeZone)} – ${formatDateLabel(endIso, locale, timeZone)}`;
}
