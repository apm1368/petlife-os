import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DonationStatus, RefundStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { DonationLedgerService } from "./donation-ledger.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { DonationInsufficientFundBalanceException, DonationNotFoundException } from "../../common/errors/api-exception";
import { toDonationFundBalanceDto } from "./animal-support-mapper";
import type { RecordDonationPayoutDto } from "./dto/animal-support.dto";

const CURRENCY = "IRR";

/**
 * Admin-only money-movement half of the donation domain — refund and
 * payout. Split from the consumer-facing DonationService exactly the way
 * AnimalSupportOrganizationService/PublicAnimalSupportReadService are
 * split: this depends on AdminAuditLogService, so it lives directly in
 * AdminModule, never imported by (or importing) the public/consumer side.
 */
@Injectable()
export class AdminDonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly donationLedger: DonationLedgerService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
  ) {}

  /**
   * spec: "Every donation financial movement must be auditable... support
   * refund if supported." Reverses BOTH ledgers exactly the way
   * SubscriptionBillingService.refundBillingAttempt reverses the
   * subscription-revenue posting alongside LedgerService.recordRefundSucceeded
   * — never one without the other.
   */
  async refundDonation(admin: ResolvedAdminContext, donationIntentId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "donation_intents" WHERE "id" = ${donationIntentId}::uuid FOR UPDATE`;
      if (!locked) throw new DonationNotFoundException({ donationIntentId });

      const intent = await tx.donationIntent.findUniqueOrThrow({ where: { id: donationIntentId }, include: { transaction: true } });
      if (intent.status !== DonationStatus.SUCCEEDED || !intent.transaction) throw new DonationNotFoundException({ donationIntentId, reason: "NOT_REFUNDABLE" });
      if (intent.transaction.refundedAt) throw new DonationNotFoundException({ donationIntentId, reason: "ALREADY_REFUNDED" });

      const paymentIntent = await tx.paymentIntent.findFirst({ where: { checkoutId: intent.checkoutId }, orderBy: { createdAt: "desc" } });
      await tx.refund.create({
        data: {
          paymentIntentId: paymentIntent?.id ?? null,
          amount: intent.amountIrr,
          currency: CURRENCY,
          status: RefundStatus.SUCCEEDED,
          reason,
          requestedByAdminUserId: admin.adminUserId,
          completedAt: new Date(),
        },
      });

      await this.ledger.recordDonationRefunded(intent.id, intent.amountIrr, CURRENCY, tx);
      await this.donationLedger.recordRefund(intent.transaction.organizationId, intent.transaction.id, intent.amountIrr, intent.fundType, CURRENCY, tx);

      await tx.donationTransaction.update({ where: { id: intent.transaction.id }, data: { refundedAt: new Date() } });
      await tx.donationIntent.update({ where: { id: intent.id }, data: { status: DonationStatus.REFUNDED, refundedAt: new Date() } });

      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "donation.refunded",
        entityType: "DonationIntent",
        entityId: intent.id,
        reason,
        afterSummary: { amountIrr: intent.amountIrr },
        tx,
      });
      await this.events.publish("DonationRefunded", { donationIntentId: intent.id, campaignId: intent.campaignId, amountIrr: intent.amountIrr }, { tx, aggregateType: "SupportCampaign", aggregateId: intent.campaignId });
    });
  }

  /**
   * spec: "support payout... no hidden fund movement." Checks the
   * fund-specific available balance BEFORE posting — the enforcement point
   * for "restricted donations must remain restricted."
   */
  async recordPayout(admin: ResolvedAdminContext, organizationId: string, dto: RecordDonationPayoutDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const available = await this.donationLedger.getAvailableForFund(organizationId, dto.fundType, tx);
      if (dto.amountIrr > available) throw new DonationInsufficientFundBalanceException({ organizationId, fundType: dto.fundType, requestedIrr: dto.amountIrr, availableIrr: available });

      const payoutReferenceId = randomUUID();
      await this.donationLedger.recordPayout(organizationId, payoutReferenceId, dto.amountIrr, dto.fundType, CURRENCY, tx);
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "donation.payout_recorded",
        entityType: "AnimalSupportOrganization",
        entityId: organizationId,
        reason: dto.reason,
        afterSummary: { amountIrr: dto.amountIrr, fundType: dto.fundType, payoutReferenceId },
        tx,
      });
    });
  }

  async getFundBalance(organizationId: string) {
    const balance = await this.donationLedger.getBalance(organizationId);
    return toDonationFundBalanceDto(organizationId, balance.generalAvailableIrr, balance.restrictedAvailableIrr);
  }
}
