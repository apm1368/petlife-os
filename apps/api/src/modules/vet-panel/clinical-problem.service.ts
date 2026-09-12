import { Injectable } from "@nestjs/common";
import { ClinicalProblemStatus } from "@prisma/client";
import type { ClinicalProblemDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ClinicalProblemNotFoundException, ProviderAccessDeniedException } from "../../common/errors/api-exception";
import { assertVisitBelongsToPet } from "../clinical-health/clinical-link.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { PROVIDER_ACTOR_INCLUDE, toClinicalProblemDto } from "./vet-panel.mapper";
import type { CreateClinicalProblemDto, UpdateClinicalProblemDto } from "./dto/clinical-problem.dto";

/**
 * The master problem list. Unlike a visit note this is a *living index* — a
 * problem legitimately moves ACTIVE → RESOLVED months later — so status is
 * mutable, but a problem is never deleted and never renamed: the only fields
 * a later call can change are `status` and `notes`. Renaming a problem after
 * other records reference it by name would rewrite history silently, which is
 * the thing Handoff 17's append/supersede discipline exists to prevent.
 *
 * Only the authoring organisation may change a problem it raised, mirroring
 * ClinicalVisitService.assertOwningOrganization() exactly — a second clinic
 * with its own access to the pet sees the problem but adds its own rather
 * than editing someone else's clinical judgement.
 */
@Injectable()
export class ClinicalProblemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreateClinicalProblemDto): Promise<ClinicalProblemDto> {
    await assertVisitBelongsToPet(this.prisma, dto.originatingVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalProblem.create({
        data: {
          petId: dto.petId,
          providerOrganizationId: ctx.organizationId,
          providerUserId: ctx.providerUserId,
          originatingVisitId: dto.originatingVisitId ?? null,
          name: dto.name,
          bodySystem: dto.bodySystem ?? null,
          status: dto.status ?? ClinicalProblemStatus.ACTIVE,
          onsetAt: dto.onsetAt ? new Date(dto.onsetAt) : null,
          notes: dto.notes ?? null,
        },
        include: PROVIDER_ACTOR_INCLUDE,
      });
      await this.events.publish("ClinicalProblemRecorded", { petId: dto.petId, problemId: created.id }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return created;
    });

    return toClinicalProblemDto(row);
  }

  async list(petId: string): Promise<ClinicalProblemDto[]> {
    const rows = await this.prisma.clinicalProblem.findMany({
      where: { petId },
      include: PROVIDER_ACTOR_INCLUDE,
      // Live problems first, then by recency — the order a clinician reads them in.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return rows.map(toClinicalProblemDto);
  }

  async update(ctx: ResolvedProviderContext, petId: string, problemId: string, dto: UpdateClinicalProblemDto): Promise<ClinicalProblemDto> {
    const existing = await this.prisma.clinicalProblem.findUnique({ where: { id: problemId } });
    if (!existing || existing.petId !== petId) throw new ClinicalProblemNotFoundException({ problemId });
    if (existing.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "NOT_PROBLEM_AUTHOR" });

    const nextStatus = dto.status ?? existing.status;
    const isClosing = nextStatus === ClinicalProblemStatus.RESOLVED || nextStatus === ClinicalProblemStatus.RULED_OUT;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalProblem.update({
        where: { id: problemId },
        data: {
          status: nextStatus,
          notes: dto.notes ?? existing.notes,
          // Stamped by the service, never accepted from the client; reopening
          // a closed problem clears it so a stale resolution date can't linger.
          resolvedAt: isClosing ? (existing.resolvedAt ?? new Date()) : null,
        },
        include: PROVIDER_ACTOR_INCLUDE,
      });
      if (dto.status && dto.status !== existing.status) {
        await this.events.publish(
          "ClinicalProblemStatusChanged",
          { petId, problemId, from: existing.status, to: dto.status },
          { tx, aggregateType: "Pet", aggregateId: petId },
        );
      }
      return updated;
    });

    return toClinicalProblemDto(row);
  }
}
