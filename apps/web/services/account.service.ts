import type { HouseholdDto, PetAccessFlags, UserDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface AccountOverviewDto {
  user: Pick<UserDto, "id" | "displayName" | "email" | "phone" | "avatarUrl" | "locale" | "themePreference" | "createdAt">;
  households: Array<HouseholdDto & { role: "OWNER" | "FAMILY"; _count: { members: number; pets: number }; subscription: { status: string; currentPeriod: { endAt: string } | null } | null }>;
  security: { activeSessions: number };
  attention: { pendingInvitations: number };
}

export interface AccountSessionDto {
  id: string;
  userAgent: string | null;
  /** Coarse "Browser · OS" label derived from the user-agent, or null when it can't be read. */
  device: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SecurityCenterDto {
  methods: {
    phone: { verified: boolean; value: string | null };
    email: { verified: boolean; value: string | null };
    password: { connected: boolean };
    providers: Array<{ provider: string; email: string | null; createdAt: string }>;
  };
  sessions: AccountSessionDto[];
  activity: ActivityEventDto[];
}

export interface ActivityEventDto { id: string; type: string; occurredAt: string }

export type ConsentKindValue = "TERMS" | "PRIVACY" | "MARKETING";
export type PrivacyRequestStatusValue = "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "CANCELLED" | "FAILED" | "EXPIRED";

export interface PrivacyCenterDto {
  consentVersion: string;
  consents: Array<{ kind: ConsentKindValue; required: boolean; currentVersion: string; granted: boolean; grantedAt: string | null; revokedAt: string | null; lastRecordedVersion: string | null }>;
  exports: Array<{ id: string; status: PrivacyRequestStatusValue; requestedAt: string; readyAt: string | null; expiresAt: string | null; fileSizeBytes: number | null; downloadCount: number; failureCode: string | null }>;
  exportAvailableDays: number;
  exportIncludes: string[];
  deletionRequests: Array<{ id: string; status: PrivacyRequestStatusValue; requestedAt: string; cancelledAt: string | null; completedAt: string | null }>;
  retention: { policyPublished: boolean };
}

export interface SharingSummaryDto {
  sharedByYou: Array<{ grantId: string; pet: { id: string; name: string }; person: string; kind: "HOUSEHOLD" | "TEMPORARY" | "PROVIDER_BOOKING" | "VET_SHARE"; canViewHealth: boolean; startsAt: string | null; expiresAt: string | null }>;
  sharedWithYou: Array<{ pet: { id: string; name: string }; kind: "HOUSEHOLD" | "TEMPORARY" | "PROVIDER_BOOKING" | "VET_SHARE"; expiresAt: string | null }>;
}

export interface DeletionPreviewDto {
  households: Array<{ id: string; name: string | null; role: "OWNER" | "FAMILY"; otherMembers: number; pets: number; membershipStatus: string | null; onlyOwnerWithOthers: boolean }>;
  blockers: Array<{ code: string; count: number }>;
  canRequest: boolean;
  reauth: { password: boolean; code: string | null };
  retention: { policyPublished: boolean };
}

export interface HouseholdCollaborationDto extends HouseholdDto {
  currentUserRole: "OWNER" | "FAMILY";
  members: Array<{ id: string; userId: string; role: "OWNER" | "FAMILY"; createdAt: string; user: Pick<UserDto, "id" | "displayName" | "avatarUrl"> }>;
  pets: Array<{ id: string; name: string; photoUrl: string | null; species: string; lifecycleStatus: string }>;
  invitations: Array<{ id: string; contactMasked: string; status: string; expiresAt: string; createdAt: string; initialAccess: unknown }>;
  grants: Array<PetAccessFlags & { id: string; petId: string; userId: string; source: string; startsAt: string | null; expiresAt: string | null; createdAt: string }>;
  history: ActivityEventDto[];
}

export const accountService = {
  overview: () => apiFetch<AccountOverviewDto>("/account/overview"),
  security: () => apiFetch<SecurityCenterDto>("/account/security"),
  revokeSession: (sessionId: string) => apiFetch<{ ok: true }>(`/account/security/sessions/${sessionId}`, { method: "DELETE" }),
  revokeOtherSessions: () => apiFetch<{ ok: true; count: number }>("/account/security/sessions/revoke-others", { method: "POST" }),
  revokeAllSessions: () => apiFetch<{ ok: true; count: number }>("/account/security/sessions/revoke-all", { method: "POST" }),
  privacy: () => apiFetch<PrivacyCenterDto>("/account/privacy"),
  setConsent: (kind: ConsentKindValue, granted: boolean) => apiFetch("/account/privacy/consent", { method: "PATCH", body: { kind, granted } }),
  sharing: () => apiFetch<SharingSummaryDto>("/account/privacy/sharing"),
  requestExport: () => apiFetch<{ id: string; status: PrivacyRequestStatusValue }>("/account/privacy/exports", { method: "POST" }),
  downloadExport: (id: string) => apiFetch<{ downloadUrl: string; expiresInSeconds: number }>(`/account/privacy/exports/${id}/download`, { method: "POST" }),
  deletionPreview: () => apiFetch<DeletionPreviewDto>("/account/privacy/deletion/preview"),
  sendDeletionCode: () => apiFetch<{ sentTo: string }>("/account/privacy/deletion/code", { method: "POST" }),
  requestDeletion: (input: { confirmation: string; password?: string; code?: string; reason?: string }) => apiFetch<{ id: string; status: PrivacyRequestStatusValue }>("/account/privacy/deletion", { method: "POST", body: input }),
  cancelDeletion: (id: string) => apiFetch<{ ok: true }>(`/account/privacy/deletion/${id}/cancel`, { method: "POST" }),
  activity: () => apiFetch<ActivityEventDto[]>("/account/activity"),
};
