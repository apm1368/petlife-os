import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HealthProfileService } from "./health-profile.service";
import { assertOwnerEditable } from "./provenance.util";
import type { CreateAllergyDto } from "./dto/create-allergy.dto";
import type { UpdateAllergyDto } from "./dto/update-allergy.dto";

@Injectable()
export class AllergiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthProfile: HealthProfileService,
    private readonly events: DomainEventsService,
  ) {}

  list(petId: string) {
    return this.prisma.allergy.findMany({ where: { petId }, orderBy: { recordedAt: "asc" } });
  }

  async create(petId: string, userId: string, dto: CreateAllergyDto) {
    return this.prisma.$transaction(async (tx) => {
      const allergy = await tx.allergy.create({
        data: {
          petId,
          name: dto.name,
          reaction: dto.reaction,
          severity: dto.severity,
          knowledgeState: dto.knowledgeState,
          recordedByUserId: userId,
        },
      });
      await this.healthProfile.recomputeStatus(petId, tx);
      await this.events.publish(
        "AllergyAdded",
        { petId, allergyId: allergy.id },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return allergy;
    });
  }

  async update(petId: string, id: string, dto: UpdateAllergyDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.allergy.findUnique({ where: { id } });
      if (!existing || existing.petId !== petId) throw new NotFoundApiException("Allergy");
      assertOwnerEditable(existing.sourceType);

      const allergy = await tx.allergy.update({ where: { id }, data: dto });
      await this.healthProfile.recomputeStatus(petId, tx);
      await this.events.publish(
        "AllergyUpdated",
        { petId, allergyId: allergy.id },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return allergy;
    });
  }

  async remove(petId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.allergy.findUnique({ where: { id } });
      if (!existing || existing.petId !== petId) throw new NotFoundApiException("Allergy");
      assertOwnerEditable(existing.sourceType);

      await tx.allergy.delete({ where: { id } });
      await this.healthProfile.recomputeStatus(petId, tx);
    });
  }
}
