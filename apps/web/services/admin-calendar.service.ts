import { apiFetch } from "@/lib/api/client";

export interface CalendarDayDto {
  date: string;
  jalali: string | null;
  title: string;
  closed: boolean;
  official: { title: string; religious: boolean } | null;
  staff: { closed: boolean; title: string; reason: string; updatedAt: string } | null;
}
export interface CalendarYearDto {
  year: number;
  from: string;
  to: string;
  coverage: "official" | "provisional" | null;
  today: string;
  days: CalendarDayDto[];
}

/** Settings → Holidays and closures. */
export const adminCalendarService = {
  year: (year: number, signal?: AbortSignal) => apiFetch<CalendarYearDto>(`/admin/calendar/days?year=${year}`, { signal, cache: "no-store" }),
  change: (date: string, input: { closed: boolean; title: string; reason: string }) => apiFetch<CalendarDayDto>(`/admin/calendar/days/${encodeURIComponent(date)}`, { method: "PUT", body: input }),
  clear: (date: string, reason: string) => apiFetch<{ date: string; day: CalendarDayDto | null }>(`/admin/calendar/days/${encodeURIComponent(date)}/clear`, { method: "POST", body: { reason } }),
};
