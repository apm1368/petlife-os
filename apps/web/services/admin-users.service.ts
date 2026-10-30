import type { AdminUserDirectoryListDto, AdminUserProfileDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** W2-5 contract from backend PR #75; no local/demo fallback for private user data. */
export const adminUsersService = {
  list: (query: URLSearchParams, signal?: AbortSignal) => apiFetch<AdminUserDirectoryListDto>(`/admin/users?${query}`, { signal, cache: "no-store" }),
  detail: (id: string, signal?: AbortSignal) => apiFetch<AdminUserProfileDto>(`/admin/users/${encodeURIComponent(id)}`, { signal, cache: "no-store" }),
  sendMessage: (id: string, input: { title: string; message: string; attemptSms: boolean }) =>
    apiFetch<{ notificationId: string; smsRequested: boolean }>(`/admin/users/${encodeURIComponent(id)}/message`, { method: "POST", body: input }),
};
