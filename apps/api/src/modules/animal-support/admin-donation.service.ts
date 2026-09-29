import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DonationStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { RefundsService } from "../commerce/refunds/refunds.service";
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
    private readonly refunds: RefundsService,
  ) {}

  /**
   * spec: "Every donation financial movement must be auditable... support
   * refund if supported." Reverses BOTH ledgers exactly the way
   * SubscriptionBillingService.refundBillingAttempt reverses the
   * subscription-revenue posting alongside LedgerService.recordRefundSucceeded
   * — never one without the other.
   */
  /**
   * Batch 6 — a real refund: the gateway is asked to refund the captured payment through the
   * shared RefundsService (locked per checkout, so two admins cannot double-refund). Only when the
   * gateway reports success, and inside that same transaction, the donation leg is reversed, the
   * organization's restricted/general balance is reduced, and the donation is marked REFUNDED with
   * an audit entry. A gateway failure leaves the donation untouched and surfaces the error.
   */
  async refundDonation(admin: ResolvedAdminContext, donationIntentId: string, reason: string): Promise<void> {
    const intent = await this.prisma.donationIntent.findUnique({ where: { id: donationIntentId }, include: { transaction: true } });
    if (!intent) throw new DonationNotFoundException({ donationIntentId });
    if (intent.status !== DonationStatus.SUCCEEDED || !intent.transaction) throw new DonationNotFoundException({ donationIntentId, reason: "NOT_REFUNDABLE" });
    if (intent.transaction.refundedAt) throw new DonationNotFoundException({ donationIntentId, reason: "ALREADY_REFUNDED" });

    await this.refunds.refundStandalonePayment(intent.checkoutId, intent.amountIrr, CURRENCY, reason, null, {
      actorType: "ADMIN",
      actorId: admin.adminUserId,
      requestedByAdminUserId: admin.adminUserId,
      onSucceeded: async (tx, refund) => {
        const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "donation_intents" WHERE "id" = ${donationIntentId}::uuid FOR UPDATE`;
        if (!locked) throw new DonationNotFoundException({ donationIntentId });
        const current = await tx.donationIntent.findUniqueOrThrow({ where: { id: donationIntentId }, include: { transaction: true } });
        if (current.status !== DonationStatus.SUCCEEDED || !current.transaction || current.transaction.refundedAt) throw new DonationNotFoundException({ donationIntentId, reason: "ALREADY_REFUNDED" });

        await this.ledger.recordDonationRefunded(current.id, current.amountIrr, CURRENCY, tx);
        await this.donationLedger.recordRefund(current.transaction.organizationId, current.transaction.id, current.amountIrr, current.fundType, CURRENCY, tx);
        await tx.donationTransaction.update({ where: { id: current.transaction.id }, data: { refundedAt: new Date() } });
        await tx.donationIntent.update({ where: { id: current.id }, data: { status: DonationStatus.REFUNDED, refundedAt: new Date() } });
        await this.audit.record({
          adminUserId: admin.adminUserId,
          action: "donation.refunded",
          entityType: "DonationIntent",
          entityId: current.id,
          reason,
          afterSummary: { amountIrr: current.amountIrr, refundId: refund.id },
          tx,
        });
        await this.events.publish("DonationRefunded", { donationIntentId: current.id, campaignId: current.campaignId, amountIrr: current.amountIrr, refundId: refund.id }, { tx, aggregateType: "SupportCampaign", aggregateId: current.campaignId });
      },
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
