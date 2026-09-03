import { Injectable } from "@nestjs/common";
import { AllergyStatus, ClinicalVisitStatus, ConditionStatus, DocumentVisibility, MedicationStatus, SourceType } from "@prisma/client";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CARE_PLAN_INCLUDE, CLINICAL_VISIT_INCLUDE, LAB_RESULT_INCLUDE, MEDICAL_DOCUMENT_INCLUDE, toCarePlanDto, toClinicalVisitDto, toLabResultDto, toMedicalDocumentDto } from "./clinical-health-mapper";

/**
 * spec: "Provider view should show only data they are authorized to
 * access... at minimum: pet identity, relevant care profile, allergies,
 * medications, known conditions, recent visits, relevant labs, imaging,
 * documents, owner observations where shared, care plan." Authorization
 * itself is enforced by the controller's PetAccessGuard(canViewHealth)
 * before this ever runs — this service only shapes the provider-specific
 * DTO, distinct from the consumer's own read surface (spec: "Consumer DTO
 * != Provider clinical DTO").  Documents are filtered to PROVIDER_SHARED
 * visibility — an owner's HOUSEHOLD_ONLY upload never reaches a provider
 * through this view.
 */
@Injectable()
export class ProviderClinicalPatientService {
  constructor(private readonly prisma: PrismaService) {}

  async get(petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const [careProfile, allergies, medications, conditions, visits, labs, documents, carePlans] = await Promise.all([
      this.prisma.careProfile.findUnique({ where: { petId } }),
      this.prisma.allergy.findMany({ where: { petId, status: AllergyStatus.ACTIVE } }),
      this.prisma.medication.findMany({ where: { petId, status: MedicationStatus.ACTIVE } }),
      this.prisma.condition.findMany({ where: { petId, status: ConditionStatus.ACTIVE } }),
      this.prisma.clinicalVisit.findMany({ where: { petId, status: { in: [ClinicalVisitStatus.COMPLETED, ClinicalVisitStatus.AMENDED] } }, include: CLINICAL_VISIT_INCLUDE, orderBy: { startedAt: "desc" }, take: 10 }),
      this.prisma.labResult.findMany({ where: { petId }, include: LAB_RESULT_INCLUDE, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.medicalDocument.findMany({
        where: { petId, voidedAt: null, OR: [{ visibility: DocumentVisibility.PROVIDER_SHARED }, { sourceType: SourceType.PROVIDER }] },
        include: MEDICAL_DOCUMENT_INCLUDE,
        orderBy: { uploadedAt: "desc" },
        take: 10,
      }),
      this.prisma.carePlan.findMany({ where: { petId }, include: CARE_PLAN_INCLUDE, orderBy: { createdAt: "desc" } }),
    ]);

    return {
      pet: { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, birthDate: pet.birthDate?.toISOString() ?? null },
      careProfile: careProfile
        ? { temperamentText: careProfile.temperamentText, handlingSensitivityText: careProfile.handlingSensitivityText, specialInstructionsText: careProfile.specialInstructionsText }
        : null,
      allergies: allergies.map((a) => ({ id: a.id, name: a.name, severity: a.severity })),
      medications: medications.map((m) => ({ id: m.id, name: m.name, dosage: m.dosage ? Number(m.dosage) : null, unit: m.unit, frequencyText: m.frequencyText })),
      conditions: conditions.map((c) => ({ id: c.id, name: c.name, notes: c.notes })),
      recentVisits: visits.map(toClinicalVisitDto),
      recentLabs: labs.map(toLabResultDto),
      documents: documents.map(toMedicalDocumentDto),
      carePlans: carePlans.map(toCarePlanDto),
    };
  }
}
