import { Injectable } from "@nestjs/common";
import { SourceType, VaccinationStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HealthProfileService } from "./health-profile.service";
import type { UpdateVaccinationSummaryDto } from "./dto/update-vaccination-summary.dto";

@Injectable()
export class VaccinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthProfile: HealthProfileService,
    private readonly events: DomainEventsService,
  ) {}

  async get(petId: string) {
    const summary = await this.prisma.vaccinationSummary.findUnique({ where: { petId } });
    if (summary) return summary;
    return {
      petId,
      status: VaccinationStatus.INCOMPLETE,
      nextDueDate: null,
      lastKnownDate: null,
      notes: null,
      sourceType: SourceType.OWNER,
      sourceLabel: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  /** PUT semantics: this is always a full replace of the one summary row per pet. */
  async upsert(petId: string, dto: UpdateVaccinationSummaryDto) {
    return this.prisma.$transaction(async (tx) => {
      const summary = await tx.vaccinationSummary.upsert({
        where: { petId },
        update: {
          status: dto.status,
          nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
          lastKnownDate: dto.lastKnownDate ? new Date(dto.lastKnownDate) : null,
          notes: dto.notes,
        },
        create: {
          petId,
          status: dto.status,
          nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
          lastKnownDate: dto.lastKnownDate ? new Date(dto.lastKnownDate) : undefined,
          notes: dto.notes,
        },
      });
      await this.healthProfile.recomputeStatus(petId, tx);
      await this.events.publish(
        "VaccinationSummaryUpdated",
        { petId, status: summary.status },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return summary;
    });
  }
}
