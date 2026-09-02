import { Injectable } from "@nestjs/common";
import { type Prisma, ProviderVerificationStatus, SellerStatus, SellerVerificationStatus, TrustActionType, TrustCaseStatus, TrustSubjectType } from "@prisma/client";
import type { AppealDto, TrustActionDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AppealAlreadyExistsException, AppealNotFoundException, TrustActionNotFoundException, TrustCaseNotFoundException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { toAppealDto, toTrustActionDto } from "./trust.mapper";
import type { ResolveAppealDto, SubmitAppealDto, TakeTrustActionDto } from "./dto/trust.dto";

const APPEAL_INCLUDE = { reviewerAdmin: { include: { user: true } } } as const;
const ACTION_INCLUDE = { performedByAdmin: { include: { user: true } }, appeal: { include: APPEAL_INCLUDE } } as const;

/**
 * Applies the actual operational effect a TrustAction describes (spec: "do
 * not blindly hard-delete business/user records; prefer explicit
 * operational states") — never a DELETE, only a status field update on the
 * subject's own existing model. Only PROVIDER and SELLER subjects have an
 * operational status field to move today; USER/HOUSEHOLD/LISTING/REVIEW/
 * COMMUNITY_CONTENT/PET_INCIDENT subjects record the TrustAction (and thus
 * the audit trail) but have no enforcement field yet on their own models —
 * see README "Known limitations". ProviderOrganization has only
 * `verificationStatus` (no separate operational-status field the way
 * SellerOrganization has both `status` and `verificationStatus`), so a
 * provider SUSPEND/RESTORE necessarily moves that one field.
 */
function operationalUpdateFor(subjectType: TrustSubjectType, actionType: TrustActionType): { providerUpdate?: Prisma.ProviderOrganizationUpdateInput; sellerUpdate?: Prisma.SellerOrganizationUpdateInput } {
  if (subjectType === TrustSubjectType.PROVIDER) {
    if (actionType === TrustActionType.SUSPEND) return { providerUpdate: { verificationStatus: ProviderVerificationStatus.SUSPENDED } };
    if (actionType === TrustActionType.RESTORE) return { providerUpdate: { verificationStatus: ProviderVerificationStatus.VERIFIED } };
    if (actionType === TrustActionType.REQUIRE_REVERIFICATION) return { providerUpdate: { verificationStatus: ProviderVerificationStatus.UNDER_REVIEW } };
  }
  if (subjectType === TrustSubjectType.SELLER) {
    if (actionType === TrustActionType.SUSPEND) return { sellerUpdate: { status: SellerStatus.SUSPENDED } };
    if (actionType === TrustActionType.RESTRICT) return { sellerUpdate: { status: SellerStatus.RESTRICTED } };
    if (actionType === TrustActionType.RESTORE) return { sellerUpdate: { status: SellerStatus.ACTIVE } };
    if (actionType === TrustActionType.REQUIRE_REVERIFICATION) return { sellerUpdate: { verificationStatus: SellerVerificationStatus.UNDER_REVIEW } };
  }
  return {};
}

@Injectable()
export class TrustActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async take(admin: ResolvedAdminContext, trustCaseId: string, dto: TakeTrustActionDto, requestId?: string): Promise<TrustActionDto> {
    const action = await this.prisma.$transaction(async (tx) => {
      const trustCase = await tx.trustCase.findUnique({ where: { id: trustCaseId } });
      if (!trustCase) throw new TrustCaseNotFoundException({ trustCaseId });

      const created = await tx.trustAction.create({
        data: { trustCaseId, actionType: dto.actionType, reason: dto.reason, performedByAdminId: admin.adminUserId },
        include: ACTION_INCLUDE,
      });

      const { providerUpdate, sellerUpdate } = operationalUpdateFor(trustCase.subjectType, dto.actionType);
      if (providerUpdate) await tx.providerOrganization.update({ where: { id: trustCase.subjectId }, data: providerUpdate });
      if (sellerUpdate) await tx.sellerOrganization.update({ where: { id: trustCase.subjectId }, data: sellerUpdate });

      // Taking an action moves the case into review if it was still OPEN —
      // an admin who has already started acting on a case is, by
      // definition, no longer merely waiting to look at it.
      if (trustCase.status === TrustCaseStatus.OPEN) {
        await tx.trustCase.update({ where: { id: trustCaseId }, data: { status: TrustCaseStatus.UNDER_REVIEW } });
      }

      await this.events.publish(
        "TrustActionTaken",
        { trustCaseId, actionId: created.id, actionType: dto.actionType, subjectType: trustCase.subjectType, subjectId: trustCase.subjectId },
        { tx, aggregateType: "TrustCase", aggregateId: trustCaseId },
      );
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "trust_action.taken",
        entityType: "TRUST_CASE",
        entityId: trustCaseId,
        reason: dto.reason,
        afterSummary: { actionType: dto.actionType, operationalEffect: providerUpdate ?? sellerUpdate ?? null },
        requestId,
        tx,
      });

      return created;
    });
    return toTrustActionDto(action);
  }

  async submitAppeal(admin: ResolvedAdminContext, trustActionId: string, dto: SubmitAppealDto, requestId?: string): Promise<AppealDto> {
    const appeal = await this.prisma.$transaction(async (tx) => {
      const action = await tx.trustAction.findUnique({ where: { id: trustActionId }, include: { appeal: true } });
      if (!action) throw new TrustActionNotFoundException({ trustActionId });
      if (action.appeal) throw new AppealAlreadyExistsException({ trustActionId });

      const created = await tx.appeal.create({
        data: { trustActionId, appellantUserId: dto.appellantUserId, reason: dto.reason },
        include: APPEAL_INCLUDE,
      });
      await this.events.publish("AppealSubmitted", { appealId: created.id, trustActionId }, { tx, aggregateType: "Appeal", aggregateId: created.id });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "appeal.submitted", entityType: "TRUST_ACTION", entityId: trustActionId, requestId, tx });
      return created;
    });
    return toAppealDto(appeal);
  }

  async resolveAppeal(admin: ResolvedAdminContext, appealId: string, dto: ResolveAppealDto, requestId?: string): Promise<AppealDto> {
    const appeal = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.appeal.findUnique({ where: { id: appealId } });
      if (!existing) throw new AppealNotFoundException({ appealId });

      const updated = await tx.appeal.update({
        where: { id: appealId },
        data: { status: dto.status, resolution: dto.resolution, reviewerAdminId: admin.adminUserId, resolvedAt: new Date() },
        include: APPEAL_INCLUDE,
      });
      await this.events.publish("AppealResolved", { appealId, status: dto.status }, { tx, aggregateType: "Appeal", aggregateId: appealId });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "appeal.resolved",
        entityType: "TRUST_ACTION",
        entityId: existing.trustActionId,
        afterSummary: { status: dto.status },
        requestId,
        tx,
      });
      return updated;
    });
    return toAppealDto(appeal);
  }
}
