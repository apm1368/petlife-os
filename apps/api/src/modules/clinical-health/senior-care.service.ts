import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { SeniorCareNoteDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toSeniorCareNoteDto } from "./clinical-health-mapper";
import type { CreateSeniorCareNoteDto } from "./dto/senior-care.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/** Foundation only (spec: no scoring engine) — append-only free-text notes, authorable by owner or provider. */
@Injectable()
export class SeniorCareService {
  constructor(private readonly prisma: PrismaService) {}

  async addNote(petId: string, dto: CreateSeniorCareNoteDto, actor: { userId?: string; provider?: ResolvedProviderContext }): Promise<SeniorCareNoteDto> {
    const created = await this.prisma.seniorCareNote.create({
      data: {
        petId,
        mobilityNotes: dto.mobilityNotes,
        cognitionNotes: dto.cognitionNotes,
        medicationComplexityNotes: dto.medicationComplexityNotes,
        monitoringFrequencyText: dto.monitoringFrequencyText,
        qualityOfLifeNotes: dto.qualityOfLifeNotes,
        sourceType: actor.provider ? SourceType.PROVIDER : SourceType.OWNER,
        recordedByUserId: actor.userId,
        providerOrganizationId: actor.provider?.organizationId,
      },
    });
    return toSeniorCareNoteDto(created);
  }

  async list(petId: string): Promise<SeniorCareNoteDto[]> {
    const rows = await this.prisma.seniorCareNote.findMany({ where: { petId }, orderBy: { createdAt: "desc" } });
    return rows.map(toSeniorCareNoteDto);
  }
}
