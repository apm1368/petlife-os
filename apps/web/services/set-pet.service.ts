import type { SetPetCreateRequestInput, SetPetDesignFileDto, SetPetOptionsDto, SetPetRequestDto, SetPetUploadTargetDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/**
 * «ست پت» for the signed-in member. A design is uploaded in three steps: `uploadTarget` → PUT the file to
 * `uploadUrl` with the returned headers (no cookies needed) → `completeDesign`, which checks the bytes and removes
 * photo metadata. Only JPEG/PNG/WebP get a `preview` URL (short-lived); print files (SVG/PDF/AI/PSD) and HEIC never do.
 */
export const setPetService = {
  options: (signal?: AbortSignal) => apiFetch<SetPetOptionsDto>("/set-pet/options", { signal }),
  uploadTarget: (input: { filename: string; contentType: string; fileSizeBytes: number }) =>
    apiFetch<SetPetUploadTargetDto>("/set-pet/designs/upload-target", { method: "POST", body: input }),
  completeDesign: (fileId: string) => apiFetch<SetPetDesignFileDto>(`/set-pet/designs/${fileId}/complete`, { method: "POST" }),
  looseDesigns: (signal?: AbortSignal) => apiFetch<SetPetDesignFileDto[]>("/set-pet/designs", { signal }),
  previewDesign: (fileId: string) => apiFetch<{ url: string; expiresInSeconds: number }>(`/set-pet/designs/${fileId}/preview`),
  removeDesign: (fileId: string) => apiFetch<{ id: string; removed: true }>(`/set-pet/designs/${fileId}`, { method: "DELETE" }),
  create: (input: SetPetCreateRequestInput) => apiFetch<SetPetRequestDto>("/set-pet/requests", { method: "POST", body: input }),
  list: (signal?: AbortSignal) => apiFetch<SetPetRequestDto[]>("/set-pet/requests", { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}`, { signal }),
  cancel: (id: string, reason?: string) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}/cancel`, { method: "POST", body: { reason } }),
  acceptQuote: (id: string) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}/accept-quote`, { method: "POST" }),
};
