import { Injectable } from "@nestjs/common";
import { ReferralStatus } from "@prisma/client";
import type { ReferralDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { InvalidReferralTransitionException, ReferralNotFoundException, ValidationApiException } from "../../common/errors/api-exception";
import { REFERRAL_INCLUDE, toReferralDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { CreateReferralDto } from "./dto/referral.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/** spec: "Keep Referral state separate from Booking state" — this state machine never reads or writes Booking.bookingStatus. */
const ALLOWED_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  [ReferralStatus.CREATED]: [ReferralStatus.SENT, ReferralStatus.CANCELLED],
  [ReferralStatus.SENT]: [ReferralStatus.ACCEPTED, ReferralStatus.CANCELLED],
  [ReferralStatus.ACCEPTED]: [ReferralStatus.SCHEDULED, ReferralStatus.CANCELLED],
  [ReferralStatus.SCHEDULED]: [ReferralStatus.COMPLETED, ReferralStatus.CANCELLED],
  [ReferralStatus.COMPLETED]: [],
  [ReferralStatus.CANCELLED]: [],
};

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreateReferralDto): Promise<ReferralDto> {
    if (!dto.toProviderOrganizationId && !dto.externalProviderName) {
      throw new ValidationApiException({ field: "toProviderOrganizationId|externalProviderName", reason: "Either an in-system destination or external provider name is required" });
    }
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.referral.create({
        data: {
          petId: dto.petId,
          fromProviderOrganizationId: ctx.organizationId,
          fromProviderUserId: ctx.providerUserId,
          toProviderOrganizationId: dto.toProviderOrganizationId,
          externalProviderName: dto.toProviderOrganizationId ? undefined : dto.externalProviderName,
          externalSpecialty: dto.externalSpecialty,
          reason: dto.reason,
          notes: dto.notes,
          clinicalVisitId: dto.clinicalVisitId,
        },
        include: REFERRAL_INCLUDE,
      });
      await this.events.publish(
        "ReferralCreated",
        { petId: dto.petId, referralId: created.id, toProviderOrganizationId: created.toProviderOrganizationId },
        { tx, aggregateType: "Pet", aggregateId: dto.petId },
      );
      return created;
    });
    return toReferralDto(row);
  }

  async list(petId: string): Promise<ReferralDto[]> {
    const rows = await this.prisma.referral.findMany({ where: { petId }, include: REFERRAL_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toReferralDto);
  }

  async get(petId: string, referralId: string) {
    const row = await this.prisma.referral.findUnique({ where: { id: referralId }, include: REFERRAL_INCLUDE });
    if (!row || row.petId !== petId) throw new ReferralNotFoundException({ referralId });
    return row;
  }

  async updateStatus(petId: string, referralId: string, nextStatus: ReferralStatus): Promise<ReferralDto> {
    const existing = await this.get(petId, referralId);
    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed.includes(nextStatus)) {
      throw new InvalidReferralTransitionException({ referralId, from: existing.status, to: nextStatus });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.referral.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          completedAt: nextStatus === ReferralStatus.COMPLETED ? new Date() : existing.completedAt,
          cancelledAt: nextStatus === ReferralStatus.CANCELLED ? new Date() : existing.cancelledAt,
        },
        include: REFERRAL_INCLUDE,
      });
      await this.events.publish(
        nextStatus === ReferralStatus.COMPLETED ? "ReferralCompleted" : "ReferralStatusChanged",
        { petId, referralId, from: existing.status, to: nextStatus },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return updated;
    });
    return toReferralDto(row);
  }
}
