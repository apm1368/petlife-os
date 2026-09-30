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

export interface PrivacyCenterDto {
  consentVersion: string;
  consents: Array<{ id: string; kind: "TERMS" | "PRIVACY" | "MARKETING"; version: string; grantedAt: string | null; revokedAt: string | null; updatedAt: string }>;
  exports: Array<{ id: string; status: string; requestedAt: string; readyAt: string | null }>;
  deletionRequests: Array<{ id: string; status: string; requestedAt: string }>;
  exportIncludes: string[];
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
  setConsent: (kind: "TERMS" | "PRIVACY" | "MARKETING", granted: boolean) => apiFetch("/account/privacy/consent", { method: "PATCH", body: { kind, granted } }),
  requestExport: () => apiFetch("/account/privacy/exports", { method: "POST" }),
  requestDeletion: (confirmation: string, reason?: string) => apiFetch("/account/privacy/deletion", { method: "POST", body: { confirmation, reason } }),
  activity: () => apiFetch<ActivityEventDto[]>("/account/activity"),
};
