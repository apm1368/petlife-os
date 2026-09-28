/**
 * Jalali (Solar Hijri) ⇄ Gregorian calendar arithmetic for the date picker.
 *
 * `Intl` can *format* a date in the Persian calendar but cannot build a month
 * grid (month lengths, first weekday, leap years), so the picker needs real
 * calendar math. This is the Borkowski/jalaali algorithm (valid for Jalali
 * years −61…3177), which is what every mainstream Jalali library ships.
 *
 * All values that cross the component boundary are ISO day keys
 * (`yyyy-mm-dd`, Gregorian) — the canonical storage format. Jalali is a
 * presentation concern only.
 */

export type CalendarSystem = "jalali" | "gregorian";

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0]!;
  let jump = 0;
  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]!) throw new RangeError(`Jalali year out of range: ${jy}`);
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): CalendarDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const day = div(mod(i, 153), 5) + 1;
  const month = mod(div(i, 153), 12) + 1;
  const year = div(j, 1461) - 100100 + div(8 - month, 6);
  return { year, month, day };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): CalendarDate {
  const gy = d2g(jdn).year;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { year: jy, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { year: jy, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function toJalali(g: CalendarDate): CalendarDate {
  return d2j(g2d(g.year, g.month, g.day));
}

export function toGregorian(j: CalendarDate): CalendarDate {
  return d2g(j2d(j.year, j.month, j.day));
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoFromGregorian(g: CalendarDate): string {
  return `${g.year}-${pad(g.month)}-${pad(g.day)}`;
}

export function gregorianFromIso(iso: string): CalendarDate {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

export function isIsoDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const g = gregorianFromIso(value);
  return isoFromGregorian(d2g(g2d(g.year, g.month, g.day))) === value;
}

/** Calendar date (in the chosen system) → ISO day key. */
export function isoFrom(system: CalendarSystem, date: CalendarDate): string {
  return isoFromGregorian(system === "jalali" ? toGregorian(date) : date);
}

/** ISO day key → calendar date in the chosen system. */
export function calendarFromIso(system: CalendarSystem, iso: string): CalendarDate {
  const g = gregorianFromIso(iso);
  return system === "jalali" ? toJalali(g) : g;
}

export function monthLength(system: CalendarSystem, year: number, month: number): number {
  if (system === "jalali") {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    return isJalaliLeapYear(year) ? 30 : 29;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
}

export function addDays(iso: string, days: number): string {
  const g = gregorianFromIso(iso);
  return isoFromGregorian(d2g(g2d(g.year, g.month, g.day) + days));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const ga = gregorianFromIso(a);
  const gb = gregorianFromIso(b);
  return g2d(gb.year, gb.month, gb.day) - g2d(ga.year, ga.month, ga.day);
}

/** 0 = Sunday … 6 = Saturday (same as Date#getUTCDay). */
export function weekday(iso: string): number {
  const g = gregorianFromIso(iso);
  return new Date(Date.UTC(g.year, g.month - 1, g.day)).getUTCDay();
}

/** The Persian week starts on Saturday; the English UI uses Monday (ISO week). */
export function firstDayOfWeek(system: CalendarSystem): number {
  return system === "jalali" ? 6 : 1;
}

export const JALALI_MONTHS_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const JALALI_MONTHS_EN = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];
export const GREGORIAN_MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const GREGORIAN_MONTHS_FA = ["ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن", "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر"];
/** Indexed by Date#getUTCDay (0 = Sunday). */
export const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export const WEEKDAYS_FA_SHORT = ["ی", "د", "س", "چ", "پ", "ج", "ش"];
export const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_EN_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export function localizeDigits(value: string | number, locale: "fa" | "en"): string {
  const s = String(value);
  return locale === "fa" ? s.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]!) : s;
}

export function monthName(system: CalendarSystem, month: number, locale: "fa" | "en"): string {
  if (system === "jalali") return (locale === "fa" ? JALALI_MONTHS_FA : JALALI_MONTHS_EN)[month - 1]!;
  return (locale === "fa" ? GREGORIAN_MONTHS_FA : GREGORIAN_MONTHS_EN)[month - 1]!;
}

/** "۱۲ مهر ۱۴۰۵" / "4 October 2026" — the calendar system follows the locale unless given. */
export function formatDay(iso: string, locale: "fa" | "en", options: { system?: CalendarSystem; weekday?: boolean; year?: boolean } = {}): string {
  const system = options.system ?? (locale === "fa" ? "jalali" : "gregorian");
  const c = calendarFromIso(system, iso);
  const wd = options.weekday ? (locale === "fa" ? WEEKDAYS_FA : WEEKDAYS_EN)[weekday(iso)]! : null;
  const core = locale === "fa" ? `${localizeDigits(c.day, locale)} ${monthName(system, c.month, locale)}${options.year === false ? "" : ` ${localizeDigits(c.year, locale)}`}` : `${c.day} ${monthName(system, c.month, locale)}${options.year === false ? "" : ` ${c.year}`}`;
  return wd ? `${wd}${locale === "fa" ? "،" : ","} ${core}` : core;
}

/** Today's ISO day key in Tehran — travel dates are property-local calendar days. */
export function todayIso(now = new Date(), timeZone = "Asia/Tehran"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts;
}

export interface MonthGridCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Six-row (42-cell) grid for one month, leading/trailing days from adjacent months. */
export function monthGrid(system: CalendarSystem, year: number, month: number): MonthGridCell[] {
  const first = isoFrom(system, { year, month, day: 1 });
  const lead = (weekday(first) - firstDayOfWeek(system) + 7) % 7;
  const start = addDays(first, -lead);
  const length = monthLength(system, year, month);
  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDays(start, i);
    const c = calendarFromIso(system, iso);
    const offset = i - lead;
    return { iso, day: c.day, inMonth: offset >= 0 && offset < length };
  });
}
