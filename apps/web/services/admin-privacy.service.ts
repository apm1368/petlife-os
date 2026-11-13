import { apiFetch } from "@/lib/api/client";

export type AccountDeletionState = "REQUESTED" | "CANCELLED" | "PENDING_RETENTION" | "READY_FOR_EXECUTION" | "COMPLETED";
export interface DeletionImpactHousehold { id: string; name: string | null; role: "OWNER" | "FAMILY"; otherMembers: number; pets: number; membershipStatus: string | null; onlyOwnerWithOthers: boolean }
export interface AdminDeletionRequest {
  id: string;
  userId: string;
  displayName: string;
  state: AccountDeletionState;
  status: string;
  requestedAt: string;
  stateChangedAt: string;
  stateNote: string | null;
  impactSnapshot: { households?: DeletionImpactHousehold[] } | null;
}

/** Admin → Users → Deletion requests (SUPER_ADMIN, admin.manage). Nothing here deletes data. */
export const adminPrivacyService = {
  deletionRequests: (signal?: AbortSignal) => apiFetch<AdminDeletionRequest[]>("/admin/privacy/deletion-requests", { signal, cache: "no-store" }),
  transition: (id: string, to: AccountDeletionState, note?: string) =>
    apiFetch<{ id: string; state: AccountDeletionState; stateChangedAt: string; stateNote: string | null }>(`/admin/privacy/deletion-requests/${encodeURIComponent(id)}/transition`, { method: "POST", body: { to, ...(note ? { note } : {}) } }),
};
