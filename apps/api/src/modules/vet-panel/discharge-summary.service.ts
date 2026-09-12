import { Injectable } from "@nestjs/common";
import { DischargeSummaryStatus } from "@prisma/client";
import type { DischargeSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  ClinicalVisitNotFoundException,
  DischargeSummaryAlreadyIssuedException,
  DischargeSummaryNotFoundException,
  ProviderAccessDeniedException,
} from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { toDischargeSummaryDto } from "./vet-panel.mapper";
import type { UpsertDischargeSummaryDto } from "./dto/discharge-summary.dto";

const DISCHARGE_INCLUDE = { providerOrganization: { select: { id: true, name: true } } } as const;

/**
 * The one clinical artefact that leaves the building. It is a draft the vet
 * can rework freely, and then — once ISSUED — immutable, because the owner
 * has read it and may be acting on it at home. Correcting an issued summary
 * is an explicit clinical act (amend the visit, issue a new summary), never a
 * silent rewrite of a document already in someone's hands. This is Handoff
 * 17's completed-record rule applied where it matters most.
 */
@Injectable()
export class DischargeSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async getForVisit(petId: string, visitId: string): Promise<DischargeSummaryDto | null> {
    const row = await this.prisma.dischargeSummary.findUnique({ where: { clinicalVisitId: visitId }, include: DISCHARGE_INCLUDE });
    if (!row) return null;
    if (row.petId !== petId) throw new DischargeSummaryNotFoundException({ visitId });
    return toDischargeSummaryDto(row);
  }

  async upsertDraft(ctx: ResolvedProviderContext, petId: string, visitId: string, dto: UpsertDischargeSummaryDto): Promise<DischargeSummaryDto> {
    const visit = await this.prisma.clinicalVisit.findUnique({ where: { id: visitId } });
    if (!visit || visit.petId !== petId) throw new ClinicalVisitNotFoundException({ visitId });
    if (visit.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "NOT_VISIT_OWNER" });

    const existing = await this.prisma.dischargeSummary.findUnique({ where: { clinicalVisitId: visitId } });
    if (existing?.status === DischargeSummaryStatus.ISSUED) throw new DischargeSummaryAlreadyIssuedException({ visitId });

    const data = {
      summaryText: dto.summaryText ?? null,
      homeCareInstructions: dto.homeCareInstructions ?? null,
      medicationsSummary: dto.medicationsSummary ?? null,
      warningSignsText: dto.warningSignsText ?? null,
      followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
      followUpInstructions: dto.followUpInstructions ?? null,
    };

    const row = await this.prisma.dischargeSummary.upsert({
      where: { clinicalVisitId: visitId },
      create: { clinicalVisitId: visitId, petId, providerOrganizationId: ctx.organizationId, ...data },
      update: data,
      include: DISCHARGE_INCLUDE,
    });
    return toDischargeSummaryDto(row);
  }

  /** Claim-then-check so two simultaneous issues cannot both stamp an issuer. */
  async issue(ctx: ResolvedProviderContext, petId: string, visitId: string): Promise<DischargeSummaryDto> {
    const existing = await this.prisma.dischargeSummary.findUnique({ where: { clinicalVisitId: visitId } });
    if (!existing || existing.petId !== petId) throw new DischargeSummaryNotFoundException({ visitId });
    if (existing.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "NOT_VISIT_OWNER" });
    if (existing.status === DischargeSummaryStatus.ISSUED) throw new DischargeSummaryAlreadyIssuedException({ visitId });

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.dischargeSummary.updateMany({
        where: { id: existing.id, status: DischargeSummaryStatus.DRAFT },
        data: { status: DischargeSummaryStatus.ISSUED, issuedAt: new Date(), issuedByProviderUserId: ctx.providerUserId },
      });
      if (claimed.count === 0) throw new DischargeSummaryAlreadyIssuedException({ visitId });
      await this.events.publish("DischargeSummaryIssued", { petId, visitId, dischargeSummaryId: existing.id }, { tx, aggregateType: "Pet", aggregateId: petId });
      return tx.dischargeSummary.findUniqueOrThrow({ where: { id: existing.id }, include: DISCHARGE_INCLUDE });
    });

    return toDischargeSummaryDto(row);
  }

  async listForPet(petId: string): Promise<DischargeSummaryDto[]> {
    const rows = await this.prisma.dischargeSummary.findMany({
      // Only issued summaries are owner-facing — a draft is the clinic's working copy.
      where: { petId, status: DischargeSummaryStatus.ISSUED },
      include: DISCHARGE_INCLUDE,
      orderBy: { issuedAt: "desc" },
    });
    return rows.map(toDischargeSummaryDto);
  }
}
