import { apiFetch } from "@/lib/api/client";

export type OwnershipTransferStatus = "PENDING_REVIEW" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED" | "DISPUTED";
export interface AdminOwnershipTransfer {
  id: string;
  status: OwnershipTransferStatus;
  pet: { id: string; name: string; species: string };
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  registeredOwner: { userId: string; name: string } | null;
  memoryDisposition: string;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  appliedAt: string | null;
  expiresAt: string;
  updatedAt: string;
}

/** Admin → Users → Ownership transfers. */
export const adminOwnershipService = {
  list: (p: { status?: OwnershipTransferStatus; q?: string; page?: number }, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    if (p.status) qs.set("status", p.status);
    if (p.q) qs.set("q", p.q);
    if (p.page) qs.set("page", String(p.page));
    return apiFetch<{ items: AdminOwnershipTransfer[]; total: number; page: number; pageSize: number; disputed: number }>(`/admin/pet-ownership/transfers?${qs}`, { signal, cache: "no-store" });
  },
  closeDispute: (id: string, reason: string) => apiFetch<AdminOwnershipTransfer>(`/admin/pet-ownership/transfers/${encodeURIComponent(id)}/close-dispute`, { method: "POST", body: { reason } }),
};
