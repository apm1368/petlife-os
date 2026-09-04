import type {
  CarePlan,
  CarePlanItem,
  ClinicalNutritionPlan,
  ClinicalVisit,
  ClinicalVisitRevision,
  DentalRecord,
  EndOfLifeCarePlan,
  ImagingStudy,
  LabResult,
  MedicalDocument,
  MedicalRecordCorrection,
  PetObservation,
  Referral,
  RehabPlan,
  RehabSession,
  SeniorCareNote,
} from "@prisma/client";
import type {
  CarePlanDto,
  CarePlanItemDto,
  ClinicalActorRefDto,
  ClinicalNutritionPlanDto,
  ClinicalVisitDetailDto,
  ClinicalVisitDto,
  ClinicalVisitRevisionDto,
  DentalRecordDto,
  EndOfLifeCarePlanDto,
  ImagingStudyDto,
  LabResultDto,
  MedicalDocumentDto,
  MedicalRecordCorrectionDto,
  PetObservationDto,
  ReferralDto,
  RehabPlanDto,
  RehabSessionDto,
  SeniorCareNoteDto,
} from "@petlife/types";

/** A provider org/user pair as commonly joined alongside a clinical row — matches the include shape every service below uses. */
type ProviderActorJoin = {
  sourceProviderOrganizationId?: string | null;
  sourceProviderOrganization?: { id: string; name: string } | null;
  sourceProviderUserId?: string | null;
  sourceProviderUser?: { id: string; displayTitle: string | null } | null;
  sourceUserId?: string | null;
};

export function toClinicalActorRefDto(row: ProviderActorJoin): ClinicalActorRefDto {
  return {
    providerOrganizationId: row.sourceProviderOrganization?.id ?? row.sourceProviderOrganizationId ?? null,
    providerOrganizationName: row.sourceProviderOrganization?.name ?? null,
    providerUserId: row.sourceProviderUser?.id ?? row.sourceProviderUserId ?? null,
    providerUserDisplayTitle: row.sourceProviderUser?.displayTitle ?? null,
    userId: row.sourceUserId ?? null,
  };
}

export const MEDICAL_DOCUMENT_INCLUDE = {
  sourceProviderOrganization: { select: { id: true, name: true } },
  sourceProviderUser: { select: { id: true, displayTitle: true } },
} as const;

