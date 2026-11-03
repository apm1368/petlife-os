import { apiFetch } from "@/lib/api/client";

export type SmsPatternTemplate = {
  id: string;
  key: string;
  locale: "fa" | "en";
  displayName: string;
  farazPatternCode: string;
  bodyAttributeKey: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type SmsPatternPayload = {
  displayName: string;
  farazPatternCode: string;
  bodyAttributeKey: string;
  isActive: boolean;
};

export const adminSmsPatternsService = {
  list: (signal?: AbortSignal) => apiFetch<SmsPatternTemplate[]>("/admin/sms-patterns", { signal }),
  create: (body: SmsPatternPayload & { key: string; locale: "fa" | "en" }) =>
    apiFetch<SmsPatternTemplate>("/admin/sms-patterns", { method: "POST", body }),
  update: (id: string, body: SmsPatternPayload & { baseVersion: number }) =>
    apiFetch<SmsPatternTemplate>(`/admin/sms-patterns/${id}`, { method: "PUT", body }),
};
