import type { AnimalSupportOrganizationDto, HelpOfferDto, PaginatedDto, SupportNeedListingDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export type NgoRole = "OWNER" | "COORDINATOR" | "VIEWER";
export interface NgoMembership {
  organizationId: string;
  role: NgoRole;
  organization: { id: string; name: string; type: string; verificationStatus: string };
}
export interface NgoOverview {
  organization: AnimalSupportOrganizationDto;
  role: NgoRole;
  needs: { live: number; pendingReview: number; partiallyFulfilled: number; fulfilled: number; needsChanges: number };
  offers: { pending: number; active: number };
  donations: { receivedLast30DaysIrr: number; countLast30Days: number; generalAvailableIrr: number; restrictedAvailableIrr: number; paidOutIrr: number };
  teamSize: number;
}
export type NgoOffer = HelpOfferDto & { listingTitle: string; listingCategory: string };
export interface NgoDonationRow {
  id: string;
  amountIrr: number;
  fundType: "GENERAL" | "RESTRICTED";
  campaign: { id: string; title: string };
  supportNeedListingId: string | null;
  donorName: string | null;
  createdAt: string;
  refundedAt: string | null;
}
export interface NgoVerification {
  status: string;
  submittedAt: string | null;
  note: string | null;
  documentCount: number;
  canSubmit: boolean;
}

const KEY = "petlife.ngo.organization";
/** The selected organization (only a selector — the API checks membership every time). */
export function selectedNgo(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function selectNgo(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* not remembered */
  }
}
const q = (path: string) => {
  const org = typeof window === "undefined" ? null : selectedNgo();
  return org ? `${path}${path.includes("?") ? "&" : "?"}org=${org}` : path;
};

export const ngoService = {
  me: () => apiFetch<{ current: { organizationId: string; role: NgoRole }; memberships: NgoMembership[] }>(q("/ngo/me")),
  overview: () => apiFetch<NgoOverview>(q("/ngo/overview")),
  needs: (status?: string, page = 1) => apiFetch<PaginatedDto<SupportNeedListingDto>>(q(`/ngo/needs?page=${page}${status ? `&status=${status}` : ""}`)),
  offers: (p: { status?: string; volunteer?: boolean; page?: number } = {}) => apiFetch<PaginatedDto<NgoOffer>>(q(`/ngo/offers?page=${p.page ?? 1}${p.status ? `&status=${p.status}` : ""}${p.volunteer ? "&volunteer=1" : ""}`)),
  donations: (page = 1) => apiFetch<PaginatedDto<NgoDonationRow> & { balance: { generalAvailableIrr: number; restrictedAvailableIrr: number; paidIrr: number } }>(q(`/ngo/donations?page=${page}`)),
  team: () => apiFetch<{ id: string; displayName: string | null; role: NgoRole; isActive: boolean; createdAt: string }[]>(q("/ngo/team")),
  addMember: (email: string, role: NgoRole) => apiFetch<unknown>(q("/ngo/team"), { method: "POST", body: { email, role } }),
  updateMember: (id: string, input: { role?: NgoRole; isActive?: boolean }) => apiFetch<unknown>(q(`/ngo/team/${id}`), { method: "PATCH", body: input }),
  verification: () => apiFetch<NgoVerification>(q("/ngo/verification")),
  verificationUpload: (contentType: string, fileSizeBytes: number) => apiFetch<{ uploadUrl: string; headers?: Record<string, string>; key: string }>(q("/ngo/verification/upload-url"), { method: "POST", body: { contentType, fileSizeBytes } }),
  submitVerification: (documentKeys: string[]) => apiFetch<NgoVerification>(q("/ngo/verification/submit"), { method: "POST", body: { documentKeys } }),
  updateProfile: (input: { description?: string; location?: string; contactEmail?: string | null; contactPhone?: string | null }) => apiFetch<AnimalSupportOrganizationDto>(q("/ngo/profile"), { method: "PATCH", body: input }),
};
