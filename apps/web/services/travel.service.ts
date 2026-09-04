import type {
  PetPassportReadinessDto,
  TravelMode,
  TravelRequirementDto,
  TravelRequirementStatus,
  TravelRequirementType,
  TripDto,
  TripReadinessSummaryDto,
  TripStatus,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface CreateTripInput {
  originCountry: string;
  originCity?: string;
  destinationCountry: string;
  destinationCity?: string;
  departAt: string;
  returnAt?: string;
  travelMode?: TravelMode;
  notes?: string;
}

export interface UpdateTripInput {
  originCity?: string;
  destinationCity?: string;
  departAt?: string;
  returnAt?: string;
  travelMode?: TravelMode;
  notes?: string;
}

export interface CreateTravelRequirementInput {
  requirementType: TravelRequirementType;
  status?: TravelRequirementStatus;
  source?: string;
  sourceUrl?: string;
  jurisdiction?: string;
  notes?: string;
}

export interface UpdateTravelRequirementInput {
  status?: TravelRequirementStatus;
  source?: string;
  sourceUrl?: string;
  jurisdiction?: string;
  markVerified?: boolean;
  validUntil?: string;
  linkedMedicalDocumentId?: string | null;
  notes?: string;
}

export const travelService = {
  list: (petId: string) => apiFetch<TripDto[]>(`/pets/${petId}/trips`),
  get: (petId: string, tripId: string) => apiFetch<TripDto>(`/pets/${petId}/trips/${tripId}`),
  create: (petId: string, input: CreateTripInput) => apiFetch<TripDto>(`/pets/${petId}/trips`, { method: "POST", body: input }),
  update: (petId: string, tripId: string, input: UpdateTripInput) => apiFetch<TripDto>(`/pets/${petId}/trips/${tripId}`, { method: "PATCH", body: input }),
  transition: (petId: string, tripId: string, status: TripStatus) => apiFetch<TripDto>(`/pets/${petId}/trips/${tripId}/transition`, { method: "POST", body: { status } }),
  getPassportReadiness: (petId: string) => apiFetch<PetPassportReadinessDto>(`/pets/${petId}/trips/passport-readiness`),

  listRequirements: (petId: string, tripId: string) => apiFetch<TravelRequirementDto[]>(`/pets/${petId}/trips/${tripId}/requirements`),
  getRequirementSuggestions: (petId: string, tripId: string) => apiFetch<TravelRequirementType[]>(`/pets/${petId}/trips/${tripId}/requirement-suggestions`),
  getReadiness: (petId: string, tripId: string) => apiFetch<TripReadinessSummaryDto>(`/pets/${petId}/trips/${tripId}/readiness`),
  createRequirement: (petId: string, tripId: string, input: CreateTravelRequirementInput) =>
    apiFetch<TravelRequirementDto>(`/pets/${petId}/trips/${tripId}/requirements`, { method: "POST", body: input }),
  updateRequirement: (petId: string, tripId: string, requirementId: string, input: UpdateTravelRequirementInput) =>
    apiFetch<TravelRequirementDto>(`/pets/${petId}/trips/${tripId}/requirements/${requirementId}`, { method: "PATCH", body: input }),
  deleteRequirement: (petId: string, tripId: string, requirementId: string) =>
    apiFetch<void>(`/pets/${petId}/trips/${tripId}/requirements/${requirementId}`, { method: "DELETE" }),
};
