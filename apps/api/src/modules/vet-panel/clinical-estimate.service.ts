import { Injectable } from "@nestjs/common";
import { ClinicalEstimateStatus, Prisma } from "@prisma/client";
import type { ClinicalEstimateDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ClinicalEstimateNotFoundException, InvalidClinicalEstimateTransitionException, ProviderAccessDeniedException } from "../../common/errors/api-exception";
import { assertVisitBelongsToPet } from "../clinical-health/clinical-link.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ESTIMATE_INCLUDE, toClinicalEstimateDto } from "./vet-panel.mapper";
import type { ClinicalEstimateLineInputDto, CreateClinicalEstimateDto, RespondToClinicalEstimateDto, UpdateClinicalEstimateDto } from "./dto/estimate.dto";

/**
 * The costed treatment plan an owner approves before work starts.
 *
 * Money rules are the ones Handoff 06/07 locked and this handoff does not
 * relax: integer IRR is the only stored unit, Toman is a display transform,
 * and totals are computed once at write time from the lines and stored as a
 * snapshot — never recomputed differently on a later read. `quantity` is a
 * Decimal, so totals are summed with Prisma.Decimal arithmetic and only then
 * rounded to an integer IRR, rather than through JavaScript floats.
 *
 * Approval belongs to the household, never to the clinic: `respond()` is
 * reachable only from the consumer controller and stamps the responding
 * user's id. A provider has no code path to approve their own estimate.
 */
