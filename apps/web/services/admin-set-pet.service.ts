import type { AdminSetPetDetailDto, AdminSetPetListDto, SetPetRequestStatus as SetPetStatus } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function query(input: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Admin «ست پت»: the request queue, one request, and the staff actions on it. */
export const adminSetPetService = {
  list: (input: { status?: SetPetStatus; q?: string; page?: number } = {}) => apiFetch<AdminSetPetListDto>(`/admin/set-pet/requests${query(input)}`),
  get: (id: string) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}`),
  quote: (id: string, input: { amountIrr: number; estimatedReadyAt: string; note: string }) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/quote`, { method: "POST", body: input }),
  setStatus: (id: string, input: { to: SetPetStatus; note?: string; shippingNote?: string }) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/status`, { method: "POST", body: input }),
  saveNote: (id: string, note: string) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/admin-note`, { method: "PUT", body: { note } }),
  download: (fileId: string, reason: string) => apiFetch<{ fileId: string; filename: string; downloadUrl: string; expiresInSeconds: number }>(`/admin/set-pet/files/${fileId}/download`, { method: "POST", body: { reason } }),
};
