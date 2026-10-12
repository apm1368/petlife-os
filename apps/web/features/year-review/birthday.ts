import { daysBetween, gregorianFromIso, isoFromGregorian } from "@/lib/date/jalali";

export interface BirthdayInfo {
  /** ISO day of the next birthday (today when it is today). */
  nextIso: string;
  daysUntil: number;
  /** The age the pet turns on that day. */
  turning: number;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The next anniversary of a recorded birth date; a 29 February birthday is kept on 1 March in common years. */
export function nextBirthday(birthIso: string, todayIso: string): BirthdayInfo | null {
  const birth = gregorianFromIso(birthIso);
  const today = gregorianFromIso(todayIso);
  if (birthIso > todayIso) return null;
  const onYear = (year: number) => (birth.month === 2 && birth.day === 29 && !isLeap(year) ? isoFromGregorian({ year, month: 3, day: 1 }) : isoFromGregorian({ year, month: birth.month, day: birth.day }));
  let year = today.year;
  let next = onYear(year);
  if (next < todayIso) {
    year += 1;
    next = onYear(year);
  }
  return { nextIso: next, daysUntil: daysBetween(todayIso, next), turning: year - birth.year };
}

/**
 * A widely used approximation, deliberately labelled as such in the UI: the first year counts as 15
 * human years, the second as 9 more, then 5 a year for dogs (a medium-size average; breed size is not
 * recorded) and 4 a year for cats. Other species have no accepted conversion, so none is shown.
 */
export function humanYears(species: string, ageMonths: number | null): number | null {
  if (ageMonths === null || ageMonths < 0) return null;
  const perYear = species === "DOG" ? 5 : species === "CAT" ? 4 : null;
  if (perYear === null) return null;
  const years = ageMonths / 12;
  if (years <= 1) return Math.round(years * 15);
  if (years <= 2) return Math.round(15 + (years - 1) * 9);
  return Math.round(24 + (years - 2) * perYear);
}