export function toMedicalDocumentDto(row: MedicalDocument & { sourceProviderOrganization?: { id: string; name: string } | null; sourceProviderUser?: { id: string; displayTitle: string | null } | null }): MedicalDocumentDto {
  return {
    id: row.id,
    petId: row.petId,
    householdId: row.householdId,
    documentType: row.documentType as unknown as MedicalDocumentDto["documentType"],
    title: row.title,
    description: row.description,
    sourceType: row.sourceType as unknown as MedicalDocumentDto["sourceType"],
    source: toClinicalActorRefDto(row),
    recordedAt: row.recordedAt?.toISOString() ?? null,
    uploadedAt: row.uploadedAt.toISOString(),
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    visibility: row.visibility as unknown as MedicalDocumentDto["visibility"],
    verificationStatus: row.verificationStatus as unknown as MedicalDocumentDto["verificationStatus"],
    relatedVisitId: row.relatedVisitId,
    relatedLabResultId: row.relatedLabResultId,
    relatedImagingStudyId: row.relatedImagingStudyId,
    relatedReferralId: row.relatedReferralId,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedReason: row.voidedReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMedicalRecordCorrectionDto(row: MedicalRecordCorrection): MedicalRecordCorrectionDto {
  return {
    id: row.id,
    petId: row.petId,
    targetType: row.targetType as unknown as MedicalRecordCorrectionDto["targetType"],
    targetId: row.targetId,
    correctionText: row.correctionText,
    createdByUserId: row.createdByUserId,
    status: row.status as unknown as MedicalRecordCorrectionDto["status"],
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedNote: row.resolvedNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const LAB_RESULT_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  recordedByProviderUser: { select: { id: true, displayTitle: true } },
} as const;

type LabResultRow = LabResult & { providerOrganization?: { id: string; name: string } | null; recordedByProviderUser?: { id: string; displayTitle: string | null } | null };

export function toLabResultDto(row: LabResultRow): LabResultDto {
  return {
    id: row.id,
    petId: row.petId,
    source: toClinicalActorRefDto({
      sourceProviderOrganizationId: row.providerOrganizationId,
      sourceProviderOrganization: row.providerOrganization,
      sourceProviderUserId: row.recordedByProviderUserId,
      sourceProviderUser: row.recordedByProviderUser,
    }),
    clinicalVisitId: row.clinicalVisitId,
    testName: row.testName,
    testCode: row.testCode,
    sampleDate: row.sampleDate?.toISOString() ?? null,
    resultDate: row.resultDate?.toISOString() ?? null,
    value: row.value,
    unit: row.unit,
    referenceRangeLow: row.referenceRangeLow ? Number(row.referenceRangeLow) : null,
    referenceRangeHigh: row.referenceRangeHigh ? Number(row.referenceRangeHigh) : null,
    qualitativeResult: row.qualitativeResult,
    status: row.status as unknown as LabResultDto["status"],
    flag: row.flag as unknown as LabResultDto["flag"],
    sourceType: row.sourceType as unknown as LabResultDto["sourceType"],
    notes: row.notes,
    supersedesId: row.supersedesId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const IMAGING_STUDY_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  performedByProviderUser: { select: { id: true, displayTitle: true } },
} as const;

type ImagingStudyRow = ImagingStudy & { providerOrganization?: { id: string; name: string } | null; performedByProviderUser?: { id: string; displayTitle: string | null } | null };

export function toImagingStudyDto(row: ImagingStudyRow): ImagingStudyDto {
  return {
    id: row.id,
    petId: row.petId,
    source: toClinicalActorRefDto({
      sourceProviderOrganizationId: row.providerOrganizationId,
      sourceProviderOrganization: row.providerOrganization,
      sourceProviderUserId: row.performedByProviderUserId,
      sourceProviderUser: row.performedByProviderUser,
    }),
    clinicalVisitId: row.clinicalVisitId,
    studyType: row.studyType as unknown as ImagingStudyDto["studyType"],
    bodyRegion: row.bodyRegion,
    performedAt: row.performedAt?.toISOString() ?? null,
    report: row.report,
    findings: row.findings,
    recommendation: row.recommendation,
    sourceType: row.sourceType as unknown as ImagingStudyDto["sourceType"],
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedReason: row.voidedReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const REFERRAL_INCLUDE = {
  fromProviderOrganization: { select: { id: true, name: true } },
  toProviderOrganization: { select: { id: true, name: true } },
} as const;

type ReferralRow = Referral & { fromProviderOrganization: { id: string; name: string }; toProviderOrganization?: { id: string; name: string } | null };

export function toReferralDto(row: ReferralRow): ReferralDto {
  return {
    id: row.id,
    petId: row.petId,
    fromProviderOrganizationId: row.fromProviderOrganizationId,
    fromProviderOrganizationName: row.fromProviderOrganization.name,
    fromProviderUserId: row.fromProviderUserId,
    toProviderOrganizationId: row.toProviderOrganizationId,
    toProviderOrganizationName: row.toProviderOrganization?.name ?? null,
    externalProviderName: row.externalProviderName,
    externalSpecialty: row.externalSpecialty,
    reason: row.reason,
    notes: row.notes,
    status: row.status as unknown as ReferralDto["status"],
    clinicalVisitId: row.clinicalVisitId,
    fulfillingBookingId: row.fulfillingBookingId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

export const DENTAL_RECORD_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  providerUser: { select: { id: true, displayTitle: true } },
} as const;

type DentalRecordRow = DentalRecord & { providerOrganization?: { id: string; name: string } | null; providerUser?: { id: string; displayTitle: string | null } | null };

export function toDentalRecordDto(row: DentalRecordRow): DentalRecordDto {
  return {
    id: row.id,
    petId: row.petId,
    source: toClinicalActorRefDto({
      sourceProviderOrganizationId: row.providerOrganizationId,
      sourceProviderOrganization: row.providerOrganization,
      sourceProviderUserId: row.providerUserId,
      sourceProviderUser: row.providerUser,
    }),
    clinicalVisitId: row.clinicalVisitId,
    recordType: row.recordType as unknown as DentalRecordDto["recordType"],
    performedAt: row.performedAt?.toISOString() ?? null,
    findings: row.findings,
    notes: row.notes,
    followUpRecommended: row.followUpRecommended,
    followUpNotes: row.followUpNotes,
    sourceType: row.sourceType as unknown as DentalRecordDto["sourceType"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const CLINICAL_NUTRITION_PLAN_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  providerUser: { select: { id: true, displayTitle: true } },
} as const;

type ClinicalNutritionPlanRow = ClinicalNutritionPlan & { providerOrganization: { id: string; name: string }; providerUser?: { id: string; displayTitle: string | null } | null };

export function toClinicalNutritionPlanDto(row: ClinicalNutritionPlanRow): ClinicalNutritionPlanDto {
  return {
    id: row.id,
    petId: row.petId,
    source: toClinicalActorRefDto({
      sourceProviderOrganizationId: row.providerOrganizationId,
      sourceProviderOrganization: row.providerOrganization,
      sourceProviderUserId: row.providerUserId,
      sourceProviderUser: row.providerUser,
    }),
    clinicalVisitId: row.clinicalVisitId,
    goal: row.goal,
    dietType: row.dietType as unknown as ClinicalNutritionPlanDto["dietType"],
    recommendedFoodText: row.recommendedFoodText,
    dailyAmountText: row.dailyAmountText,
    frequencyText: row.frequencyText,
    restrictionsText: row.restrictionsText,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    status: row.status as unknown as ClinicalNutritionPlanDto["status"],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const REHAB_PLAN_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  providerUser: { select: { id: true, displayTitle: true } },
  sessions: { orderBy: { sessionDate: "desc" as const } },
} as const;

type RehabPlanRow = RehabPlan & { providerOrganization: { id: string; name: string }; providerUser?: { id: string; displayTitle: string | null } | null; sessions: RehabSession[] };

export function toRehabSessionDto(row: RehabSession): RehabSessionDto {
  return {
    id: row.id,
    rehabPlanId: row.rehabPlanId,
    sessionDate: row.sessionDate.toISOString(),
    observation: row.observation,
    progressNotes: row.progressNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRehabPlanDto(row: RehabPlanRow): RehabPlanDto {
  return {
    id: row.id,
    petId: row.petId,
    source: toClinicalActorRefDto({
      sourceProviderOrganizationId: row.providerOrganizationId,
      sourceProviderOrganization: row.providerOrganization,
      sourceProviderUserId: row.providerUserId,
      sourceProviderUser: row.providerUser,
    }),
    clinicalVisitId: row.clinicalVisitId,
    goal: row.goal,
    exercisesText: row.exercisesText,
    frequencyText: row.frequencyText,
    durationText: row.durationText,
    status: row.status as unknown as RehabPlanDto["status"],
    sessions: row.sessions.map(toRehabSessionDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPetObservationDto(row: PetObservation): PetObservationDto {
  return {
    id: row.id,
    petId: row.petId,
    category: row.category as unknown as PetObservationDto["category"],
    description: row.description,
    observedAt: row.observedAt.toISOString(),
    mediaType: row.mediaType as unknown as PetObservationDto["mediaType"],
    hasMedia: row.mediaObjectKey !== null,
    sourceType: row.sourceType as unknown as PetObservationDto["sourceType"],
    recordedByUserId: row.recordedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toClinicalVisitRevisionDto(row: ClinicalVisitRevision): ClinicalVisitRevisionDto {
  return {
    id: row.id,
    revisionNumber: row.revisionNumber,
    snapshotStatus: row.snapshotStatus as unknown as ClinicalVisitRevisionDto["snapshotStatus"],
    snapshotReasonForVisit: row.snapshotReasonForVisit,
    snapshotHistoryText: row.snapshotHistoryText,
    snapshotObservationsText: row.snapshotObservationsText,
    snapshotAssessmentText: row.snapshotAssessmentText,
    snapshotPlanText: row.snapshotPlanText,
    amendedByProviderUserId: row.amendedByProviderUserId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export const CLINICAL_VISIT_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  providerUser: { select: { id: true, displayTitle: true } },
} as const;

type ClinicalVisitRow = ClinicalVisit & { providerOrganization: { id: string; name: string }; providerUser: { id: string; displayTitle: string | null } };

export function toClinicalVisitDto(row: ClinicalVisitRow): ClinicalVisitDto {
  return {
    id: row.id,
    petId: row.petId,
    householdId: row.householdId,
    bookingId: row.bookingId,
    providerOrganizationId: row.providerOrganizationId,
    providerOrganizationName: row.providerOrganization.name,
    providerUserId: row.providerUserId,
    providerUserDisplayTitle: row.providerUser.displayTitle,
    reasonForVisit: row.reasonForVisit,
    historyText: row.historyText,
    observationsText: row.observationsText,
    assessmentText: row.assessmentText,
    planText: row.planText,
    status: row.status as unknown as ClinicalVisitDto["status"],
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toClinicalVisitDetailDto(row: ClinicalVisitRow & { revisions: ClinicalVisitRevision[] }): ClinicalVisitDetailDto {
  return { ...toClinicalVisitDto(row), revisions: row.revisions.map(toClinicalVisitRevisionDto) };
}

export const CARE_PLAN_INCLUDE = {
  providerOrganization: { select: { id: true, name: true } },
  providerUser: { select: { id: true, displayTitle: true } },
  items: { orderBy: { createdAt: "asc" as const } },
} as const;

type CarePlanRow = CarePlan & { providerOrganization: { id: string; name: string }; providerUser?: { id: string; displayTitle: string | null } | null; items: CarePlanItem[] };

export function toCarePlanItemDto(row: CarePlanItem): CarePlanItemDto {
  return {
    id: row.id,
    carePlanId: row.carePlanId,
    type: row.type as unknown as CarePlanItemDto["type"],
    title: row.title,
    detail: row.detail,
    status: row.status as unknown as CarePlanItemDto["status"],
    source: row.source as unknown as CarePlanItemDto["source"],
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCarePlanDto(row: CarePlanRow): CarePlanDto {
  return {
    id: row.id,
    petId: row.petId,
    source: toClinicalActorRefDto({
      sourceProviderOrganizationId: row.providerOrganizationId,
      sourceProviderOrganization: row.providerOrganization,
      sourceProviderUserId: row.providerUserId,
      sourceProviderUser: row.providerUser,
    }),
    originatingVisitId: row.originatingVisitId,
    title: row.title,
    status: row.status as unknown as CarePlanDto["status"],
    notes: row.notes,
    items: row.items.map(toCarePlanItemDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSeniorCareNoteDto(row: SeniorCareNote): SeniorCareNoteDto {
  return {
    id: row.id,
    petId: row.petId,
    mobilityNotes: row.mobilityNotes,
    cognitionNotes: row.cognitionNotes,
    medicationComplexityNotes: row.medicationComplexityNotes,
    monitoringFrequencyText: row.monitoringFrequencyText,
    qualityOfLifeNotes: row.qualityOfLifeNotes,
    sourceType: row.sourceType as unknown as SeniorCareNoteDto["sourceType"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toEndOfLifeCarePlanDto(row: EndOfLifeCarePlan): EndOfLifeCarePlanDto {
  return {
    petId: row.petId,
    palliativeCareNotes: row.palliativeCareNotes,
    endOfLifePreferences: row.endOfLifePreferences,
    aftercarePreferences: row.aftercarePreferences,
    sourceType: row.sourceType as unknown as EndOfLifeCarePlanDto["sourceType"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
