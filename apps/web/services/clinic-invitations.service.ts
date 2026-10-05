import { apiFetch } from "@/lib/api/client";

export interface ClinicInvitationDto {
  id: string;
  organization: { id: string; name: string };
  invitedDisplayName: string;
  role: "VET" | "STAFF" | "OWNER";
  displayTitle: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

export const clinicInvitationsService = {
  mine: () => apiFetch<ClinicInvitationDto[]>("/me/clinic-invitations"),
  accept: (id: string) => apiFetch<{ providerUserId: string; providerOrganizationId: string; organizationName: string; role: string }>(`/me/clinic-invitations/${id}/accept`, { method: "POST" }),
  decline: (id: string) => apiFetch<{ status: string }>(`/me/clinic-invitations/${id}/decline`, { method: "POST" }),
};
