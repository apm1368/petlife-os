import type {
  ClinicalAlertSeverity,
  ClinicalAlertType,
  ClinicalDashboardDto,
  ClinicalEstimateDto,
  ClinicalNoteTemplateDto,
  ClinicalProblemDto,
  ClinicalProblemStatus,
  DischargeSummaryDto,
  HospitalizationDetailDto,
  HospitalizationDto,
  PaginatedDto,
  PatientAccessState,
  PatientVitalsDto,
  PetSpecies,
  PrescriptionDto,
  PrescriptionRoute,
  ProviderClinicalAlertDto,
  ProviderPatientRecordDto,
  ProviderPatientSummaryDto,
  TreatmentTaskDto,
  TreatmentTaskStatus,
  TreatmentTaskType,
  TriageLevel,
  VitalsTrendsDto,
  WeightUnit,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface ListPatientsInput {
  q?: string;
  species?: PetSpecies;
  accessState?: PatientAccessState;
  hospitalizedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface RecordVitalsInput {
  petId: string;
  clinicalVisitId?: string;
  hospitalizationId?: string;
  weightValue?: number;
  weightUnit?: WeightUnit;
  temperatureC?: number;
  heartRateBpm?: number;
  respiratoryRateBpm?: number;
  capillaryRefillSeconds?: number;
  systolicBloodPressure?: number;
  oxygenSaturationPercent?: number;
  bloodGlucoseMgDl?: number;
  mucousMembraneColor?: string;
  hydrationStatus?: string;
  bodyConditionScore?: number;
  bodyConditionScale?: string;
  painScore?: number;
  painScale?: string;
  triageLevel?: TriageLevel;
  notes?: string;
}

export interface CreatePrescriptionInput {
  petId: string;
  clinicalVisitId?: string;
  drugName: string;
  strength?: string;
  form?: string;
  route?: PrescriptionRoute;
  doseAmount?: number;
  doseUnit?: string;
  frequencyText?: string;
  durationDays?: number;
  quantityDispensed?: number;
  quantityUnit?: string;
  refillsAuthorized?: number;
  isControlledSubstance?: boolean;
  instructionsForOwner?: string;
  internalNotes?: string;
}

export interface EstimateLineInput {
  description: string;
  quantity?: number;
  unitLowIrr: number;
  unitHighIrr: number;
}

export interface DischargeSummaryInput {
  summaryText?: string;
  homeCareInstructions?: string;
  medicationsSummary?: string;
  warningSignsText?: string;
  followUpAt?: string;
  followUpInstructions?: string;
}

/**
 * The vet panel's API surface (Handoff 24). Provider routes live under
 * `/provider/clinical`, the owner's read of the same rows under
 * `/pets/:petId/clinical` — two clients for one record, exactly as the
 * backend splits them.
 */
export const vetPanelService = {
  // --- Registry, dashboard, templates --------------------------------------
  listPatients: (input: ListPatientsInput = {}) =>
    apiFetch<PaginatedDto<ProviderPatientSummaryDto>>(
      `/provider/clinical/patients${toQueryString({
        q: input.q,
        species: input.species,
        accessState: input.accessState,
        hospitalizedOnly: input.hospitalizedOnly ? "true" : undefined,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    ),
  getDashboard: () => apiFetch<ClinicalDashboardDto>("/provider/clinical/dashboard"),
  getPatientRecord: (petId: string) => apiFetch<ProviderPatientRecordDto>(`/provider/clinical/patients/${petId}`),

  listNoteTemplates: () => apiFetch<ClinicalNoteTemplateDto[]>("/provider/clinical/note-templates"),
  createNoteTemplate: (input: { name: string; presentingComplaint?: string; species?: PetSpecies; historyTemplate?: string; observationsTemplate?: string; assessmentTemplate?: string; planTemplate?: string }) =>
    apiFetch<ClinicalNoteTemplateDto>("/provider/clinical/note-templates", { method: "POST", body: input }),

  // --- Vitals ---------------------------------------------------------------
  listVitals: (petId: string, limit?: number) => apiFetch<PatientVitalsDto[]>(`/provider/clinical/patients/${petId}/vitals${toQueryString({ limit })}`),
  getVitalsTrends: (petId: string) => apiFetch<VitalsTrendsDto>(`/provider/clinical/patients/${petId}/vitals/trends`),
  recordVitals: (input: RecordVitalsInput) => apiFetch<PatientVitalsDto>("/provider/clinical/vitals", { method: "POST", body: input }),

  // --- Problem list ---------------------------------------------------------
  listProblems: (petId: string) => apiFetch<ClinicalProblemDto[]>(`/provider/clinical/patients/${petId}/problems`),
  createProblem: (input: { petId: string; name: string; bodySystem?: string; originatingVisitId?: string; notes?: string }) =>
    apiFetch<ClinicalProblemDto>("/provider/clinical/problems", { method: "POST", body: input }),
  updateProblem: (petId: string, problemId: string, input: { status?: ClinicalProblemStatus; notes?: string }) =>
    apiFetch<ClinicalProblemDto>(`/provider/clinical/patients/${petId}/problems/${problemId}`, { method: "PATCH", body: { petId, ...input } }),

  // --- Prescriptions --------------------------------------------------------
  listPrescriptions: (petId: string) => apiFetch<PrescriptionDto[]>(`/provider/clinical/patients/${petId}/prescriptions`),
  createPrescription: (input: CreatePrescriptionInput) => apiFetch<PrescriptionDto>("/provider/clinical/prescriptions", { method: "POST", body: input }),
  cancelPrescription: (petId: string, prescriptionId: string, reason: string) =>
    apiFetch<PrescriptionDto>(`/provider/clinical/prescriptions/${prescriptionId}/cancel`, { method: "POST", body: { petId, reason } }),
  dispenseRefill: (petId: string, prescriptionId: string) =>
    apiFetch<PrescriptionDto>(`/provider/clinical/prescriptions/${prescriptionId}/refill`, { method: "POST", body: { petId } }),

  // --- Hospitalization ------------------------------------------------------
  admitPatient: (input: { petId: string; reasonForAdmission: string; kennelLabel?: string; triageLevel?: TriageLevel; clinicalVisitId?: string; estimatedDischargeAt?: string }) =>
    apiFetch<HospitalizationDto>("/provider/clinical/hospitalizations", { method: "POST", body: input }),
  getHospitalization: (petId: string, hospitalizationId: string) =>
    apiFetch<HospitalizationDetailDto>(`/provider/clinical/patients/${petId}/hospitalizations/${hospitalizationId}`),
  dischargePatient: (petId: string, hospitalizationId: string, dischargeNote?: string) =>
    apiFetch<HospitalizationDto>(`/provider/clinical/hospitalizations/${hospitalizationId}/discharge`, { method: "POST", body: { petId, dischargeNote } }),
  scheduleTaskSeries: (hospitalizationId: string, input: { petId: string; type: TreatmentTaskType; title: string; detail?: string; startAt: string; everyHours: number; occurrences: number }) =>
    apiFetch<TreatmentTaskDto[]>(`/provider/clinical/hospitalizations/${hospitalizationId}/task-series`, { method: "POST", body: input }),
  actionTask: (hospitalizationId: string, taskId: string, input: { petId: string; status: TreatmentTaskStatus; outcomeNote?: string }) =>
    apiFetch<TreatmentTaskDto>(`/provider/clinical/hospitalizations/${hospitalizationId}/tasks/${taskId}/action`, { method: "POST", body: input }),

  // --- Estimates ------------------------------------------------------------
  createEstimate: (input: { petId: string; title: string; notes?: string; clinicalVisitId?: string; lines: EstimateLineInput[] }) =>
    apiFetch<ClinicalEstimateDto>("/provider/clinical/estimates", { method: "POST", body: input }),
  presentEstimate: (petId: string, estimateId: string) =>
    apiFetch<ClinicalEstimateDto>(`/provider/clinical/estimates/${estimateId}/present`, { method: "POST", body: { petId } }),

  // --- Discharge summary ----------------------------------------------------
  getDischargeSummary: (petId: string, visitId: string) => apiFetch<DischargeSummaryDto | null>(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary`),
  saveDischargeSummary: (petId: string, visitId: string, input: DischargeSummaryInput) =>
    apiFetch<DischargeSummaryDto>(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary`, { method: "POST", body: input }),
  issueDischargeSummary: (petId: string, visitId: string) =>
    apiFetch<DischargeSummaryDto>(`/provider/clinical/patients/${petId}/visits/${visitId}/discharge-summary/issue`, { method: "POST", body: {} }),

  // --- Staff-safety alerts --------------------------------------------------
  listAlerts: (petId: string) => apiFetch<ProviderClinicalAlertDto[]>(`/provider/clinical/patients/${petId}/alerts`),
  createAlert: (input: { petId: string; type: ClinicalAlertType; severity: ClinicalAlertSeverity; message: string }) =>
    apiFetch<ProviderClinicalAlertDto>("/provider/clinical/alerts", { method: "POST", body: input }),
  resolveAlert: (petId: string, alertId: string) => apiFetch<ProviderClinicalAlertDto>(`/provider/clinical/patients/${petId}/alerts/${alertId}/resolve`, { method: "POST", body: { petId } }),
};

/** The owner's read of the same rows — a separate object so no consumer screen can reach a provider-only route by accident. */
export const clinicalOwnerService = {
  listVitals: (petId: string) => apiFetch<PatientVitalsDto[]>(`/pets/${petId}/clinical/vitals`),
  getVitalsTrends: (petId: string) => apiFetch<VitalsTrendsDto>(`/pets/${petId}/clinical/vitals/trends`),
  listProblems: (petId: string) => apiFetch<ClinicalProblemDto[]>(`/pets/${petId}/clinical/problems`),
  listPrescriptions: (petId: string) => apiFetch<PrescriptionDto[]>(`/pets/${petId}/clinical/prescriptions`),
  listEstimates: (petId: string) => apiFetch<ClinicalEstimateDto[]>(`/pets/${petId}/clinical/estimates`),
  approveEstimate: (petId: string, estimateId: string) => apiFetch<ClinicalEstimateDto>(`/pets/${petId}/clinical/estimates/${estimateId}/approve`, { method: "POST", body: {} }),
  declineEstimate: (petId: string, estimateId: string, declineReason?: string) =>
    apiFetch<ClinicalEstimateDto>(`/pets/${petId}/clinical/estimates/${estimateId}/decline`, { method: "POST", body: { declineReason } }),
  listDischargeSummaries: (petId: string) => apiFetch<DischargeSummaryDto[]>(`/pets/${petId}/clinical/discharge-summaries`),
};
