import type { CarePlanDto, ClinicalVisitDetailDto, ClinicalVisitDto, LabResultDto, MedicalDocumentDto, PetSpecies, ReferralDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** Shape of ProviderClinicalPatientService.get()'s response — a read-only, provider-specific view assembled ad hoc server-side rather than a shared DTO (spec: "Consumer DTO != Provider clinical DTO"). */
export interface ProviderClinicalPatientDto {
  pet: { id: string; name: string; species: PetSpecies; breed: string | null; sex: string | null; birthDate: string | null };
  careProfile: { temperamentText: string | null; handlingSensitivityText: string | null; specialInstructionsText: string | null } | null;
  allergies: { id: string; name: string; severity: string | null }[];
  medications: { id: string; name: string; dosage: number | null; unit: string | null; frequencyText: string | null }[];
  conditions: { id: string; name: string; notes: string | null }[];
  recentVisits: ClinicalVisitDto[];
  recentLabs: LabResultDto[];
  documents: MedicalDocumentDto[];
  carePlans: CarePlanDto[];
}

export interface StartVisitInput {
  petId: string;
  bookingId?: string;
  reasonForVisit?: string;
}

export interface VisitNotesInput {
  reasonForVisit?: string;
  historyText?: string;
  observationsText?: string;
  assessmentText?: string;
  planText?: string;
}

export const providerClinicalService = {
  getPatient: (petId: string) => apiFetch<ProviderClinicalPatientDto>(`/provider/patients/${petId}`),
  listVisits: (petId: string) => apiFetch<ClinicalVisitDto[]>(`/provider/patients/${petId}/visits`),
  getVisit: (petId: string, visitId: string) => apiFetch<ClinicalVisitDetailDto>(`/provider/patients/${petId}/visits/${visitId}`),
  startVisit: (input: StartVisitInput) => apiFetch<ClinicalVisitDto>(`/provider/visits`, { method: "POST", body: input }),
  updateVisitNotes: (petId: string, visitId: string, input: VisitNotesInput) =>
    apiFetch<ClinicalVisitDto>(`/provider/patients/${petId}/visits/${visitId}/notes`, { method: "POST", body: input }),
  completeVisit: (petId: string, visitId: string) => apiFetch<ClinicalVisitDto>(`/provider/patients/${petId}/visits/${visitId}/complete`, { method: "POST" }),
  amendVisit: (petId: string, visitId: string, input: VisitNotesInput & { reason: string }) =>
    apiFetch<ClinicalVisitDetailDto>(`/provider/patients/${petId}/visits/${visitId}/amend`, { method: "POST", body: input }),
  voidVisit: (petId: string, visitId: string, reason: string) =>
    apiFetch<ClinicalVisitDto>(`/provider/patients/${petId}/visits/${visitId}/void`, { method: "POST", body: { reason } }),

  createReferral: (input: { petId: string; reason: string; toProviderOrganizationId?: string; externalProviderName?: string; clinicalVisitId?: string }) =>
    apiFetch<ReferralDto>(`/provider/referrals`, { method: "POST", body: input }),

  createLabResult: (input: { petId: string; testName: string; value?: string; unit?: string; clinicalVisitId?: string }) =>
    apiFetch<LabResultDto>(`/provider/labs`, { method: "POST", body: input }),
};
