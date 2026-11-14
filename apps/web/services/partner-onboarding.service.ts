import { apiFetch } from "@/lib/api/client";

export const PARTNER_SERVICE_KINDS = ["VET_CLINIC", "VETERINARIAN", "GROOMER", "BOARDING", "SITTER", "TRAINER", "WALKER", "PET_TAXI"] as const;
export type PartnerServiceKind = (typeof PARTNER_SERVICE_KINDS)[number];
export type PartnerSubject = "PROVIDER" | "SELLER";
export type DayHours = { dayOfWeek: number; start: string; end: string };

export type PartnerDocument = { id: string; kind: string; status: string; mimeType: string; fileSizeBytes: number; expiresAt: string | null; reviewNote: string | null; rejectionReason: string | null; createdAt: string };

/** GET /partner-onboarding — the signed-in partner's own draft (never object keys or private URLs). */
export interface PartnerOnboardingStateDto {
  signupIntent: "PET_OWNER" | "PARTNER";
  mobileVerified: boolean;
  started: boolean;
  serviceKinds: PartnerServiceKind[];
  shop: boolean;
  linked: boolean;
  business: { name: string; description: string | null; logoUrl: string | null } | null;
  owner: { firstName: string; lastName: string; phone: string } | null;
  address: { province: string | null; city: string | null; addressLine: string | null; postalCode: string | null; latitude: number | null; longitude: number | null; exactPinPublic?: boolean | null } | null;
  calendar: DayHours[];
  services: { id: string; kind: PartnerServiceKind | null; name: string; priceIrr: number; durationMinutes: number; maxPets: number; isActive: boolean }[];
  openingHours: { dayOfWeek: number; open: string; close: string }[];
  products: { offerId: string; productVariantId: string; productTitle: string; variantTitle: string | null; priceIrr: number; stock: number; status: string; moderationStatus: string }[];
  verification: { subject: PartnerSubject; status: string; lifecycle: string; canSubmit: boolean; documents: PartnerDocument[]; missingProfileFields: string[]; missingForSubmission: string[] }[];
  missing: string[];
  providerOrganizationId: string | null;
  sellerOrganizationId: string | null;
  submitted: boolean;
  verified: boolean;
}

type UploadTarget = { uploadUrl: string; method: "PUT"; publicUrl: string; headers?: Record<string, string>; key: string };

/** Partner signup ("ثبت‌نام همکار"): every call acts on the signed-in user's own onboarding businesses. */
export const partnerOnboardingService = {
  state: () => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding"),
  start: (input: { serviceKinds: PartnerServiceKind[]; shop: boolean; businessName: string }) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/start", { method: "POST", body: input }),
  logoUpload: (contentType: string, fileSizeBytes: number) => apiFetch<UploadTarget>("/partner-onboarding/logo-upload", { method: "POST", body: { contentType, fileSizeBytes } }),
  business: (input: { name: string; description?: string; logoObjectKey?: string }) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/business", { method: "PUT", body: input }),
  owner: (input: { firstName: string; lastName: string; phone: string }) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/owner", { method: "PUT", body: input }),
  documentUpload: (subject: PartnerSubject, contentType: string, fileSizeBytes: number) => apiFetch<UploadTarget>("/partner-onboarding/documents/upload", { method: "POST", body: { subject, contentType, fileSizeBytes } }),
  registerDocument: (input: { subject: PartnerSubject; objectKey: string; kind: string; contentType: string; fileSizeBytes: number; expiresAt?: string }) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/documents", { method: "POST", body: input }),
  address: (input: { province: string; city: string; addressLine: string; postalCode?: string; latitude?: number; longitude?: number; locationConsent?: boolean; exactPinPublic?: boolean }) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/address", { method: "PUT", body: input }),
  calendar: (days: DayHours[]) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/calendar", { method: "PUT", body: { days } }),
  services: (services: { kind: PartnerServiceKind; name: string; priceIrr: number; durationMinutes: number; maxPets: number }[]) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/services", { method: "PUT", body: { services } }),
  openingHours: (days: DayHours[]) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/opening-hours", { method: "PUT", body: { days } }),
  products: (items: { productVariantId: string; priceIrr: number; stock: number }[]) => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/products", { method: "PUT", body: { items } }),
  submit: () => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/submit", { method: "POST" }),
  cancel: () => apiFetch<PartnerOnboardingStateDto>("/partner-onboarding/cancel", { method: "POST" }),
};

/** PUT the file bytes to a target the API issued (private KYC key or the public logo key). */
export async function putToTarget(target: { uploadUrl: string; headers?: Record<string, string> }, file: File): Promise<void> {
  const res = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file, credentials: "omit" });
  if (!res.ok) throw new Error("upload");
}
