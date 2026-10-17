import type {
  AnimalSupportOrganizationDto,
  CommunityReportDto,
  PaginatedDto,
  SupportNeedListingDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";
import type {
  RescueCaseDto,
  SupportCampaignDto,
  SupportCampaignUpdateDto,
  DonationFundBalanceDto,
  CampaignFundType,
  RescueCaseStatus,
  SupportCampaignStatus,
  CommunityPostDto,
} from "@petlife/types";

export interface SupportMediaUpload {
  uploadUrl: string;
  headers?: Record<string, string>;
  key: string;
}
export interface UpdateSupportOrganizationInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoObjectKey?: string | null;
}
export interface CreateRescueInput {
  title: string;
  description: string;
  animalType?: string;
  location?: string;
  estimatedNeedIrr?: number;
  evidenceObjectKeys?: string[];
}
export interface CreateCampaignInput {
  title: string;
  description: string;
  fundType: CampaignFundType;
  rescueCaseId?: string;
  targetAmountIrr?: number;
  startsAt?: string;
  endsAt?: string;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

export interface AdminAnimalSupportOverview {
  needsAttention: {
    pendingListings: number;
    orgsAwaitingReview: number;
    openReports: number;
    openTrustCases: number;
  };
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

export interface AdminNgoMember {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: "OWNER" | "COORDINATOR" | "VIEWER";
  isActive: boolean;
}

export interface AdminLostPetRow {
  id: string;
  petName: string;
  petSpecies: string;
  status: string;
  publicArea: string | null;
  sightingsCount: number;
  lastSeenAt: string | null;
  createdAt: string;
}
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
export interface RevealedLocation {
  lastKnownLocation: string | null;
  lastKnownLatitude: number | null;
  lastKnownLongitude: number | null;
  privateNotes: string | null;
}

export interface TrustCaseContext {
  trustCaseId: string;
  subjectType: string;
  subjectId: string;
  subject: Record<string, unknown> | null;
  reports: {
    total: number;
    distinctReporters: number;
    byReason: Record<string, number>;
    items: Array<{ id: string; reason: string; details: string | null; status: string; createdAt: string }>;
  };
  availableActions: string[];
}

export type ReportTargetFilter =
  "COMMUNITY" | "SUPPORT_NEED" | "LOST_PET_INCIDENT" | "LOST_PET_SIGHTING" | "ORGANIZATION";

/** Batch 6 — the admin animal-support, lost-pet and community console. Every call is permission-checked and audited server-side. */
export const adminAnimalSupportService = {
  updateOrganization: (id: string, body: UpdateSupportOrganizationInput) =>
    apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}`, {
      method: "PATCH",
      body,
    }),
  organizationLogoUpload: (id: string, contentType: string, fileSizeBytes: number) =>
    apiFetch<SupportMediaUpload>(`/admin/animal-support/organizations/${id}/logo-upload-url`, {
      method: "POST",
      body: { contentType, fileSizeBytes },
    }),
  listRescueCases: (params: { status?: string; organizationId?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<RescueCaseDto>>(`/admin/animal-support/rescue-cases${qs(params)}`),
  getRescueCase: (id: string) => apiFetch<RescueCaseDto>(`/admin/animal-support/rescue-cases/${id}`),
  createRescueCase: (orgId: string, body: CreateRescueInput) =>
    apiFetch<RescueCaseDto>(`/admin/animal-support/organizations/${orgId}/rescue-cases`, {
      method: "POST",
      body,
    }),
  setRescueStatus: (id: string, status: RescueCaseStatus) =>
    apiFetch<RescueCaseDto>(`/admin/animal-support/rescue-cases/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),
  registerRescueEvidence: (id: string, evidenceObjectKeys: string[]) =>
    apiFetch<RescueCaseDto>(`/admin/animal-support/rescue-cases/${id}/evidence`, {
      method: "POST",
      body: { evidenceObjectKeys },
    }),
  rescueEvidenceUpload: (id: string, contentType: string, fileSizeBytes: number) =>
    apiFetch<SupportMediaUpload>(`/admin/animal-support/rescue-cases/${id}/evidence-upload-url`, {
      method: "POST",
      body: { contentType, fileSizeBytes },
    }),
  listCampaigns: (params: {
    status?: string;
    organizationId?: string;
    rescueCaseId?: string;
    page?: number;
    pageSize?: number;
  }) => apiFetch<PaginatedDto<SupportCampaignDto>>(`/admin/animal-support/campaigns${qs(params)}`),
  getCampaign: (id: string) => apiFetch<SupportCampaignDto>(`/admin/animal-support/campaigns/${id}`),
  createCampaign: (orgId: string, body: CreateCampaignInput) =>
    apiFetch<SupportCampaignDto>(`/admin/animal-support/organizations/${orgId}/campaigns`, {
      method: "POST",
      body,
    }),
  setCampaignStatus: (id: string, status: SupportCampaignStatus) =>
    apiFetch<SupportCampaignDto>(`/admin/animal-support/campaigns/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),
  listCampaignUpdates: (id: string) =>
    apiFetch<SupportCampaignUpdateDto[]>(`/admin/animal-support/campaigns/${id}/updates`),
  postCampaignUpdate: (id: string, body: { title: string; body: string; evidenceObjectKeys?: string[] }) =>
    apiFetch<SupportCampaignUpdateDto>(`/admin/animal-support/campaigns/${id}/updates`, {
      method: "POST",
      body,
    }),
  campaignEvidenceUpload: (id: string, contentType: string, fileSizeBytes: number) =>
    apiFetch<SupportMediaUpload>(`/admin/animal-support/campaigns/${id}/evidence-upload-url`, {
      method: "POST",
      body: { contentType, fileSizeBytes },
    }),
  shareCampaign: (id: string) =>
    apiFetch<CommunityPostDto>(`/admin/animal-support/campaigns/${id}/share-to-community`, {
      method: "POST",
    }),
  getFundBalance: (id: string) =>
    apiFetch<DonationFundBalanceDto>(`/admin/animal-support/organizations/${id}/fund-balance`),
  recordPayout: (id: string, body: { amountIrr: number; fundType: CampaignFundType; reason: string }) =>
    apiFetch<void>(`/admin/animal-support/organizations/${id}/payouts`, { method: "POST", body }),
  overview: () => apiFetch<AdminAnimalSupportOverview>("/admin/animal-support/overview"),

  listNeeds: (params: { status?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<SupportNeedListingDto>>(`/admin/animal-support/needs${qs(params)}`),
  getNeed: (id: string) => apiFetch<SupportNeedListingDto>(`/admin/animal-support/needs/${id}`),
  reviewNeed: (id: string, status: string, reviewNote?: string) =>
    apiFetch<SupportNeedListingDto>(`/admin/animal-support/needs/${id}/review`, {
      method: "POST",
      body: { status, reviewNote },
    }),

  listOrganizations: (params: { verificationStatus?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<AnimalSupportOrganizationDto>>(`/admin/animal-support/organizations${qs(params)}`),
  getOrganization: (id: string) =>
    apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}`),
  createOrganization: (input: { type: string; name: string }) =>
    apiFetch<AnimalSupportOrganizationDto>("/admin/animal-support/organizations", {
      method: "POST",
      body: input,
    }),
  setVerification: (id: string, verificationStatus: string, reason?: string) =>
    apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}/verification`, {
      method: "POST",
      body: { verificationStatus, reason },
    }),
  setListed: (id: string, isPubliclyListed: boolean) =>
    apiFetch<AnimalSupportOrganizationDto>(`/admin/animal-support/organizations/${id}/listing`, {
      method: "POST",
      body: { isPubliclyListed },
    }),
  listMembers: (id: string) =>
    apiFetch<AdminNgoMember[]>(`/admin/animal-support/organizations/${id}/members`),
  grantMember: (id: string, email: string, role: string) =>
    apiFetch(`/admin/animal-support/organizations/${id}/members`, { method: "POST", body: { email, role } }),
  revokeMember: (id: string, membershipId: string) =>
    apiFetch(`/admin/animal-support/organizations/${id}/members/${membershipId}`, { method: "DELETE" }),
  openVerificationDocuments: (id: string, reason: string) =>
    apiFetch<Array<{ index: number; downloadUrl: string; expiresInSeconds: number }>>(
      `/admin/animal-support/organizations/${id}/verification-documents`,
      { method: "POST", body: { reason } },
    ),

  listDonations: (params: { status?: string; organizationId?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<AdminDonationRow>>(`/admin/animal-support/donations${qs(params)}`),
  refundDonation: (id: string, reason: string) =>
    apiFetch(`/admin/animal-support/donations/${id}/refund`, { method: "POST", body: { reason } }),

  listLostPets: (params: { status?: string; q?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<AdminLostPetRow>>(`/admin/lost-pets${qs(params)}`),
  getLostPet: (id: string) => apiFetch<AdminLostPetDetail>(`/admin/lost-pets/${id}`),
  revealLostPetLocation: (id: string, reason: string) =>
    apiFetch<RevealedLocation>(`/admin/lost-pets/${id}/reveal-location`, {
      method: "POST",
      body: { reason },
    }),
  closeLostPet: (id: string, reason: string) =>
    apiFetch(`/admin/lost-pets/${id}/close`, { method: "POST", body: { reason } }),

  listReports: (params: {
    status?: string;
    targetType?: ReportTargetFilter;
    page?: number;
    pageSize?: number;
  }) => apiFetch<PaginatedDto<CommunityReportDto>>(`/admin/community/reports${qs(params)}`),
  escalateReport: (id: string, reason: string) =>
    apiFetch<CommunityReportDto>(`/admin/community/reports/${id}/escalate`, {
      method: "POST",
      body: { reason },
    }),
  dismissReport: (id: string, reason?: string) =>
    apiFetch<CommunityReportDto>(`/admin/community/reports/${id}/dismiss`, {
      method: "POST",
      body: { reason },
    }),

  trustCaseContext: (id: string) => apiFetch<TrustCaseContext>(`/admin/trust/cases/${id}/context`),
};
