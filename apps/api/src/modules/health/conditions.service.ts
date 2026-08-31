import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HealthProfileService } from "./health-profile.service";
import type { CreateConditionDto } from "./dto/create-condition.dto";
import type { UpdateConditionDto } from "./dto/update-condition.dto";

@Injectable()
export class ConditionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthProfile: HealthProfileService,
    private readonly events: DomainEventsService,
  ) {}

  list(petId: string) {
    return this.prisma.condition.findMany({ where: { petId }, orderBy: { createdAt: "asc" } });
  }

  async create(petId: string, userId: string, dto: CreateConditionDto) {
    return this.prisma.$transaction(async (tx) => {
      const condition = await tx.condition.create({
        data: {
          petId,
          name: dto.name,
          status: dto.status,
          notes: dto.notes,
          firstRecordedAt: dto.firstRecordedAt ? new Date(dto.firstRecordedAt) : undefined,
          recordedByUserId: userId,
        },
      });
      await this.healthProfile.recomputeStatus(petId, tx);
      await this.events.publish(
        "ConditionAdded",
        { petId, conditionId: condition.id },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return condition;
    });
  }

  async update(petId: string, id: string, dto: UpdateConditionDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.condition.findUnique({ where: { id } });
      if (!existing || existing.petId !== petId) throw new NotFoundApiException("Condition");

      const condition = await tx.condition.update({
        where: { id },
        data: {
          ...dto,
          firstRecordedAt:
            dto.firstRecordedAt === undefined ? undefined : dto.firstRecordedAt ? new Date(dto.firstRecordedAt) : null,
        },
      });
      await this.healthProfile.recomputeStatus(petId, tx);
      return condition;
    });
  }
}
