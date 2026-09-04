import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { EndOfLifeCarePlanDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
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
  constructor(private readonly prisma: PrismaService) {}

  async get(petId: string): Promise<EndOfLifeCarePlanDto | null> {
    const row = await this.prisma.endOfLifeCarePlan.findUnique({ where: { petId } });
    return row ? toEndOfLifeCarePlanDto(row) : null;
  }

  async upsert(petId: string, dto: UpsertEndOfLifeCarePlanDto, actor: { userId?: string; provider?: ResolvedProviderContext }): Promise<EndOfLifeCarePlanDto> {
    const row = await this.prisma.endOfLifeCarePlan.upsert({
      where: { petId },
      create: {
        petId,
        palliativeCareNotes: dto.palliativeCareNotes,
        endOfLifePreferences: dto.endOfLifePreferences,
        aftercarePreferences: dto.aftercarePreferences,
        sourceType: actor.provider ? SourceType.PROVIDER : SourceType.OWNER,
        recordedByUserId: actor.userId,
        providerOrganizationId: actor.provider?.organizationId,
      },
      update: {
        palliativeCareNotes: dto.palliativeCareNotes,
        endOfLifePreferences: dto.endOfLifePreferences,
        aftercarePreferences: dto.aftercarePreferences,
      },
    });
    return toEndOfLifeCarePlanDto(row);
  }
}
