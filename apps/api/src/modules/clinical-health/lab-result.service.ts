import { Injectable } from "@nestjs/common";
import { LabResultStatus, SourceType } from "@prisma/client";
import type { LabResultDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { LabResultNotFoundException } from "../../common/errors/api-exception";
import { LAB_RESULT_INCLUDE, toLabResultDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { AmendLabResultDto, CreateLabResultDto } from "./dto/lab-result.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

@Injectable()
export class LabResultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreateLabResultDto): Promise<LabResultDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labResult.create({
        data: {
          petId: dto.petId,
          providerOrganizationId: ctx.organizationId,
          recordedByProviderUserId: ctx.providerUserId,
          clinicalVisitId: dto.clinicalVisitId,
          testName: dto.testName,
          testCode: dto.testCode,
          sampleDate: dto.sampleDate ? new Date(dto.sampleDate) : undefined,
          resultDate: dto.resultDate ? new Date(dto.resultDate) : undefined,
          value: dto.value,
          unit: dto.unit,
          referenceRangeLow: dto.referenceRangeLow,
          referenceRangeHigh: dto.referenceRangeHigh,
          qualitativeResult: dto.qualitativeResult,
          status: dto.resultDate ? LabResultStatus.FINAL : LabResultStatus.PENDING,
          flag: dto.flag as never,
          sourceType: SourceType.PROVIDER,
          notes: dto.notes,
        },
        include: LAB_RESULT_INCLUDE,
      });
      await this.events.publish(
        "LabResultAdded",
        { petId: dto.petId, labResultId: created.id, testName: created.testName },
        { tx, aggregateType: "Pet", aggregateId: dto.petId },
      );
      return created;
    });
    return toLabResultDto(row);
  }

  async list(petId: string): Promise<LabResultDto[]> {
    const rows = await this.prisma.labResult.findMany({
      where: { petId, status: { not: LabResultStatus.AMENDED } },
      include: LAB_RESULT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toLabResultDto);
  }

  async get(petId: string, labResultId: string) {
    const row = await this.prisma.labResult.findUnique({ where: { id: labResultId }, include: LAB_RESULT_INCLUDE });
    if (!row || row.petId !== petId) throw new LabResultNotFoundException({ labResultId });
    return row;
  }

  /**
   * Append/supersede, never edit-in-place (locked principle — see the
   * schema.prisma section doc comment): marks the original FINAL row
   * AMENDED and creates a brand-new row pointing back at it via
   * supersedesId. The corrected value is never written over the original.
   */
  async amend(ctx: ResolvedProviderContext, petId: string, labResultId: string, dto: AmendLabResultDto): Promise<LabResultDto> {
    const existing = await this.get(petId, labResultId);
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, petId);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.labResult.update({ where: { id: existing.id }, data: { status: LabResultStatus.AMENDED } });
      const created = await tx.labResult.create({
        data: {
          petId,
          providerOrganizationId: ctx.organizationId,
          recordedByProviderUserId: ctx.providerUserId,
          clinicalVisitId: dto.clinicalVisitId ?? existing.clinicalVisitId,
          testName: dto.testName,
          testCode: dto.testCode,
          sampleDate: dto.sampleDate ? new Date(dto.sampleDate) : undefined,
          resultDate: dto.resultDate ? new Date(dto.resultDate) : undefined,
          value: dto.value,
          unit: dto.unit,
          referenceRangeLow: dto.referenceRangeLow,
          referenceRangeHigh: dto.referenceRangeHigh,
          qualitativeResult: dto.qualitativeResult,
          status: LabResultStatus.FINAL,
          flag: dto.flag as never,
          sourceType: SourceType.PROVIDER,
          notes: dto.notes,
          supersedesId: existing.id,
        },
        include: LAB_RESULT_INCLUDE,
      });
      await this.events.publish(
        "LabResultAmended",
        { petId, labResultId: created.id, supersedesId: existing.id },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return created;
    });
    return toLabResultDto(row);
  }
}
