import type { PaginatedDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type FeatureFlagChangeStatus = "PENDING" | "APPLIED" | "REJECTED" | "CANCELLED" | "SUPERSEDED";
export interface FeatureFlag {
  key: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPercentage: number;
  cities: string[];
  betaUserIds: string[];
  version: number;
  pendingChanges: number;
  updatedAt: string;
  createdAt: string;
}
export interface FeatureFlagChange {
  id: string;
  key: string;
  status: FeatureFlagChangeStatus;
  previousValue: unknown;
  proposedValue: unknown;
  baseVersion: number;
  reason: string;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
export type FeatureFlagPayload = {
  description?: string;
  isEnabled: boolean;
  rolloutPercentage: number;
  cities: string[];
  betaUserIds: string[];
  reason: string;
};

export const adminFeatureFlagsService = {
  list: (signal?: AbortSignal) => apiFetch<FeatureFlag[]>("/admin/feature-flags", { signal }),
  changes: (page: number, signal?: AbortSignal) =>
    apiFetch<PaginatedDto<FeatureFlagChange>>(`/admin/feature-flags/changes?page=${page}&pageSize=20`, {
      signal,
    }),
  create: (key: string, body: FeatureFlagPayload) =>
    apiFetch<FeatureFlagChange>("/admin/feature-flags", { method: "POST", body: { key, ...body } }),
  update: (key: string, body: FeatureFlagPayload & { baseVersion: number }) =>
    apiFetch<FeatureFlagChange>(`/admin/feature-flags/${encodeURIComponent(key)}`, { method: "PUT", body }),
  review: (id: string, decision: "APPROVE" | "REJECT", note?: string) =>
    apiFetch<FeatureFlagChange>(`/admin/feature-flags/changes/${id}/review`, {
      method: "POST",
      body: { decision, ...(note?.trim() ? { note: note.trim() } : {}) },
    }),
  cancel: (id: string) =>
    apiFetch<FeatureFlagChange>(`/admin/feature-flags/changes/${id}/cancel`, { method: "POST" }),
};