@Injectable()
export class ClinicalEstimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /** Integer IRR totals from Decimal line arithmetic — rounded once, at the end, never per line. */
  private totals(lines: ClinicalEstimateLineInputDto[]): { lowTotalIrr: bigint; highTotalIrr: bigint } {
    let low = new Prisma.Decimal(0);
    let high = new Prisma.Decimal(0);
    for (const line of lines) {
      const quantity = new Prisma.Decimal(line.quantity ?? 1);
      low = low.plus(quantity.times(line.unitLowIrr));
      high = high.plus(quantity.times(line.unitHighIrr));
    }
    return { lowTotalIrr: BigInt(low.toFixed(0)), highTotalIrr: BigInt(high.toFixed(0)) };
  }

  async create(ctx: ResolvedProviderContext, dto: CreateClinicalEstimateDto): Promise<ClinicalEstimateDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: dto.petId }, select: { householdId: true } });
    const { lowTotalIrr, highTotalIrr } = this.totals(dto.lines);

    const row = await this.prisma.clinicalEstimate.create({
      data: {
        petId: dto.petId,
        householdId: pet.householdId,
        providerOrganizationId: ctx.organizationId,
        providerUserId: ctx.providerUserId,
        clinicalVisitId: dto.clinicalVisitId ?? null,
        title: dto.title,
        notes: dto.notes ?? null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        lowTotalIrr,
        highTotalIrr,
        lines: {
          create: dto.lines.map((line, index) => ({
            description: line.description,
            quantity: line.quantity ?? 1,
            unitLowIrr: BigInt(line.unitLowIrr),
            unitHighIrr: BigInt(line.unitHighIrr),
            sortOrder: index,
          })),
        },
      },
      include: ESTIMATE_INCLUDE,
    });

    return toClinicalEstimateDto(row);
  }

  async listForPet(petId: string): Promise<ClinicalEstimateDto[]> {
    const rows = await this.prisma.clinicalEstimate.findMany({ where: { petId }, include: ESTIMATE_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toClinicalEstimateDto);
  }

  private async getForOrg(ctx: ResolvedProviderContext, petId: string, estimateId: string) {
    const row = await this.prisma.clinicalEstimate.findUnique({ where: { id: estimateId } });
    if (!row || row.petId !== petId) throw new ClinicalEstimateNotFoundException({ estimateId });
    if (row.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "NOT_ESTIMATE_AUTHOR" });
    return row;
  }

  /** A DRAFT is a working document; once PRESENTED the owner is looking at it and the numbers stop moving. */
  async update(ctx: ResolvedProviderContext, estimateId: string, dto: UpdateClinicalEstimateDto): Promise<ClinicalEstimateDto> {
    const existing = await this.getForOrg(ctx, dto.petId, estimateId);
    if (existing.status !== ClinicalEstimateStatus.DRAFT) {
      throw new InvalidClinicalEstimateTransitionException({ estimateId, status: existing.status, action: "update" });
    }

    const totals = dto.lines ? this.totals(dto.lines) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.clinicalEstimateLine.deleteMany({ where: { estimateId } });
        await tx.clinicalEstimateLine.createMany({
          data: dto.lines.map((line, index) => ({
            estimateId,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity ?? 1),
            unitLowIrr: BigInt(line.unitLowIrr),
            unitHighIrr: BigInt(line.unitHighIrr),
            sortOrder: index,
          })),
        });
      }
      return tx.clinicalEstimate.update({
        where: { id: estimateId },
        data: {
          title: dto.title ?? existing.title,
          notes: dto.notes ?? existing.notes,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : existing.validUntil,
          ...(totals ?? {}),
        },
        include: ESTIMATE_INCLUDE,
      });
    });

    return toClinicalEstimateDto(row);
  }

  async present(ctx: ResolvedProviderContext, petId: string, estimateId: string): Promise<ClinicalEstimateDto> {
    const existing = await this.getForOrg(ctx, petId, estimateId);
    if (existing.status !== ClinicalEstimateStatus.DRAFT) {
      throw new InvalidClinicalEstimateTransitionException({ estimateId, status: existing.status, action: "present" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.clinicalEstimate.updateMany({
        where: { id: estimateId, status: ClinicalEstimateStatus.DRAFT },
        data: { status: ClinicalEstimateStatus.PRESENTED, presentedAt: new Date() },
      });
      if (claimed.count === 0) throw new InvalidClinicalEstimateTransitionException({ estimateId, status: existing.status, action: "present" });
      await this.events.publish("ClinicalEstimatePresented", { petId, estimateId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return tx.clinicalEstimate.findUniqueOrThrow({ where: { id: estimateId }, include: ESTIMATE_INCLUDE });
    });

    return toClinicalEstimateDto(row);
  }

  /**
   * The owner's decision. Only ever called from the consumer controller,
   * where PetAccessGuard has already established the caller's relationship to
   * the pet — a provider token cannot reach this method at all. Claimed
   * atomically so a double-tap cannot record two different answers.
   */
  async respond(userId: string, petId: string, estimateId: string, approve: boolean, dto: RespondToClinicalEstimateDto): Promise<ClinicalEstimateDto> {
    const existing = await this.prisma.clinicalEstimate.findUnique({ where: { id: estimateId } });
    if (!existing || existing.petId !== petId) throw new ClinicalEstimateNotFoundException({ estimateId });
    if (existing.status !== ClinicalEstimateStatus.PRESENTED) {
      throw new InvalidClinicalEstimateTransitionException({ estimateId, status: existing.status, action: approve ? "approve" : "decline" });
    }
    if (existing.validUntil && existing.validUntil.getTime() < Date.now()) {
      throw new InvalidClinicalEstimateTransitionException({ estimateId, reason: "EXPIRED", validUntil: existing.validUntil.toISOString() });
    }

    const nextStatus = approve ? ClinicalEstimateStatus.APPROVED : ClinicalEstimateStatus.DECLINED;

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.clinicalEstimate.updateMany({
        where: { id: estimateId, status: ClinicalEstimateStatus.PRESENTED },
        data: { status: nextStatus, respondedAt: new Date(), respondedByUserId: userId, declineReason: approve ? null : (dto.declineReason ?? null) },
      });
      if (claimed.count === 0) throw new InvalidClinicalEstimateTransitionException({ estimateId, status: existing.status, action: approve ? "approve" : "decline" });
      await this.events.publish("ClinicalEstimateResponded", { petId, estimateId, status: nextStatus }, { tx, aggregateType: "Pet", aggregateId: petId });
      return tx.clinicalEstimate.findUniqueOrThrow({ where: { id: estimateId }, include: ESTIMATE_INCLUDE });
    });

    return toClinicalEstimateDto(row);
  }
}
