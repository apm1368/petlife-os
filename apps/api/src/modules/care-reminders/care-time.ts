export const CARE_TYPES = ["VACCINATION", "VET_VISIT", "LAB_TEST", "IMAGING", "DENTAL", "MEDICATION", "MEDICATION_REFILL", "DEWORMING", "PARASITE_PREVENTION", "FOLLOW_UP", "WEIGHT_CHECK", "DOCUMENT_EXPIRY", "GROOMING", "CUSTOM"] as const;
export const RECURRENCES = ["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as const;
export function visibleCareState(row: { state: string; dueAt: Date; snoozedUntil: Date | null }, now = new Date()): string {
  if (row.state === "COMPLETED" || row.state === "CANCELLED") return row.state;
  if (row.snoozedUntil && row.snoozedUntil > now) return "SNOOZED";
  if (row.dueAt < now) return "OVERDUE";
  if (row.dueAt.getTime() - now.getTime() <= 86400000) return "DUE";
  return "UPCOMING";
}
/** Calendar recurrence, clamped at month-end; never infer an interval from a medical type. */
export function nextCareDate(anchor: Date, recurrence: string, intervalDays?: number | null): Date | null {
  if (recurrence === "ONCE") return null;
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
