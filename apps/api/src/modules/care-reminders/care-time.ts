export const CARE_TYPES = ["VACCINATION", "VET_VISIT", "LAB_TEST", "IMAGING", "DENTAL", "MEDICATION", "MEDICATION_REFILL", "DEWORMING", "PARASITE_PREVENTION", "FOLLOW_UP", "WEIGHT_CHECK", "DOCUMENT_EXPIRY", "GROOMING", "CUSTOM"] as const;
export const RECURRENCES = ["ONCE", "DAILY", "WEEKLY", "WEEKDAYS", "MONTHLY", "YEARLY", "CUSTOM"] as const;
/** Closed states keep their history; SKIPPED is one occurrence deliberately not done. */
export const CLOSED_CARE_STATES = ["COMPLETED", "CANCELLED", "SKIPPED"] as const;
export function visibleCareState(row: { state: string; dueAt: Date; snoozedUntil: Date | null }, now = new Date()): string {
  if ((CLOSED_CARE_STATES as readonly string[]).includes(row.state)) return row.state;
  if (row.snoozedUntil && row.snoozedUntil > now) return "SNOOZED";
  if (row.dueAt < now) return "OVERDUE";
  if (row.dueAt.getTime() - now.getTime() <= 86400000) return "DUE";
  return "UPCOMING";
}
/** Calendar recurrence, clamped at month-end; never infer an interval from a medical type. */
export function nextCareDate(anchor: Date, recurrence: string, intervalDays?: number | null, weekdays: number[] = []): Date | null {
  if (recurrence === "ONCE") return null;
  if (recurrence === "WEEKDAYS") {
    if (!weekdays.length) throw new Error("WEEKDAYS needs at least one weekday");
    const next = new Date(anchor);
    for (let i = 0; i < 7; i++) {
      next.setUTCDate(next.getUTCDate() + 1);
      if (weekdays.includes(tehranWeekday(next))) return next;
    }
    return null;
  }
  const result = new Date(anchor);
  if (recurrence === "MONTHLY" || recurrence === "YEARLY") {
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + (recurrence === "YEARLY" ? 12 : 1));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  } else {
    const days = recurrence === "DAILY" ? 1 : recurrence === "WEEKLY" ? 7 : intervalDays;
    if (!days || days < 1 || days > 3650) throw new Error("Invalid custom interval");
    result.setUTCDate(result.getUTCDate() + days);
  }
  return result;
}

/** Weekday (0=Sunday) of an instant as seen in Asia/Tehran, where care times are scheduled. */
export function tehranWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** The next occurrence of a series, or null when the series has ended (until date / occurrence count). */
export function nextOccurrence(row: { dueAt: Date; recurrence: string; intervalDays: number | null; weekdays: number[]; untilDate: Date | null; maxOccurrences: number | null; occurrenceIndex: number }): Date | null {
  if (row.maxOccurrences !== null && row.occurrenceIndex >= row.maxOccurrences) return null;
  const next = nextCareDate(row.dueAt, row.recurrence, row.intervalDays, row.weekdays);
  if (!next || (row.untilDate && next > row.untilDate)) return null;
  return next;
}
