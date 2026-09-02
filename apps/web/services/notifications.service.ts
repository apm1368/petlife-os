import type { NotificationDto, NotificationPreferencesDto, PaginatedDto, UnreadCountDto, UpdateNotificationPreferencesDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const notificationsService = {
  list: (page = 1, pageSize = 20) => apiFetch<PaginatedDto<NotificationDto>>(`/notifications?page=${page}&pageSize=${pageSize}`),
  unreadCount: () => apiFetch<UnreadCountDto>("/notifications/unread-count"),
  markRead: (id: string) => apiFetch<NotificationDto>(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => apiFetch<{ updatedCount: number }>("/notifications/read-all", { method: "POST" }),
  getPreferences: () => apiFetch<NotificationPreferencesDto>("/notification-preferences"),
  updatePreferences: (dto: UpdateNotificationPreferencesDto) => apiFetch<NotificationPreferencesDto>("/notification-preferences", { method: "PATCH", body: dto }),
};
