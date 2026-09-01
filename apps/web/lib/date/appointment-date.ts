export type AppLocale = "fa" | "en";

/**
 * Persian UI shows Jalali dates, English UI shows Gregorian — both via the
 * ICU calendars built into Node/V8 (`Intl.DateTimeFormat` with a `-u-ca-`
 * locale extension), not a custom conversion algorithm or an extra
 * dependency. The backend only ever stores/returns canonical UTC instants;
 * this is purely a display concern.
 */
function calendarLocale(locale: AppLocale): string {
  return locale === "fa" ? "fa-IR-u-ca-persian" : "en-US-u-ca-gregory";
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
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

export function formatDateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
