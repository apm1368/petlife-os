import type {
  ClinicalEstimate,
  ClinicalEstimateLine,
  ClinicalNoteTemplate,
  ClinicalProblem,
  DischargeSummary,
  Hospitalization,
  PatientVitalsRecord,
  Prescription,
  ProviderClinicalAlert,
  TreatmentTask,
} from "@prisma/client";
import type {
  ClinicalEstimateDto,
  ClinicalEstimateLineDto,
  ClinicalNoteTemplateDto,
  ClinicalProblemDto,
  DischargeSummaryDto,
  HospitalizationDto,
  PatientVitalsDto,
  PrescriptionDto,
  ProviderClinicalAlertDto,
  TreatmentTaskDto,
} from "@petlife/types";
import { toClinicalActorRefDto } from "../clinical-health/clinical-health-mapper";

/**
 * Every Handoff 24 row is provider-authored, so each DTO resolves the same
 * ClinicalActorRefDto provenance shape Handoff 17 established rather than
 * inventing a second "who wrote this" representation. `Decimal` columns are
 * converted with Number() at the boundary exactly as the H17 mappers do —
 * never sent as a Prisma Decimal instance, which serialises unpredictably.
 */

type ProviderJoin = { providerOrganizationId: string; providerOrganization?: { id: string; name: string } | null; providerUserId?: string | null; providerUser?: { id: string; displayTitle: string | null } | null };

function actorOf(row: ProviderJoin) {
  return toClinicalActorRefDto({
    sourceProviderOrganizationId: row.providerOrganizationId,
    sourceProviderOrganization: row.providerOrganization,
    sourceProviderUserId: row.providerUserId,
    sourceProviderUser: row.providerUser,
  });
}

export const PROVIDER_ACTOR_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  providerUser: { select: { id: true, displayTitle: true } },
} as const;

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

type VitalsRow = PatientVitalsRecord & { providerOrganization?: { id: string; name: string } | null; providerUser?: { id: string; displayTitle: string | null } | null };

