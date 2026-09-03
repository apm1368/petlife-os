import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, SellerMembershipRole, SellerMembershipStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

/**
 * Settlement notifications (spec: "reuse H10... never direct SMS, avoid
 * noisy per-ledger-line messages") — exactly one notification per
 * settlement lifecycle transition (ready/paid/failed), fanned out to every
 * ACTIVE OWNER/ADMIN of the seller, mirroring
 * NotificationEventsListener.notifySellerAdmins exactly. Never fires per
 * order, refund, or adjustment line — those feed a settlement silently
 * until the settlement itself transitions.
 *
 * Marketplace reconciliation findings deliberately have no notification
 * here (spec: "reconciliation issue" is an internal/admin concern — sellers
 * never see marketplace statements) — the admin reconciliation queue
 * (GET /admin/marketplace-reconciliation) is the alerting surface, the same
 * "the queryable state itself is the ops signal" precedent H08 established.
 */
@Injectable()
export class SellerFinanceNotificationListener {
  private readonly logger = new Logger(SellerFinanceNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: NotificationOrchestratorService,
  ) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private async notifySellerAdmins(sellerOrganizationId: string, type: string, entityId: string, deepLink: string, templateParams: Record<string, string | number>, domainEventId: string): Promise<void> {
    const admins = await this.prisma.sellerMembership.findMany({
      where: { sellerOrganizationId, status: SellerMembershipStatus.ACTIVE, role: { in: [SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN] } },
      select: { userId: true },
    });
    for (const admin of admins) {
      await this.orchestrator.notify({
        userId: admin.userId,
        type,
        category: NotificationCategory.SELLER,
        sellerOrganizationId,
        templateParams,
        deepLink,
        entityType: "SellerSettlement",
        entityId,
        domainEventId,
      });
    }
  }

  @OnEvent("SellerSettlementCalculated")
  onCalculated(payload: { settlementId: string; sellerOrganizationId: string; reference: string }, domainEventId: string): Promise<void> {
    return this.safely("SellerSettlementCalculated", () =>
      this.notifySellerAdmins(payload.sellerOrganizationId, "settlement.ready", payload.settlementId, NotificationDeepLinks.sellerSettlementDetail(payload.settlementId), { reference: payload.reference }, domainEventId),
    );
  }

  @OnEvent("SellerSettlementPaid")
  onPaid(payload: { settlementId: string; sellerOrganizationId: string; reference: string }, domainEventId: string): Promise<void> {
    return this.safely("SellerSettlementPaid", () =>
      this.notifySellerAdmins(payload.sellerOrganizationId, "settlement.paid", payload.settlementId, NotificationDeepLinks.sellerSettlementDetail(payload.settlementId), { reference: payload.reference }, domainEventId),
    );
  }

  @OnEvent("SellerSettlementFailed")
  onFailed(payload: { settlementId: string; sellerOrganizationId: string; reference: string }, domainEventId: string): Promise<void> {
    return this.safely("SellerSettlementFailed", () =>
      this.notifySellerAdmins(payload.sellerOrganizationId, "settlement.failed", payload.settlementId, NotificationDeepLinks.sellerSettlementDetail(payload.settlementId), { reference: payload.reference }, domainEventId),
    );
  }
}
