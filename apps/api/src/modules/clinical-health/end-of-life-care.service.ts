import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { EndOfLifeCarePlanDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { assertOwnerEditable } from "../health/provenance.util";
import { toEndOfLifeCarePlanDto } from "./clinical-health-mapper";
import type { UpsertEndOfLifeCarePlanDto } from "./dto/end-of-life.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/**
 * spec: "Do not trigger memorial lifecycle automatically... Pet lifecycle
 * transitions remain explicit." This service never reads or writes
 * Pet.lifecycleStatus — it is a purely informational planning record.
 */
@Injectable()
export class EndOfLifeCareService {
  constructor(private readonly prisma: PrismaService, private readonly events: DomainEventsService) {}

  async get(petId: string): Promise<EndOfLifeCarePlanDto | null> {
    const row = await this.prisma.endOfLifeCarePlan.findUnique({ where: { petId } });
    return row ? toEndOfLifeCarePlanDto(row) : null;
  }

  /**
   * Household path (canEditHealth) and, when a provider context is passed, the clinic's own path. Provenance
   * (Handoff 17): a PROVIDER/CLINIC-sourced plan is never overwritten from the household side — the family
   * files a MedicalRecordCorrection instead. The original author, source and organisation never change on
   * update; every write is recorded as a domain event with its actor.
   */
  async upsert(petId: string, dto: UpsertEndOfLifeCarePlanDto, actor: { userId?: string; provider?: ResolvedProviderContext }): Promise<EndOfLifeCarePlanDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.endOfLifeCarePlan.findUnique({ where: { petId } });
      if (existing && !actor.provider) assertOwnerEditable(existing.sourceType);
      const saved = existing
        ? await tx.endOfLifeCarePlan.update({
            where: { petId },
            data: {
              palliativeCareNotes: dto.palliativeCareNotes,
              endOfLifePreferences: dto.endOfLifePreferences,
              aftercarePreferences: dto.aftercarePreferences,
            },
          })
        : await tx.endOfLifeCarePlan.create({
            data: {
              petId,
              palliativeCareNotes: dto.palliativeCareNotes,
              endOfLifePreferences: dto.endOfLifePreferences,
              aftercarePreferences: dto.aftercarePreferences,
              sourceType: actor.provider ? SourceType.PROVIDER : SourceType.OWNER,
              recordedByUserId: actor.userId,
              providerOrganizationId: actor.provider?.organizationId,
            },
          });
      await this.events.publish(
        "EndOfLifeCarePlanSaved",
        { petId, planId: saved.id, created: !existing, sourceType: saved.sourceType, actorUserId: actor.userId ?? actor.provider?.userId ?? null },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return saved;
    });
    return toEndOfLifeCarePlanDto(row);
  }
}
