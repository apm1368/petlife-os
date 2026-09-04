import { Injectable } from "@nestjs/common";
import { MedicalDocumentType, VaccinationStatus } from "@prisma/client";
import type { PetPassportReadinessDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";

/** Never READY-by-omission — the same statuses TravelRequirement treats as "not settled yet" also count as missing here. */
const VACCINATION_MISSING_STATUSES: VaccinationStatus[] = [VaccinationStatus.UNKNOWN, VaccinationStatus.INCOMPLETE, VaccinationStatus.OVERDUE];

/**
 * Not a government passport object — a live aggregation of pet identity and
 * existing H17 health data plus travel-specific document counts. Never
 * duplicates H17 health records (spec: "reference existing health data");
 * every field here is read fresh from Pet/VaccinationSummary/MedicalDocument,
 * never copied into a parallel store.
 */
@Injectable()
export class PetPassportReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadiness(petId: string): Promise<PetPassportReadinessDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const [vaccinationSummary, healthDocumentsCount, travelDocumentsCount] = await Promise.all([
      this.prisma.vaccinationSummary.findUnique({ where: { petId } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null, documentType: { not: MedicalDocumentType.TRAVEL_DOCUMENT } } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null, documentType: MedicalDocumentType.TRAVEL_DOCUMENT } }),
    ]);

    const vaccinationStatus = vaccinationSummary?.status ?? VaccinationStatus.UNKNOWN;

    const missingItems: string[] = [];
    if (!pet.microchipNumber) missingItems.push("MICROCHIP_NUMBER");
    if (VACCINATION_MISSING_STATUSES.includes(vaccinationStatus)) missingItems.push("VACCINATION_STATUS");
    if (healthDocumentsCount === 0) missingItems.push("HEALTH_DOCUMENTS");
    if (travelDocumentsCount === 0) missingItems.push("TRAVEL_DOCUMENTS");

    return {
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species as unknown as PetPassportReadinessDto["petSpecies"],
      petPhotoUrl: pet.photoUrl,
      microchipNumber: pet.microchipNumber,
      vaccinationStatus: vaccinationStatus as unknown as PetPassportReadinessDto["vaccinationStatus"],
      healthDocumentsCount,
      travelDocumentsCount,
      missingItems,
    };
  }
}
