import type { PaginatedDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type SettingValue = number | boolean | { fa?: string; en?: string } | null;
export interface PlatformSetting {
  key: string;
  category: string;
  type: "integer" | "boolean" | "localizedText";
  scope: "PUBLIC" | "INTERNAL";
  highImpact: boolean;
  constraints: { min: number | null; max: number | null; maxLength: number | null };
  description: string;
  value: SettingValue;
  defaultValue: SettingValue;
  source: "DEFAULT" | "OVERRIDE";
  version: number;
  updatedAt: string | null;
  pendingChanges: number;
}
export type SettingChangeStatus = "PENDING" | "APPLIED" | "REJECTED" | "CANCELLED" | "SUPERSEDED";
export interface SettingChange {
  id: string;
  key: string;
  status: SettingChangeStatus;
  previousValue: SettingValue;
  proposedValue: SettingValue;
  baseVersion: number;
  reason: string;
  reviewNote: string | null;
  requestedBy: { id: string; displayName: string | null; role: string } | null;
  reviewedBy: { id: string; displayName: string | null; role: string } | null;
  createdAt: string;
  reviewedAt: string | null;
}
export const adminSettingsService = {
  list: (signal?: AbortSignal) => apiFetch<PlatformSetting[]>("/admin/settings", { signal }),
  changes: (params: { key?: string; status?: SettingChangeStatus; page: number }, signal?: AbortSignal) => {
    const q = new URLSearchParams({ page: String(params.page), pageSize: "20" });
    if (params.key) q.set("key", params.key);
    if (params.status) q.set("status", params.status);
    return apiFetch<PaginatedDto<SettingChange>>(`/admin/settings/changes?${q}`, { signal });
  },
  propose: (key: string, body: { value: SettingValue; baseVersion: number; reason: string }) =>
    apiFetch<SettingChange>(`/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", body }),
  review: (id: string, decision: "APPROVE" | "REJECT", note?: string) =>
    apiFetch<SettingChange>(`/admin/settings/changes/${id}/review`, {
      method: "POST",
      body: { decision, ...(note?.trim() ? { note: note.trim() } : {}) },
    }),
  cancel: (id: string) => apiFetch<SettingChange>(`/admin/settings/changes/${id}/cancel`, { method: "POST" }),
};
