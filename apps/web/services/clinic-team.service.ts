import { apiFetch } from "@/lib/api/client";
import type { ClinicInvitationDto } from "./clinic-invitations.service";

export interface ClinicStaffRoster {
  items: { providerUserId: string; displayName: string | null; role: "OWNER" | "VET" | "STAFF"; displayTitle: string | null; joinedAt: string }[];
  pendingInvitations: ClinicInvitationDto[];
  usage: { used: number; pending: number; limit: number | null };
}
export interface ClinicBranch {
  id: string; name: string; addressLine: string; city: string; region: string | null;
  latitude: number | null; longitude: number | null; phone: string | null; timezone: string;
  /** Whether the public sees the exact pin (null = the default for the organization type). */
  pinPublicExact?: boolean | null;
}
export interface ClinicBranches { items: ClinicBranch[]; usage: { used: number; limit: number | null } }
export interface CreateClinicBranch {
  name: string; addressLine: string; city: string; region?: string; phone?: string; latitude?: number; longitude?: number; locationConsent?: boolean;
}
export const clinicTeamService = {
  staff: (signal?: AbortSignal) => apiFetch<ClinicStaffRoster>("/provider/clinic/staff", { signal }),
  invite: (body: { email: string; role: "VET" | "STAFF"; displayTitle?: string }) => apiFetch<ClinicStaffRoster>("/provider/clinic/staff", { method: "POST", body }),
  revoke: (id: string) => apiFetch<ClinicStaffRoster>(`/provider/clinic/staff/invitations/${id}/revoke`, { method: "POST" }),
  removeMember: (id: string) => apiFetch<ClinicStaffRoster>(`/provider/clinic/staff/${id}`, { method: "DELETE" }),
  branches: (signal?: AbortSignal) => apiFetch<ClinicBranches>("/provider/clinic/branches", { signal }),
  addBranch: (body: CreateClinicBranch) => apiFetch<ClinicBranches>("/provider/clinic/branches", { method: "POST", body }),
  removeBranch: (id: string) => apiFetch<ClinicBranches>(`/provider/clinic/branches/${id}`, { method: "DELETE" }),
  /** Sets, moves or removes a branch's map pin (pin + consent together) and the public exact-spot choice. */
  setBranchPin: (id: string, body: { latitude?: number | null; longitude?: number | null; locationConsent?: boolean; exactPinPublic?: boolean | null }) =>
    apiFetch<ClinicBranches>(`/provider/clinic/branches/${id}/pin`, { method: "PUT", body }),
};