export function toPatientVitalsDto(row: VitalsRow): PatientVitalsDto {
  return {
    id: row.id,
    petId: row.petId,
    clinicalVisitId: row.clinicalVisitId,
    hospitalizationId: row.hospitalizationId,
    recordedAt: row.recordedAt.toISOString(),
    weightValue: row.weightValue === null ? null : Number(row.weightValue),
    weightUnit: row.weightUnit as unknown as PatientVitalsDto["weightUnit"],
    temperatureC: row.temperatureC === null ? null : Number(row.temperatureC),
    heartRateBpm: row.heartRateBpm,
    respiratoryRateBpm: row.respiratoryRateBpm,
    capillaryRefillSeconds: row.capillaryRefillSeconds === null ? null : Number(row.capillaryRefillSeconds),
    systolicBloodPressure: row.systolicBloodPressure,
    oxygenSaturationPercent: row.oxygenSaturationPercent,
    bloodGlucoseMgDl: row.bloodGlucoseMgDl,
    mucousMembraneColor: row.mucousMembraneColor as unknown as PatientVitalsDto["mucousMembraneColor"],
    hydrationStatus: row.hydrationStatus as unknown as PatientVitalsDto["hydrationStatus"],
    bodyConditionScore: row.bodyConditionScore,
    bodyConditionScale: row.bodyConditionScale,
    painScore: row.painScore,
    painScale: row.painScale,
    triageLevel: row.triageLevel as unknown as PatientVitalsDto["triageLevel"],
    notes: row.notes,
    sourceType: row.sourceType as unknown as PatientVitalsDto["sourceType"],
    source: actorOf(row),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Problem list
// ---------------------------------------------------------------------------

type ProblemRow = ClinicalProblem & { providerOrganization?: { id: string; name: string } | null; providerUser?: { id: string; displayTitle: string | null } | null };

export function toClinicalProblemDto(row: ProblemRow): ClinicalProblemDto {
  return {
    id: row.id,
    petId: row.petId,
    source: actorOf(row),
    originatingVisitId: row.originatingVisitId,
    name: row.name,
    bodySystem: row.bodySystem,
    status: row.status as unknown as ClinicalProblemDto["status"],
    onsetAt: row.onsetAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

type PrescriptionRow = Prescription & { providerOrganization?: { id: string; name: string } | null; providerUser?: { id: string; displayTitle: string | null } | null };

/**
 * `audience` decides whether `internalNotes` is present at all. A provider's
 * working note on a prescription is not owner-facing content, so the consumer
 * read omits the key entirely rather than sending null — the same reason
 * ProviderClinicalAlert has no consumer DTO at all.
 */
export function toPrescriptionDto(row: PrescriptionRow, audience: "PROVIDER" | "OWNER" = "PROVIDER"): PrescriptionDto {
  const base: PrescriptionDto = {
    id: row.id,
    petId: row.petId,
    source: actorOf(row),
    clinicalVisitId: row.clinicalVisitId,
    medicationId: row.medicationId,
    drugName: row.drugName,
    strength: row.strength,
    form: row.form,
    route: row.route as unknown as PrescriptionDto["route"],
    doseAmount: row.doseAmount === null ? null : Number(row.doseAmount),
    doseUnit: row.doseUnit,
    frequencyText: row.frequencyText,
    durationDays: row.durationDays,
    quantityDispensed: row.quantityDispensed === null ? null : Number(row.quantityDispensed),
    quantityUnit: row.quantityUnit,
    refillsAuthorized: row.refillsAuthorized,
    refillsDispensed: row.refillsDispensed,
    isControlledSubstance: row.isControlledSubstance,
    instructionsForOwner: row.instructionsForOwner,
    status: row.status as unknown as PrescriptionDto["status"],
    prescribedAt: row.prescribedAt.toISOString(),
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledReason: row.cancelledReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (audience === "PROVIDER") base.internalNotes = row.internalNotes;
  return base;
}

// ---------------------------------------------------------------------------
// Hospitalization + treatment sheet
// ---------------------------------------------------------------------------

type HospitalizationRow = Hospitalization & { pet?: { id: string; name: string; species: string } | null; attendingProviderUser?: { id: string; displayTitle: string | null } | null };

export const HOSPITALIZATION_INCLUDE = {
  pet: { select: { id: true, name: true, species: true } },
  attendingProviderUser: { select: { id: true, displayTitle: true } },
} as const;

export function toHospitalizationDto(row: HospitalizationRow): HospitalizationDto {
  return {
    id: row.id,
    petId: row.petId,
    petName: row.pet?.name ?? "",
    species: (row.pet?.species ?? "DOG") as unknown as HospitalizationDto["species"],
    providerOrganizationId: row.providerOrganizationId,
    attendingProviderUserId: row.attendingProviderUserId,
    attendingProviderDisplayTitle: row.attendingProviderUser?.displayTitle ?? null,
    clinicalVisitId: row.clinicalVisitId,
    status: row.status as unknown as HospitalizationDto["status"],
    reasonForAdmission: row.reasonForAdmission,
    kennelLabel: row.kennelLabel,
    triageLevel: row.triageLevel as unknown as HospitalizationDto["triageLevel"],
    admittedAt: row.admittedAt.toISOString(),
    estimatedDischargeAt: row.estimatedDischargeAt?.toISOString() ?? null,
    dischargedAt: row.dischargedAt?.toISOString() ?? null,
    dischargeNote: row.dischargeNote,
    cancelledReason: row.cancelledReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `isOverdue` is computed at read time and never stored. A task that nobody
 * actioned stays SCHEDULED — only a human decides whether it was MISSED (it
 * should have happened) or SKIPPED (a clinician decided against it), which is
 * why no timer ever writes either value.
 */
export function toTreatmentTaskDto(row: TreatmentTask, now: Date = new Date()): TreatmentTaskDto {
  return {
    id: row.id,
    hospitalizationId: row.hospitalizationId,
    type: row.type as unknown as TreatmentTaskDto["type"],
    title: row.title,
    detail: row.detail,
    prescriptionId: row.prescriptionId,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status as unknown as TreatmentTaskDto["status"],
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByProviderUserId: row.completedByProviderUserId,
    outcomeNote: row.outcomeNote,
    isOverdue: row.status === "SCHEDULED" && row.scheduledAt.getTime() < now.getTime(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

type EstimateRow = ClinicalEstimate & { lines: ClinicalEstimateLine[]; providerOrganization?: { id: string; name: string } | null; providerUser?: { id: string; displayTitle: string | null } | null };

export const ESTIMATE_INCLUDE = {
  ...PROVIDER_ACTOR_INCLUDE,
  lines: { orderBy: { sortOrder: "asc" as const } },
} as const;

export function toClinicalEstimateLineDto(row: ClinicalEstimateLine): ClinicalEstimateLineDto {
  return {
    id: row.id,
    description: row.description,
    quantity: Number(row.quantity),
    unitLowIrr: Number(row.unitLowIrr),
    unitHighIrr: Number(row.unitHighIrr),
    sortOrder: row.sortOrder,
  };
}

export function toClinicalEstimateDto(row: EstimateRow): ClinicalEstimateDto {
  return {
    id: row.id,
    petId: row.petId,
    householdId: row.householdId,
    source: actorOf(row),
    clinicalVisitId: row.clinicalVisitId,
    title: row.title,
    status: row.status as unknown as ClinicalEstimateDto["status"],
    notes: row.notes,
    lowTotalIrr: Number(row.lowTotalIrr),
    highTotalIrr: Number(row.highTotalIrr),
    validUntil: row.validUntil?.toISOString() ?? null,
    presentedAt: row.presentedAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    declineReason: row.declineReason,
    lines: row.lines.map(toClinicalEstimateLineDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Note templates, discharge summaries, alerts
// ---------------------------------------------------------------------------

export function toClinicalNoteTemplateDto(row: ClinicalNoteTemplate): ClinicalNoteTemplateDto {
  return {
    id: row.id,
    providerOrganizationId: row.providerOrganizationId,
    name: row.name,
    presentingComplaint: row.presentingComplaint,
    species: row.species as unknown as ClinicalNoteTemplateDto["species"],
    reasonForVisitTemplate: row.reasonForVisitTemplate,
    historyTemplate: row.historyTemplate,
    observationsTemplate: row.observationsTemplate,
    assessmentTemplate: row.assessmentTemplate,
    planTemplate: row.planTemplate,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type DischargeRow = DischargeSummary & { providerOrganization?: { id: string; name: string } | null };

export function toDischargeSummaryDto(row: DischargeRow): DischargeSummaryDto {
  return {
    id: row.id,
    clinicalVisitId: row.clinicalVisitId,
    petId: row.petId,
    providerOrganizationId: row.providerOrganizationId,
    providerOrganizationName: row.providerOrganization?.name ?? "",
    status: row.status as unknown as DischargeSummaryDto["status"],
    summaryText: row.summaryText,
    homeCareInstructions: row.homeCareInstructions,
    medicationsSummary: row.medicationsSummary,
    warningSignsText: row.warningSignsText,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    followUpInstructions: row.followUpInstructions,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProviderClinicalAlertDto(row: ProviderClinicalAlert): ProviderClinicalAlertDto {
  return {
    id: row.id,
    petId: row.petId,
    providerOrganizationId: row.providerOrganizationId,
    type: row.type as unknown as ProviderClinicalAlertDto["type"],
    severity: row.severity as unknown as ProviderClinicalAlertDto["severity"],
    message: row.message,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
