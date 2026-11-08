const DAY = 86400000;
function parts(date: Date, locale: string) {
  const values = new Intl.DateTimeFormat(locale === "fa" ? "en-US-u-ca-persian" : "en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Tehran" }).formatToParts(date);
  return { year: Number(values.find(p => p.type === "year")!.value), month: Number(values.find(p => p.type === "month")!.value), day: Number(values.find(p => p.type === "day")!.value) };
}
export function calendarMonth(anchor: Date, localeOrFa: string | boolean) {
  const locale = typeof localeOrFa === "boolean" ? (localeOrFa ? "fa" : "en") : localeOrFa;
  // Noon UTC remains in the same civil day in Tehran, away from midnight boundaries.
  const noon = new Date(`${careDayKey(anchor)}T12:00:00Z`);
  const current = parts(noon, locale);
  const first = new Date(noon.getTime() - (current.day - 1) * DAY);
  const dates: Date[] = [];
  for (let d = first; parts(d, locale).month === current.month && dates.length < 32; d = new Date(d.getTime()+DAY)) dates.push(d);
  const last = dates[dates.length-1] ?? first;
  const weekday = first.getUTCDay();
  const offset = locale === "fa" ? (weekday + 1) % 7 : locale === "de" || locale === "es" ? (weekday + 6) % 7 : weekday;
  return { dates, first, previous: new Date(first.getTime()-DAY), next: new Date(last.getTime()+DAY), offset };
}
export function careDayKey(date: string | Date) {
  const p = new Intl.DateTimeFormat("en-CA", { year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Tehran" }).formatToParts(new Date(date));
  return ["year","month","day"].map(k => p.find(v=>v.type===k)!.value).join("-");
}
