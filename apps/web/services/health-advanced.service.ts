import type {
  CarePlanDto,
  ClinicalNutritionPlanDto,
  ClinicalVisitDetailDto,
  ClinicalVisitDto,
  DentalRecordDto,
  EndOfLifeCarePlanDto,
  HealthOverviewDto,
  HealthTimelineEntryDto,
  ImagingStudyDto,
  LabResultDto,
  MedicalDocumentDownloadDto,
  MedicalDocumentDto,
  MedicalRecordCorrectionDto,
  RehabPlanDto,
  ReferralDto,
  SeniorCareNoteDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface RequestDocumentUploadInput {
  contentType: string;
  fileSizeBytes: number;
}

export interface CreateDocumentInput {
  key: string;
  documentType: string;
  title: string;
  description?: string;
  mimeType: string;
  fileSizeBytes: number;
  recordedAt?: string;
}

export interface CreateCorrectionInput {
  targetType: string;
  targetId: string;
  correctionText: string;
}

export const healthAdvancedService = {
  getOverview: (petId: string) => apiFetch<HealthOverviewDto>(`/pets/${petId}/health`),
  getTimeline: (petId: string) => apiFetch<HealthTimelineEntryDto[]>(`/pets/${petId}/health/timeline`),

  listDocuments: (petId: string) => apiFetch<MedicalDocumentDto[]>(`/pets/${petId}/health/documents`),
  requestDocumentUpload: (petId: string, input: RequestDocumentUploadInput) =>
    apiFetch<{ uploadUrl: string; method: "PUT"; headers?: Record<string, string>; key: string }>(`/pets/${petId}/health/documents/upload-url`, { method: "POST", body: input }),
  createDocument: (petId: string, input: CreateDocumentInput) =>
    apiFetch<MedicalDocumentDto>(`/pets/${petId}/health/documents`, { method: "POST", body: input }),
  downloadDocument: (petId: string, documentId: string) =>
    apiFetch<MedicalDocumentDownloadDto>(`/pets/${petId}/health/documents/${documentId}/download`),
  voidDocument: (petId: string, documentId: string, reason: string) =>
    apiFetch<MedicalDocumentDto>(`/pets/${petId}/health/documents/${documentId}/void`, { method: "POST", body: { reason } }),

  listCorrections: (petId: string) => apiFetch<MedicalRecordCorrectionDto[]>(`/pets/${petId}/health/corrections`),
  createCorrection: (petId: string, input: CreateCorrectionInput) =>
    apiFetch<MedicalRecordCorrectionDto>(`/pets/${petId}/health/corrections`, { method: "POST", body: input }),

  listLabs: (petId: string) => apiFetch<LabResultDto[]>(`/pets/${petId}/health/labs`),
  listImaging: (petId: string) => apiFetch<ImagingStudyDto[]>(`/pets/${petId}/health/imaging`),
  listReferrals: (petId: string) => apiFetch<ReferralDto[]>(`/pets/${petId}/health/referrals`),
  listDental: (petId: string) => apiFetch<DentalRecordDto[]>(`/pets/${petId}/health/dental`),
  listNutrition: (petId: string) => apiFetch<ClinicalNutritionPlanDto[]>(`/pets/${petId}/health/nutrition`),
  listRehab: (petId: string) => apiFetch<RehabPlanDto[]>(`/pets/${petId}/health/rehab`),

  listVisits: (petId: string) => apiFetch<ClinicalVisitDto[]>(`/pets/${petId}/health/visits`),
  getVisit: (petId: string, visitId: string) => apiFetch<ClinicalVisitDetailDto>(`/pets/${petId}/health/visits/${visitId}`),

  listCarePlans: (petId: string) => apiFetch<CarePlanDto[]>(`/pets/${petId}/health/care-plans`),

  listSeniorCare: (petId: string) => apiFetch<SeniorCareNoteDto[]>(`/pets/${petId}/health/senior-care`),
  addSeniorCareNote: (petId: string, input: Partial<SeniorCareNoteDto>) =>
    apiFetch<SeniorCareNoteDto>(`/pets/${petId}/health/senior-care`, { method: "POST", body: input }),

  getEndOfLife: (petId: string) => apiFetch<EndOfLifeCarePlanDto | null>(`/pets/${petId}/health/end-of-life`),
  upsertEndOfLife: (petId: string, input: Partial<EndOfLifeCarePlanDto>) =>
    apiFetch<EndOfLifeCarePlanDto>(`/pets/${petId}/health/end-of-life`, { method: "POST", body: input }),
};
