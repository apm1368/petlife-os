import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { ImagingStudyDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ImagingStudyNotFoundException } from "../../common/errors/api-exception";
import { IMAGING_STUDY_INCLUDE, toImagingStudyDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { CreateImagingStudyDto } from "./dto/imaging-study.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/** spec: "do not attempt image diagnosis" — report/findings/recommendation are always free text the provider writes. */
@Injectable()
export class ImagingStudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreateImagingStudyDto): Promise<ImagingStudyDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.imagingStudy.create({
        data: {
          petId: dto.petId,
          providerOrganizationId: ctx.organizationId,
          performedByProviderUserId: ctx.providerUserId,
          clinicalVisitId: dto.clinicalVisitId,
          studyType: dto.studyType as never,
          bodyRegion: dto.bodyRegion,
          performedAt: dto.performedAt ? new Date(dto.performedAt) : undefined,
          report: dto.report,
          findings: dto.findings,
          recommendation: dto.recommendation,
          sourceType: SourceType.PROVIDER,
        },
        include: IMAGING_STUDY_INCLUDE,
      });
      await this.events.publish(
        "ImagingStudyAdded",
        { petId: dto.petId, imagingStudyId: created.id, studyType: created.studyType },
        { tx, aggregateType: "Pet", aggregateId: dto.petId },
      );
      return created;
    });
    return toImagingStudyDto(row);
  }

  async list(petId: string): Promise<ImagingStudyDto[]> {
    const rows = await this.prisma.imagingStudy.findMany({
      where: { petId, voidedAt: null },
      include: IMAGING_STUDY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toImagingStudyDto);
  }

  async get(petId: string, imagingStudyId: string) {
    const row = await this.prisma.imagingStudy.findUnique({ where: { id: imagingStudyId }, include: IMAGING_STUDY_INCLUDE });
    if (!row || row.petId !== petId) throw new ImagingStudyNotFoundException({ imagingStudyId });
    return row;
  }

  async voidStudy(petId: string, imagingStudyId: string, reason: string): Promise<ImagingStudyDto> {
    const existing = await this.get(petId, imagingStudyId);
    const row = await this.prisma.imagingStudy.update({
      where: { id: existing.id },
      data: { voidedAt: new Date(), voidedReason: reason },
      include: IMAGING_STUDY_INCLUDE,
    });
    return toImagingStudyDto(row);
  }
}
