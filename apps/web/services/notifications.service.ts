import type { NotificationDto, NotificationPreferencesDto, PaginatedDto, UnreadCountDto, UpdateNotificationPreferencesDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const notificationsService = {
  /** `locale` is the UI language: the API re-renders each notification into it where its template allows. */
  list: (page = 1, pageSize = 20, locale?: string) => apiFetch<PaginatedDto<NotificationDto>>(`/notifications?page=${page}&pageSize=${pageSize}${locale ? `&locale=${encodeURIComponent(locale)}` : ""}`),
  unreadCount: () => apiFetch<UnreadCountDto>("/notifications/unread-count"),
  markRead: (id: string) => apiFetch<NotificationDto>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiFetch<{ updatedCount: number }>("/notifications/read-all", { method: "POST" }),
  getPreferences: () => apiFetch<NotificationPreferencesDto>("/notification-preferences"),
  updatePreferences: (dto: UpdateNotificationPreferencesDto) => apiFetch<NotificationPreferencesDto>("/notification-preferences", { method: "PATCH", body: dto }),
};
