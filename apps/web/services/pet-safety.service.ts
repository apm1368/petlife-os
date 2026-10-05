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

export const petSafetyService = {
  publicCard: (token: string) => apiFetch<PublicPetCardDto>(`/public/pet-cards/${encodeURIComponent(token)}`),
};
