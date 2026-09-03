import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { DentalRecordDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DENTAL_RECORD_INCLUDE, toDentalRecordDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { CreateDentalRecordDto } from "./dto/dental-record.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/** No dedicated domain event — dental records surface in the Health Timeline via a direct read (see HealthTimelineService), keeping the event registry free of "overly granular noise" per spec. */
@Injectable()
export class DentalRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: ResolvedProviderContext, dto: CreateDentalRecordDto): Promise<DentalRecordDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const created = await this.prisma.dentalRecord.create({
      data: {
        petId: dto.petId,
        providerOrganizationId: ctx.organizationId,
        providerUserId: ctx.providerUserId,
        clinicalVisitId: dto.clinicalVisitId,
        recordType: dto.recordType as never,
        performedAt: dto.performedAt ? new Date(dto.performedAt) : undefined,
        findings: dto.findings,
        notes: dto.notes,
        followUpRecommended: dto.followUpRecommended ?? false,
        followUpNotes: dto.followUpNotes,
        sourceType: SourceType.PROVIDER,
      },
      include: DENTAL_RECORD_INCLUDE,
    });
    return toDentalRecordDto(created);
  }

  async list(petId: string): Promise<DentalRecordDto[]> {
    const rows = await this.prisma.dentalRecord.findMany({ where: { petId }, include: DENTAL_RECORD_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toDentalRecordDto);
  }
}
