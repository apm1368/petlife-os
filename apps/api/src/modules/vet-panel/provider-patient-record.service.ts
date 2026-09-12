import { Injectable } from "@nestjs/common";
import { AllergyStatus, ClinicalVisitStatus, ConditionStatus, DocumentVisibility, HouseholdRole, MedicationStatus, SourceType } from "@prisma/client";
import type { ProviderPatientRecordDto } from "@petlife/types";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CARE_PLAN_INCLUDE, CLINICAL_VISIT_INCLUDE, LAB_RESULT_INCLUDE, MEDICAL_DOCUMENT_INCLUDE, toCarePlanDto, toClinicalVisitDto, toLabResultDto, toMedicalDocumentDto } from "../clinical-health/clinical-health-mapper";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { HOSPITALIZATION_INCLUDE, PROVIDER_ACTOR_INCLUDE, ESTIMATE_INCLUDE, toClinicalEstimateDto, toClinicalProblemDto, toHospitalizationDto, toPatientVitalsDto, toPrescriptionDto, toProviderClinicalAlertDto } from "./vet-panel.mapper";

const VITALS_HISTORY_LIMIT = 10;

/**
 * The consulting-room read: one request that answers everything a clinician
 * needs before touching the animal. It supersedes Handoff 17's
 * ProviderClinicalPatientService (kept intact and still serving
 * `GET /provider/patients/:petId` for existing clients) by adding the
 * practice layer this handoff introduces — alerts, problem list, vitals and
 * their history, prescriptions, estimates, and inpatient stays — alongside
 * the owner/contact line a clinic actually needs to phone someone.
 *
 * Authorization is entirely the controller's `PetAccessGuard(canViewHealth)`
 * stacked on `ProviderAuthGuard`, exactly as in Handoff 17: this service
 * shapes a DTO and never decides who may read it. Two things stay filtered by
 * construction regardless: an owner's HOUSEHOLD_ONLY documents never appear,
 * and alerts are scoped to the reading organisation's own rows.
 */
@Injectable()
export class ProviderPatientRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ctx: ResolvedProviderContext, petId: string): Promise<ProviderPatientRecordDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const [ownerMember, careProfile, alerts, allergies, medications, conditions, problems, prescriptions, vitals, visits, labs, documents, carePlans, estimates, hospitalizations] = await Promise.all([
      this.prisma.householdMember.findFirst({
        where: { householdId: pet.householdId, role: HouseholdRole.OWNER },
        include: { user: { select: { displayName: true, phone: true } } },
      }),
      this.prisma.careProfile.findUnique({ where: { petId } }),
      this.prisma.providerClinicalAlert.findMany({ where: { petId, providerOrganizationId: ctx.organizationId, resolvedAt: null }, orderBy: { createdAt: "desc" } }),
      this.prisma.allergy.findMany({ where: { petId, status: AllergyStatus.ACTIVE } }),
      this.prisma.medication.findMany({ where: { petId, status: MedicationStatus.ACTIVE } }),
      this.prisma.condition.findMany({ where: { petId, status: ConditionStatus.ACTIVE } }),
      this.prisma.clinicalProblem.findMany({ where: { petId }, include: PROVIDER_ACTOR_INCLUDE, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
      this.prisma.prescription.findMany({ where: { petId }, include: PROVIDER_ACTOR_INCLUDE, orderBy: { prescribedAt: "desc" }, take: 20 }),
      this.prisma.patientVitalsRecord.findMany({ where: { petId }, include: PROVIDER_ACTOR_INCLUDE, orderBy: { recordedAt: "desc" }, take: VITALS_HISTORY_LIMIT }),
      this.prisma.clinicalVisit.findMany({
        where: { petId, status: { in: [ClinicalVisitStatus.IN_PROGRESS, ClinicalVisitStatus.COMPLETED, ClinicalVisitStatus.AMENDED] } },
        include: CLINICAL_VISIT_INCLUDE,
        orderBy: { startedAt: "desc" },
        take: 10,
      }),
      this.prisma.labResult.findMany({ where: { petId }, include: LAB_RESULT_INCLUDE, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.medicalDocument.findMany({
        where: { petId, voidedAt: null, OR: [{ visibility: DocumentVisibility.PROVIDER_SHARED }, { sourceType: SourceType.PROVIDER }] },
        include: MEDICAL_DOCUMENT_INCLUDE,
        orderBy: { uploadedAt: "desc" },
        take: 10,
      }),
      this.prisma.carePlan.findMany({ where: { petId }, include: CARE_PLAN_INCLUDE, orderBy: { createdAt: "desc" } }),
      this.prisma.clinicalEstimate.findMany({ where: { petId }, include: ESTIMATE_INCLUDE, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.hospitalization.findMany({ where: { petId }, include: HOSPITALIZATION_INCLUDE, orderBy: { admittedAt: "desc" }, take: 10 }),
    ]);

    const vitalsDtos = vitals.map(toPatientVitalsDto);

    return {
      pet: {
        id: pet.id,
        name: pet.name,
        species: pet.species as unknown as ProviderPatientRecordDto["pet"]["species"],
        breed: pet.breed,
        sex: pet.sex as unknown as ProviderPatientRecordDto["pet"]["sex"],
        birthDate: pet.birthDate?.toISOString() ?? null,
        approximateAgeMonths: pet.approximateAgeMonths,
        microchipNumber: pet.microchipNumber,
        lifecycleStatus: pet.lifecycleStatus as unknown as ProviderPatientRecordDto["pet"]["lifecycleStatus"],
        latestWeightValue: pet.latestWeightValue === null ? null : Number(pet.latestWeightValue),
        latestWeightUnit: pet.latestWeightUnit as unknown as ProviderPatientRecordDto["pet"]["latestWeightUnit"],
        photoUrl: pet.photoUrl,
      },
      owner: ownerMember ? { displayName: ownerMember.user.displayName, phone: ownerMember.user.phone } : null,
      careProfile: careProfile
        ? { temperamentText: careProfile.temperamentText, handlingSensitivityText: careProfile.handlingSensitivityText, specialInstructionsText: careProfile.specialInstructionsText }
        : null,
      alerts: alerts.map(toProviderClinicalAlertDto),
      allergies: allergies.map((a) => ({ id: a.id, name: a.name, severity: a.severity })),
      medications: medications.map((m) => ({ id: m.id, name: m.name, dosage: m.dosage === null ? null : Number(m.dosage), unit: m.unit, frequencyText: m.frequencyText })),
      conditions: conditions.map((c) => ({ id: c.id, name: c.name, notes: c.notes })),
      problems: problems.map(toClinicalProblemDto),
      prescriptions: prescriptions.map((p) => toPrescriptionDto(p, "PROVIDER")),
      latestVitals: vitalsDtos[0] ?? null,
      vitalsHistory: vitalsDtos,
      recentVisits: visits.map(toClinicalVisitDto),
      recentLabs: labs.map(toLabResultDto),
      documents: documents.map(toMedicalDocumentDto),
      carePlans: carePlans.map(toCarePlanDto),
      estimates: estimates.map(toClinicalEstimateDto),
      hospitalizations: hospitalizations.map(toHospitalizationDto),
    };
  }
}
