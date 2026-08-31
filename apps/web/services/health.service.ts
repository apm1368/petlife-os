import type {
  AllergyDto,
  AllergyKnowledgeState,
  AllergySeverity,
  ConditionDto,
  ConditionStatus,
  HealthAreaKnowledgeState,
  HealthProfileDto,
  HealthSummaryDto,
  MedicationDto,
  MedicationStatus,
  VaccinationStatus,
  VaccinationSummaryDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface UpdateHealthProfileInput {
  lastReviewedAt?: string;
  allergiesOverallState?: HealthAreaKnowledgeState;
  conditionsOverallState?: HealthAreaKnowledgeState;
  medicationsOverallState?: HealthAreaKnowledgeState;
}

export interface CreateAllergyInput {
  name: string;
  reaction?: string;
  severity?: AllergySeverity;
  knowledgeState?: AllergyKnowledgeState;
}

export interface CreateConditionInput {
  name: string;
  status?: ConditionStatus;
  notes?: string;
  firstRecordedAt?: string;
}

export interface CreateMedicationInput {
  name: string;
  dosage?: number;
  unit?: string;
  frequencyText?: string;
  route?: string;
  status?: MedicationStatus;
  startDate?: string;
  endDate?: string;
  instructions?: string;
}

export interface UpdateVaccinationSummaryInput {
  status: VaccinationStatus;
  nextDueDate?: string;
  lastKnownDate?: string;
  notes?: string;
}

export const healthService = {
  getSummary: (petId: string) => apiFetch<HealthSummaryDto>(`/pets/${petId}/health/summary`),

  updateProfile: (petId: string, input: UpdateHealthProfileInput) =>
    apiFetch<HealthProfileDto>(`/pets/${petId}/health/profile`, { method: "PATCH", body: input }),

  listAllergies: (petId: string) => apiFetch<AllergyDto[]>(`/pets/${petId}/health/allergies`),
  createAllergy: (petId: string, input: CreateAllergyInput) =>
    apiFetch<AllergyDto>(`/pets/${petId}/health/allergies`, { method: "POST", body: input }),
  updateAllergy: (petId: string, id: string, input: Partial<CreateAllergyInput>) =>
    apiFetch<AllergyDto>(`/pets/${petId}/health/allergies/${id}`, { method: "PATCH", body: input }),
  deleteAllergy: (petId: string, id: string) =>
    apiFetch<void>(`/pets/${petId}/health/allergies/${id}`, { method: "DELETE" }),

  listConditions: (petId: string) => apiFetch<ConditionDto[]>(`/pets/${petId}/health/conditions`),
  createCondition: (petId: string, input: CreateConditionInput) =>
    apiFetch<ConditionDto>(`/pets/${petId}/health/conditions`, { method: "POST", body: input }),
  updateCondition: (petId: string, id: string, input: Partial<CreateConditionInput>) =>
    apiFetch<ConditionDto>(`/pets/${petId}/health/conditions/${id}`, { method: "PATCH", body: input }),

  listMedications: (petId: string) => apiFetch<MedicationDto[]>(`/pets/${petId}/health/medications`),
  createMedication: (petId: string, input: CreateMedicationInput) =>
    apiFetch<MedicationDto>(`/pets/${petId}/health/medications`, { method: "POST", body: input }),
  updateMedication: (petId: string, id: string, input: Partial<CreateMedicationInput>) =>
    apiFetch<MedicationDto>(`/pets/${petId}/health/medications/${id}`, { method: "PATCH", body: input }),

  getVaccinationSummary: (petId: string) => apiFetch<VaccinationSummaryDto>(`/pets/${petId}/health/vaccination-summary`),
  updateVaccinationSummary: (petId: string, input: UpdateVaccinationSummaryInput) =>
    apiFetch<VaccinationSummaryDto>(`/pets/${petId}/health/vaccination-summary`, { method: "PUT", body: input }),
};
