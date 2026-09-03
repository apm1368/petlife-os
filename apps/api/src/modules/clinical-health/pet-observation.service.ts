import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { PetObservationDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { EntitlementService } from "../subscriptions/entitlement.service";
import { StorageService } from "../storage/storage.service";
import type { UploadTarget } from "../storage/storage-driver.interface";
import { toPetObservationDto } from "./clinical-health-mapper";
import type { CreatePetObservationDto, RequestObservationMediaUploadDto } from "./dto/pet-observation.dto";

/**
 * OWNER OBSERVATIONS, never diagnoses (locked principle) — the service layer
 * never infers a condition/severity from an observation, and there is no
 * code path that converts one into a Condition/Allergy row automatically.
 */
@Injectable()
export class PetObservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
    private readonly entitlements: EntitlementService,
  ) {}

  async requestMediaUpload(petId: string, dto: RequestObservationMediaUploadDto): Promise<UploadTarget & { key: string }> {
    return this.storage.createObservationMediaUploadTarget(petId, dto.contentType, dto.fileSizeBytes);
  }

  async create(petId: string, userId: string, dto: CreatePetObservationDto): Promise<PetObservationDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");
    await this.entitlements.assertWithinLimit(pet.householdId, "health.observations.max");

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.petObservation.create({
        data: {
          petId,
          category: dto.category as never,
          description: dto.description,
          observedAt: new Date(dto.observedAt),
          mediaType: dto.mediaType as never,
          mediaObjectKey: dto.mediaKey,
          mediaMimeType: dto.mediaMimeType,
          sourceType: SourceType.OWNER,
          recordedByUserId: userId,
        },
      });
      await this.events.publish(
        "PetObservationAdded",
        { petId, observationId: created.id, category: created.category },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return created;
    });
    return toPetObservationDto(row);
  }

  async list(petId: string): Promise<PetObservationDto[]> {
    const rows = await this.prisma.petObservation.findMany({ where: { petId }, orderBy: { observedAt: "desc" } });
    return rows.map(toPetObservationDto);
  }

  async getDownload(petId: string, observationId: string) {
    const row = await this.prisma.petObservation.findUnique({ where: { id: observationId } });
    if (!row || row.petId !== petId || !row.mediaObjectKey) return null;
    return this.storage.createPrivateDownloadTarget(row.mediaObjectKey);
  }
}
