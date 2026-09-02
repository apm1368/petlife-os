import { Injectable } from "@nestjs/common";
import type { ProviderVerificationStatus, SellerVerificationStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ProviderOrganizationNotFoundException, SellerOrganizationNotFoundException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/**
 * Admin-only overrides for Provider/Seller verification status (spec:
 * "reuse existing ProviderVerificationStatus/SellerVerificationStatus
 * enums with new admin-only PATCH transition endpoints + audit, no new KYC
 * infrastructure"). Deliberately no transition table here — unlike
 * SupportCase/Dispute/TrustCase, this is a manual override capability an
 * authorized admin uses to correct or force a verification state (e.g.
 * after an out-of-band document review), not a lifecycle most callers walk
 * step by step, so any status may move to any other, provided a reason is
 * given (spec: "reason-required for sensitive actions").
 */
@Injectable()
export class AdminVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async transitionProvider(admin: ResolvedAdminContext, providerOrganizationId: string, to: ProviderVerificationStatus, reason: string, requestId?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.providerOrganization.findUnique({ where: { id: providerOrganizationId } });
      if (!existing) throw new ProviderOrganizationNotFoundException({ providerOrganizationId });

      const row = await tx.providerOrganization.update({ where: { id: providerOrganizationId }, data: { verificationStatus: to } });
      await this.events.publish(
        "AdminVerificationStatusChanged",
        { subjectType: "PROVIDER", subjectId: providerOrganizationId, from: existing.verificationStatus, to },
        { tx, aggregateType: "ProviderOrganization", aggregateId: providerOrganizationId },
      );
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "verification.status_changed",
        entityType: "PROVIDER_ORGANIZATION",
        entityId: providerOrganizationId,
        reason,
        beforeSummary: { verificationStatus: existing.verificationStatus },
        afterSummary: { verificationStatus: to },
        requestId,
        tx,
      });
      return row;
    });
    return { id: updated.id, verificationStatus: updated.verificationStatus };
  }

  async transitionSeller(admin: ResolvedAdminContext, sellerOrganizationId: string, to: SellerVerificationStatus, reason: string, requestId?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sellerOrganization.findUnique({ where: { id: sellerOrganizationId } });
      if (!existing) throw new SellerOrganizationNotFoundException({ sellerOrganizationId });

      const row = await tx.sellerOrganization.update({ where: { id: sellerOrganizationId }, data: { verificationStatus: to } });
      await this.events.publish(
        "AdminVerificationStatusChanged",
        { subjectType: "SELLER", subjectId: sellerOrganizationId, from: existing.verificationStatus, to },
        { tx, aggregateType: "SellerOrganization", aggregateId: sellerOrganizationId },
      );
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "verification.status_changed",
        entityType: "SELLER_ORGANIZATION",
        entityId: sellerOrganizationId,
        reason,
        beforeSummary: { verificationStatus: existing.verificationStatus },
        afterSummary: { verificationStatus: to },
        requestId,
        tx,
      });
      return row;
    });
    return { id: updated.id, verificationStatus: updated.verificationStatus };
  }
}
