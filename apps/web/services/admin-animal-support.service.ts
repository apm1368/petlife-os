import type { AnimalSupportOrganizationDto, CommunityReportDto, PaginatedDto, SupportNeedListingDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

export interface AdminAnimalSupportOverview {
  needsAttention: { pendingListings: number; orgsAwaitingReview: number; openReports: number; openTrustCases: number };
  live: { liveListings: number; verifiedOrgs: number; openLostPetIncidents: number };
  donationsLast30Days: { count: number; amountIrr: number; refunded: number };
}

export interface AdminDonationRow {
  id: string;
  amountIrr: number;
  fundType: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  campaign: { id: string; title: string };
  organization: { id: string; name: string };
  donorName: string | null;
  publicDisplayName: string | null;
  createdAt: string;
  succeededAt: string | null;
  refundedAt: string | null;
}

export interface AdminNgoMember { id: string; userId: string; displayName: string | null; email: string | null; role: "OWNER" | "COORDINATOR" | "VIEWER"; isActive: boolean }

export interface AdminLostPetRow { id: string; petName: string; petSpecies: string; status: string; publicArea: string | null; sightingsCount: number; lastSeenAt: string | null; createdAt: string }
export interface AdminLostPetDetail {
  id: string;
  pet: { id: string; name: string; species: string };
  status: string;
  publicArea: string | null;
  description: string | null;
  publicNotes: string | null;
  contactPreference: string;
  photoUrl: string | null;
  lastSeenAt: string | null;
  exactLocationRecorded: boolean;
  createdAt: string;
  foundAt: string | null;
}
export interface RevealedLocation { lastKnownLocation: string | null; lastKnownLatitude: number | null; lastKnownLongitude: number | null; privateNotes: string | null }

export interface TrustCaseContext {
  trustCaseId: string;
  subjectType: string;
  subjectId: string;
  subject: Record<string, unknown> | null;
  reports: { total: number; distinctReporters: number; byReason: Record<string, number>; items: Array<{ id: string; reason: string; details: string | null; status: string; createdAt: string }> };
  availableActions: string[];
}

export type ReportTargetFilter = "COMMUNITY" | "SUPPORT_NEED" | "LOST_PET_INCIDENT" | "LOST_PET_SIGHTING" | "ORGANIZATION";

/** Batch 6 — the admin animal-support, lost-pet and community console. Every call is permission-checked and audited server-side. */
export const adminAnimalSupportService = {
  overview: () => apiFetch<AdminAnimalSupportOverview>("/admin/animal-support/overview"),

  listNeeds: (params: { status?: string; page?: number; pageSize?: number }) => apiFetch<PaginatedDto<SupportNeedListingDto>>(`/admin/animal-support/needs${qs(params)}`),
  getNeed: (id: string) => apiFetch<SupportNeedListingDto>(`/admin/animal-support/needs/${id}`),
  reviewNeed: (id: string, status: string, reviewNote?: string) => apiFetch<SupportNeedListingDto>(`/admin/animal-support/needs/${id}/review`, { method: "POST", body: { status, reviewNote } }),

  listOrganizations: (params: { verificationStatus?: string; page?: number; pageSize?: number }) => apiFetch<PaginatedDto<AnimalSupportOrganizationDto>>(`/admin/animal-support/organizations${qs(params)}`),
  getOrganization: (id: string) => apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}`),
  createOrganization: (input: { type: string; name: string }) => apiFetch<AnimalSupportOrganizationDto>("/admin/animal-support/organizations", { method: "POST", body: input }),
  setVerification: (id: string, verificationStatus: string, reason?: string) => apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}/verification`, { method: "POST", body: { verificationStatus, reason } }),
  setListed: (id: string, isPubliclyListed: boolean) => apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}/listing`, { method: "POST", body: { isPubliclyListed } }),
  listMembers: (id: string) => apiFetch<AdminNgoMember[]>(`/admin/animal-support/organizations/${id}/members`),
  grantMember: (id: string, email: string, role: string) => apiFetch(`/admin/animal-support/organizations/${id}/members`, { method: "POST", body: { email, role } }),
  revokeMember: (id: string, membershipId: string) => apiFetch(`/admin/animal-support/organizations/${id}/members/${membershipId}`, { method: "DELETE" }),
  openVerificationDocuments: (id: string, reason: string) => apiFetch<Array<{ index: number; downloadUrl: string; expiresInSeconds: number }>>(`/admin/animal-support/organizations/${id}/verification-documents`, { method: "POST", body: { reason } }),

  listDonations: (params: { status?: string; organizationId?: string; page?: number; pageSize?: number }) => apiFetch<PaginatedDto<AdminDonationRow>>(`/admin/animal-support/donations${qs(params)}`),
  refundDonation: (id: string, reason: string) => apiFetch(`/admin/animal-support/donations/${id}/refund`, { method: "POST", body: { reason } }),

  listLostPets: (params: { status?: string; q?: string; page?: number; pageSize?: number }) => apiFetch<PaginatedDto<AdminLostPetRow>>(`/admin/lost-pets${qs(params)}`),
  getLostPet: (id: string) => apiFetch<AdminLostPetDetail>(`/admin/lost-pets/${id}`),
  revealLostPetLocation: (id: string, reason: string) => apiFetch<RevealedLocation>(`/admin/lost-pets/${id}/reveal-location`, { method: "POST", body: { reason } }),
  closeLostPet: (id: string, reason: string) => apiFetch(`/admin/lost-pets/${id}/close`, { method: "POST", body: { reason } }),

  listReports: (params: { status?: string; targetType?: ReportTargetFilter; page?: number; pageSize?: number }) => apiFetch<PaginatedDto<CommunityReportDto>>(`/admin/community/reports${qs(params)}`),
  escalateReport: (id: string, reason: string) => apiFetch<CommunityReportDto>(`/admin/community/reports/${id}/escalate`, { method: "POST", body: { reason } }),
  dismissReport: (id: string, reason?: string) => apiFetch<CommunityReportDto>(`/admin/community/reports/${id}/dismiss`, { method: "POST", body: { reason } }),

  trustCaseContext: (id: string) => apiFetch<TrustCaseContext>(`/admin/trust/cases/${id}/context`),
};
