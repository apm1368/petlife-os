/** Human labels for the status/flag codes health records carry — the UI never shows the raw code. */
const STATUS: Record<string, [string, string]> = {
  ACTIVE: ["فعال", "Active"],
  RESOLVED: ["برطرف‌شده", "Resolved"],
  HISTORICAL: ["سابقه", "Historical"],
  SCHEDULED: ["برنامه‌ریزی‌شده", "Scheduled"],
  COMPLETED: ["تمام‌شده", "Completed"],
  DISCONTINUED: ["متوقف‌شده", "Discontinued"],
  NORMAL: ["طبیعی", "Normal"],
  ABNORMAL: ["غیرطبیعی", "Abnormal"],
  CREATED: ["ثبت‌شده", "Created"],
  SENT: ["ارسال‌شده", "Sent"],
  ACCEPTED: ["پذیرفته‌شده", "Accepted"],
  CANCELLED: ["لغوشده", "Cancelled"],
  DRAFT: ["پیش‌نویس", "Draft"],
  IN_PROGRESS: ["در جریان", "In progress"],
  AMENDED: ["اصلاح‌شده", "Amended"],
  VOIDED: ["باطل‌شده", "Voided"],
};

export function recordStatusLabel(code: string, fa: boolean): string;
export function recordStatusLabel(code: string | null | undefined, fa: boolean): string | null;
export function recordStatusLabel(code: string | null | undefined, fa: boolean): string | null {
  if (!code) return null;
  return STATUS[code]?.[fa ? 0 : 1] ?? code;
}
