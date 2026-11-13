import type {
  SetPetDesignFileDto,
  SetPetDraftDto,
  SetPetOptionsDto,
  SetPetOrderInput,
  SetPetRequestDto,
  SetPetShippingOptionDto,
  SetPetUploadTargetDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/**
 * «ست پت» API for the builder and the member's orders. A design is uploaded in three steps: `uploadTarget` → PUT the
 * file to `uploadUrl` with the returned headers (no cookies) → `completeDesign`, which checks the bytes and removes photo
 * metadata. Only JPEG/PNG/WebP get a `preview` URL (short-lived); print files (SVG/PDF/AI/PSD) and HEIC never do.
 */
export const setPetService = {
  /** Public: catalogue, limits and the live price table, so the builder works before sign-in. */
  options: (signal?: AbortSignal) => apiFetch<SetPetOptionsDto>("/set-pet/options", { signal }),
  uploadTarget: (input: { filename: string; contentType: string; fileSizeBytes: number }) =>
    apiFetch<SetPetUploadTargetDto>("/set-pet/designs/upload-target", { method: "POST", body: input }),
  completeDesign: (fileId: string) => apiFetch<SetPetDesignFileDto>(`/set-pet/designs/${fileId}/complete`, { method: "POST" }),
  designs: (signal?: AbortSignal) => apiFetch<SetPetDesignFileDto[]>("/set-pet/designs", { signal }),
  previewDesign: (fileId: string) => apiFetch<{ url: string; expiresInSeconds: number }>(`/set-pet/designs/${fileId}/preview`),
  removeDesign: (fileId: string) => apiFetch<{ id: string; removed: true }>(`/set-pet/designs/${fileId}`, { method: "DELETE" }),

  draft: (signal?: AbortSignal) => apiFetch<{ draft: SetPetDraftDto | null }>("/set-pet/draft", { signal }),
  saveDraft: (data: Record<string, unknown>) => apiFetch<SetPetDraftDto>("/set-pet/draft", { method: "PUT", body: { data } }),
  deleteDraft: () => apiFetch<{ removed: true }>("/set-pet/draft", { method: "DELETE" }),

  create: (input: SetPetOrderInput & { reorderOfId?: string | null }) => apiFetch<SetPetRequestDto>("/set-pet/requests", { method: "POST", body: input }),
  update: (id: string, input: SetPetOrderInput) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}`, { method: "PUT", body: input }),
  list: (signal?: AbortSignal) => apiFetch<SetPetRequestDto[]>("/set-pet/requests", { signal }),
  get: (id: string, signal?: AbortSignal) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}`, { signal }),
  proof: (id: string) => apiFetch<{ url: string; expiresInSeconds: number }>(`/set-pet/requests/${id}/proof`),
  /** Send the proof shown: if staff sent a newer one meanwhile the API answers 409 SET_PET_PROOF_CHANGED. */
  approveProof: (id: string, proofId: string) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}/approve-proof`, { method: "POST", body: { proofId } }),
  shippingOptions: (id: string, addressId: string, signal?: AbortSignal) =>
    apiFetch<SetPetShippingOptionDto[]>(`/set-pet/requests/${id}/shipping-options?addressId=${encodeURIComponent(addressId)}`, { signal }),
  /** Pays the exact total shown from the wallet; 409 SET_PET_TOTAL_CHANGED if anything changed meanwhile. */
  pay: (id: string, input: { addressId: string; shippingProvider: string; expectedTotalIrr: number }) =>
    apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}/pay`, { method: "POST", body: input }),
  cancel: (id: string, reason?: string) => apiFetch<SetPetRequestDto>(`/set-pet/requests/${id}/cancel`, { method: "POST", body: { reason } }),
  reorder: (id: string) => apiFetch<SetPetDraftDto>(`/set-pet/requests/${id}/reorder`, { method: "POST" }),
};
