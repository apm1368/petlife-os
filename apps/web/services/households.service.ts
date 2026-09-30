import type { HouseholdDto, PetDto } from "@petlife/types";
import type { HouseholdCollaborationDto } from "./account.service";
import { apiFetch } from "@/lib/api/client";

export interface CreateHouseholdInput {
  name?: string;
  city?: string;
  region?: string;
  countryCode?: string;
}

export const householdsService = {
  create: (input: CreateHouseholdInput) => apiFetch<HouseholdDto>("/households", { method: "POST", body: input }),
  listMine: () => apiFetch<HouseholdDto[]>("/households"),
  getById: (id: string) => apiFetch<HouseholdDto>(`/households/${id}`),
  collaboration: (id: string) => apiFetch<HouseholdCollaborationDto>(`/households/${id}/collaboration`),
  update: (id: string, input: Partial<CreateHouseholdInput>) => apiFetch<HouseholdDto>(`/households/${id}`, { method: "PATCH", body: input }),
  invite: (id: string, input: { contact: string; initialAccess: Array<{ petId: string; preset: "VIEW_ONLY" | "CARE_HELPER" | "FULL" }> }) => apiFetch<{ id: string; delivery: "DELIVERED" | "BLOCKED_EXTERNAL" }>(`/households/${id}/invitations`, { method: "POST", body: input }),
  resendInvitation: (householdId: string, invitationId: string) => apiFetch<{ id: string; delivery: "DELIVERED" | "BLOCKED_EXTERNAL" }>(`/households/${householdId}/invitations/${invitationId}/resend`, { method: "POST" }),
  removeMember: (householdId: string, memberId: string) => apiFetch<{ ok: true }>(`/households/${householdId}/members/${memberId}`, { method: "DELETE" }),
  changeMemberRole: (householdId: string, memberId: string, role: "OWNER" | "FAMILY") => apiFetch<{ ok: true }>(`/households/${householdId}/members/${memberId}`, { method: "PATCH", body: { role } }),
  leave: (householdId: string) => apiFetch<{ ok: true }>(`/households/${householdId}/leave`, { method: "POST" }),
  cancelInvitation: (householdId: string, invitationId: string) => apiFetch(`/households/${householdId}/invitations/${invitationId}`, { method: "DELETE" }),
  inspectInvitation: (token: string) => apiFetch<{ household: { id: string; name: string | null }; inviter: { displayName: string } | null; expiresAt: string; initialAccess: unknown }>(`/household-invitations/${token}`),
  acceptInvitation: (token: string) => apiFetch<{ householdId: string }>(`/household-invitations/${token}/accept`, { method: "POST" }),
  declineInvitation: (token: string) => apiFetch<{ ok: true }>(`/household-invitations/${token}/decline`, { method: "POST" }),
  listPets: (householdId: string) => apiFetch<PetDto[]>(`/households/${householdId}/pets`),
  getActivePet: (householdId: string) => apiFetch<PetDto | null>(`/households/${householdId}/active-pet`),
  setActivePet: (householdId: string, petId: string) => apiFetch<{ petId: string }>(`/households/${householdId}/active-pet`, { method: "PUT", body: { petId } }),
};
