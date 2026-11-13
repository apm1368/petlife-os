import type { AdminSetPetDetailDto, AdminSetPetListDto, AdminSetPetProofUploadTargetDto, AdminSetPetSettingsDto, SetPetRequestStatus as SetPetStatus } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function query(input: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Admin «ست پت»: the order queue, one order and the staff actions on it, and the fixed price table. */
export const adminSetPetService = {
  list: (input: { status?: SetPetStatus; q?: string; page?: number } = {}) => apiFetch<AdminSetPetListDto>(`/admin/set-pet/requests${query(input)}`),
  get: (id: string) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}`),
  /** Print proof: upload target → PUT the image → send (with a note and the pet print size). */
  proofUploadTarget: (id: string, input: { contentType: string; fileSizeBytes: number }) =>
    apiFetch<AdminSetPetProofUploadTargetDto>(`/admin/set-pet/requests/${id}/proofs/upload-target`, { method: "POST", body: input }),
  sendProof: (id: string, proofId: string, input: { note?: string; petPrintWidthCm?: number; petPrintHeightCm?: number }) =>
    apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/proofs/${proofId}/send`, { method: "POST", body: input }),
  proofLink: (id: string, proofId: string) => apiFetch<{ url: string; expiresInSeconds: number }>(`/admin/set-pet/requests/${id}/proofs/${proofId}`),
  rejectDesign: (id: string, reason: string) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/reject-design`, { method: "POST", body: { reason } }),
  setStatus: (id: string, input: { to: SetPetStatus; note?: string; shippingNote?: string; printDefect?: boolean }) =>
    apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/status`, { method: "POST", body: input }),
  saveNote: (id: string, note: string) => apiFetch<AdminSetPetDetailDto>(`/admin/set-pet/requests/${id}/admin-note`, { method: "PUT", body: { note } }),
  download: (id: string, fileId: string, reason: string) =>
    apiFetch<{ fileId: string; filename: string; downloadUrl: string; expiresInSeconds: number }>(`/admin/set-pet/requests/${id}/files/${fileId}/download`, { method: "POST", body: { reason } }),
  settings: () => apiFetch<AdminSetPetSettingsDto>("/admin/set-pet/settings"),
  saveSettings: (input: Omit<AdminSetPetSettingsDto, "updatedAt">) => apiFetch<AdminSetPetSettingsDto>("/admin/set-pet/settings", { method: "PUT", body: input }),
};
