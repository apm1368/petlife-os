import { Injectable } from "@nestjs/common";
import { CartStatus, CheckoutStatus, DonationStatus, PaymentMethodType, PaymentProvider, Prisma, SupportCampaignStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PaymentsService } from "../commerce/payments/payments.service";
import type { PaymentChargeMode } from "../commerce/payments/payment-gateway.interface";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { DonationLedgerService } from "./donation-ledger.service";
import { DonationAmountInvalidException, SupportCampaignNotAcceptingDonationsException, SupportCampaignNotFoundException } from "../../common/errors/api-exception";
import { toDonationHistoryItemDto, toPublicDonationEntryDto } from "./animal-support-mapper";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../common/pagination/pagination.dto";
import type { CreateDonationDto } from "./dto/animal-support.dto";

export interface DonationOutcome {
  donationIntentId: string;
  status: DonationStatus;
}

const CURRENCY = "IRR";

const HISTORY_INCLUDE = { campaign: { select: { title: true, organization: { select: { name: true } } } } } satisfies Prisma.DonationIntentInclude;

/**
 * Donation payment execution (spec: "reuse H07 payment primitives... but
 * keep accounting classification separate"). Clones
 * SubscriptionBillingService's own shell-Checkout/Cart pattern exactly (see
 * that file's doc comment) — a minimal internal Checkout/Cart created
 * CONVERTED from the start, never routed through CheckoutService, only the
 * synchronous PaymentsService.charge() path used. On success this posts
 * BOTH ledgers in the same transaction: LedgerService.recordDonationCollected
 * (platform-level, DONATION_PAYABLE liability — never PLATFORM_REVENUE) and
 * DonationLedgerService.recordDonationReceived (the organization's own
 * restricted/general income split) — "accounting destination must be
 * donation-specific" (spec).
 *
 * `DonationTransaction`'s `@unique donationIntentId` plus its own
 * existence-check makes a duplicate confirmation (e.g. a repeated request
 * carrying the same idempotencyKey) a safe no-op rather than a double
 * ledger post — the enforcement point for spec Flow H "Duplicate Donation".
 */
@Injectable()
export class DonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly donationLedger: DonationLedgerService,
    private readonly events: DomainEventsService,
  ) {}

  private async createShellCheckout(tx: Prisma.TransactionClient, donorUserId: string, amount: number, currency: string) {
    const cart = await tx.cart.create({ data: { userId: donorUserId, status: CartStatus.CONVERTED } });
    return tx.checkout.create({
      data: {
        userId: donorUserId,
        cartId: cart.id,
        paymentMethodType: PaymentMethodType.ONLINE_PAYMENT,
        status: CheckoutStatus.READY_FOR_PAYMENT,
        subtotalAmount: amount,
        totalAmount: amount,
        currency,
      },
    });
  }

  /**
   * spec: "Public anonymous donation may be supported if architecture
   * allows safely." `Cart.userId`/`Checkout.userId` are hard NOT NULL FKs
   * across the entire commerce domain (never loosened by any prior
   * handoff — see SubscriptionBillingService's own doc comment on why it
   * avoided a core-commerce schema change), so a truly unauthenticated
   * guest payment does not "allow safely" without that broader change this
   * handoff deliberately does not make (see README "Known limitations").
   * The donate endpoint therefore requires a signed-in `donorUserId` to
   * execute payment; "anonymous" on the public side is instead fully
   * satisfied by `showDonorPublicly` defaulting to false — an authenticated
   * donor's identity is still never shown on the public donor list unless
   * they explicitly opt in (spec: "do not expose donor identities publicly
   * unless explicit consent exists").
   */
  async donate(campaignId: string, donorUserId: string, dto: CreateDonationDto, mode: PaymentChargeMode = "SUCCESS"): Promise<DonationOutcome> {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.donationIntent.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) return { donationIntentId: existing.id, status: existing.status };
    }

    const campaign = await this.prisma.supportCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new SupportCampaignNotFoundException({ campaignId });
    if (campaign.status !== SupportCampaignStatus.ACTIVE) throw new SupportCampaignNotAcceptingDonationsException({ campaignId, status: campaign.status });
    if (dto.amountIrr <= 0) throw new DonationAmountInvalidException({ amountIrr: dto.amountIrr });

    const showDonorPublicly = dto.showDonorPublicly ?? false;

    return this.prisma.$transaction(async (tx) => {
      const checkout = await this.createShellCheckout(tx, donorUserId, dto.amountIrr, CURRENCY);
      const intent = await this.payments.createIntent(checkout.id, dto.amountIrr, CURRENCY, PaymentProvider.DEV_SIMULATED, undefined, tx);

      const donationIntent = await tx.donationIntent.create({
        data: {
          campaignId,
          donorUserId,
          amountIrr: dto.amountIrr,
          fundType: campaign.fundType,
          showDonorPublicly,
          checkoutId: checkout.id,
          idempotencyKey: dto.idempotencyKey ?? checkout.id,
        },
      });

      const outcome = await this.payments.charge(intent.id, mode, tx);

      if (outcome.status !== "SUCCEEDED") {
        const failed = await tx.donationIntent.update({ where: { id: donationIntent.id }, data: { status: DonationStatus.FAILED, failedAt: new Date() } });
        return { donationIntentId: failed.id, status: failed.status };
      }

      await tx.checkout.update({ where: { id: checkout.id }, data: { status: CheckoutStatus.CONFIRMED } });
      await this.ledger.recordDonationCollected(donationIntent.id, dto.amountIrr, CURRENCY, tx);

      const transaction = await tx.donationTransaction.create({
        data: {
          donationIntentId: donationIntent.id,
          campaignId,
          organizationId: campaign.organizationId,
          amountIrr: dto.amountIrr,
          fundType: campaign.fundType,
        },
      });
      await this.donationLedger.recordDonationReceived(campaign.organizationId, transaction.id, dto.amountIrr, campaign.fundType, CURRENCY, tx);

      const succeeded = await tx.donationIntent.update({ where: { id: donationIntent.id }, data: { status: DonationStatus.SUCCEEDED, succeededAt: new Date() } });
      await this.events.publish(
        "DonationSucceeded",
        { donationIntentId: succeeded.id, campaignId, organizationId: campaign.organizationId, amountIrr: dto.amountIrr, fundType: campaign.fundType },
        { tx, aggregateType: "SupportCampaign", aggregateId: campaignId },
      );

      return { donationIntentId: succeeded.id, status: succeeded.status };
    });
  }

  /** spec: "support clear receipt/history for authenticated donors" — never shown to anyone but the donor themselves (caller passes the session's own userId). */
  async listHistory(donorUserId: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.DonationIntentWhereInput = { donorUserId };
    const [rows, total] = await Promise.all([
      this.prisma.donationIntent.findMany({ where, include: HISTORY_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.donationIntent.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toDonationHistoryItemDto), total, page, pageSize);
  }

  /** spec: "public campaign should show ... updates ... where available" — only rows the donor explicitly opted into (showDonorPublicly), joined to User.displayName manually since donorUserId carries no Prisma relation (see the actor-reference convention). */
  async listPublicDonors(campaignId: string, limit: number) {
    const rows = await this.prisma.donationIntent.findMany({
      where: { campaignId, status: DonationStatus.SUCCEEDED, showDonorPublicly: true, donorUserId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const userIds = [...new Set(rows.map((r) => r.donorUserId!))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((row) => toPublicDonationEntryDto({ donorDisplayName: nameById.get(row.donorUserId!) ?? null, amountIrr: row.amountIrr, createdAt: row.createdAt }));
  }
}
