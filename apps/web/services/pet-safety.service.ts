import { apiFetch } from "@/lib/api/client";

export interface PetCardContact { name: string | null; phone: string; relation: string | null }
export interface PublicPetCardDto {
  kind: "EMERGENCY" | "ID_TAG";
  expiresAt: string | null;
  petId: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  photoUrl: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  microchipNumber: string | null;
  emergencyContact: PetCardContact | null;
  // ID_TAG
  isReportedLost?: boolean;
  lostIncidentId?: string | null;
  // EMERGENCY
  allergies?: { name: string; reaction: string | null; severity: string | null }[];
  activeConditions?: string[];
  activeMedications?: { name: string; dosage: string | null; unit: string | null; frequency: string | null }[];
  bloodType?: string | null;
  criticalNotes?: string | null;
}

/** What the owner can put on a public card (apps/api …/pet-safety.dto.ts PET_CARD_FIELDS). The name is always shown. */
export const PET_CARD_IDENTITY_FIELDS = ["PHOTO", "SPECIES", "BREED", "SEX", "AGE", "MICROCHIP_STATUS"] as const;
/** Health fields: only someone who may view the pet's health can publish them (the API enforces it too). */
export const PET_CARD_HEALTH_FIELDS = ["ALLERGIES", "CONDITIONS", "MEDICATIONS", "BLOOD_TYPE", "CRITICAL_NOTES"] as const;
export type PetCardField = (typeof PET_CARD_IDENTITY_FIELDS)[number] | (typeof PET_CARD_HEALTH_FIELDS)[number];

export interface PetShareCardDto {
  id: string;
  kind: "EMERGENCY" | "ID_TAG";
  state: "ACTIVE" | "REVOKED" | "ROTATED" | "EXPIRED";
  tokenHint: string;
  visibleFields: PetCardField[];
  contactMode: "IN_APP" | "PHONE" | "BOTH";
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
}

/** Only returned once, at creation: the raw token is never stored or shown again. */
export interface CreatedPetShareCardDto extends PetShareCardDto {
  token: string;
  publicPath: string;
}

export const petSafetyService = {
  publicCard: (token: string) => apiFetch<PublicPetCardDto>(`/public/pet-cards/${encodeURIComponent(token)}`),
  listCards: (petId: string) => apiFetch<PetShareCardDto[]>(`/pets/${encodeURIComponent(petId)}/share-cards`),
  /** A collar-tag card: no expiry, finders reach the owner in the app (never a phone number). */
  createIdTagCard: (petId: string, fields: PetCardField[]) =>
    apiFetch<CreatedPetShareCardDto>(`/pets/${encodeURIComponent(petId)}/share-cards`, { method: "POST", body: { kind: "ID_TAG", fields, contactMode: "IN_APP" } }),
  revokeCard: (petId: string, cardId: string) =>
    apiFetch<{ revoked: true }>(`/pets/${encodeURIComponent(petId)}/share-cards/${encodeURIComponent(cardId)}/revoke`, { method: "POST" }),
};
