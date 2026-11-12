import type { AdminTwoStepEnrolmentDto, AdminTwoStepPolicyDto, AdminTwoStepStatusDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";
export { ADMIN_TWO_STEP_EVENT } from "@/lib/api/client";

/** Admin two-step sign-in (TOTP). Codes are sent as typed; the server decides what counts. */
export const adminTwoStepService = {
  status: (signal?: AbortSignal) => apiFetch<AdminTwoStepStatusDto>("/admin/two-step", { signal, cache: "no-store" }),
  start: () => apiFetch<AdminTwoStepEnrolmentDto>("/admin/two-step/enrolment", { method: "POST" }),
  confirm: (code: string) => apiFetch<{ recoveryCodes: string[] }>("/admin/two-step/enrolment/confirm", { method: "POST", body: { code } }),
  verify: (input: { code: string } | { recoveryCode: string }) => apiFetch<{ ok: true; recoveryCodesLeft: number }>("/admin/two-step/verify", { method: "POST", body: input }),
  regenerate: (code: string) => apiFetch<{ recoveryCodes: string[] }>("/admin/two-step/recovery-codes", { method: "POST", body: { code } }),
  disable: (code: string) => apiFetch<{ ok: true }>("/admin/two-step/disable", { method: "POST", body: { code } }),
  policy: (signal?: AbortSignal) => apiFetch<AdminTwoStepPolicyDto>("/admin/two-step/policy", { signal, cache: "no-store" }),
  setPolicy: (input: { enforced: boolean; graceDays: number; reason: string }) => apiFetch<AdminTwoStepPolicyDto>("/admin/two-step/policy", { method: "PUT", body: input }),
  reset: (adminUserId: string, reason: string) => apiFetch<{ ok: true }>(`/admin/two-step/members/${encodeURIComponent(adminUserId)}/reset`, { method: "POST", body: { reason } }),
};
