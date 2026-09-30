import { Injectable } from "@nestjs/common";
import { CartStatus, CheckoutStatus, DonationStatus, PaymentMethodType, Prisma, SupportCampaignStatus, SupportNeedStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PaymentsService } from "../commerce/payments/payments.service";
import type { PaymentChargeMode } from "../commerce/payments/payment-gateway.interface";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { DonationLedgerService } from "./donation-ledger.service";
import { DonationAmountInvalidException, DonationNotFoundException, PaymentProviderUnavailableException, SupportCampaignNotAcceptingDonationsException, SupportCampaignNotFoundException, ValidationApiException } from "../../common/errors/api-exception";
import { PaymentGatewayRegistry } from "../commerce/payments/payment-gateway-registry.service";
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
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  /**
   * Batch 6 — the gateway is whatever the payment environment enables (sandbox dev gateway, or a
   * real merchant gateway in production); never hard-coded. No enabled gateway means no donation,
   * never a pretend success.
   */
  private selectGateway() {
    const gateway = this.gateways.listEnabled().find((g) => g.capabilities.supportsDirectPayment);
    if (!gateway) throw new PaymentProviderUnavailableException({ reason: "NO_DIRECT_PAYMENT_GATEWAY" });
    return gateway.provider;
  }

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
      if (existing) {
        // An idempotency key is bound to its donor and campaign; reusing it for anything else is refused.
        if (existing.donorUserId !== donorUserId || existing.campaignId !== campaignId) throw new ValidationApiException({ field: "idempotencyKey", reason: "KEY_ALREADY_USED" });
        return { donationIntentId: existing.id, status: existing.status };
      }
    }

    const campaign = await this.prisma.supportCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new SupportCampaignNotFoundException({ campaignId });
    if (campaign.status !== SupportCampaignStatus.ACTIVE) throw new SupportCampaignNotAcceptingDonationsException({ campaignId, status: campaign.status });
    if (dto.amountIrr <= 0) throw new DonationAmountInvalidException({ amountIrr: dto.amountIrr });
    if (dto.supportNeedListingId) {
      // A donation "for" a need must go to that need's own campaign, while the need is live.
      const need = await this.prisma.supportNeedListing.findUnique({ where: { id: dto.supportNeedListingId }, select: { campaignId: true, status: true } });
      const live: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED];
      if (!need || need.campaignId !== campaignId || !live.includes(need.status)) throw new ValidationApiException({ field: "supportNeedListingId", reason: "NEED_NOT_LINKED_TO_CAMPAIGN" });
    }
    const provider = this.selectGateway();

    const showDonorPublicly = dto.showDonorPublicly ?? false;
    const publicDisplayName = showDonorPublicly ? dto.publicDisplayName?.trim() || null : null;
    if (showDonorPublicly && !publicDisplayName) throw new ValidationApiException({ field: "publicDisplayName", reason: "REQUIRED_WHEN_SHOWN_PUBLICLY" });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const checkout = await this.createShellCheckout(tx, donorUserId, dto.amountIrr, CURRENCY);
        const intent = await this.payments.createIntent(checkout.id, dto.amountIrr, CURRENCY, provider, undefined, tx);

        const donationIntent = await tx.donationIntent.create({
          data: {
            campaignId,
            donorUserId,
            amountIrr: dto.amountIrr,
            fundType: campaign.fundType,
            showDonorPublicly,
            publicDisplayName,
            supportNeedListingId: dto.supportNeedListingId ?? null,
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
        // Cash leg (gateway receivable ← clearing), same as checkout/subscriptions/travel, then the
        // donation leg (clearing → donation payable). Batch 6: the cash leg was previously missing.
        await this.ledger.recordPaymentSucceeded(checkout.id, dto.amountIrr, CURRENCY, tx);
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
          { donationIntentId: succeeded.id, campaignId, organizationId: campaign.organizationId, amountIrr: dto.amountIrr, fundType: campaign.fundType, supportNeedListingId: dto.supportNeedListingId ?? null },
          { tx, aggregateType: "SupportCampaign", aggregateId: campaignId },
        );

        return { donationIntentId: succeeded.id, status: succeeded.status };
      });
    } catch (error) {
      // Two concurrent requests with the same key: the loser returns the winner's donation, never a second charge.
      if (dto.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.donationIntent.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing && existing.donorUserId === donorUserId) return { donationIntentId: existing.id, status: existing.status };
      }
      throw error;
    }
  }

  /** Batch 6 — the donor's own receipt. Anyone else gets 404. */
  async getReceipt(donorUserId: string, donationIntentId: string) {
    const row = await this.prisma.donationIntent.findFirst({
      where: { id: donationIntentId, donorUserId },
      include: { campaign: { select: { id: true, title: true, fundType: true, organization: { select: { id: true, name: true } } } }, transaction: { select: { id: true, createdAt: true, refundedAt: true } } },
    });
    if (!row) throw new DonationNotFoundException({ donationIntentId });
    const need = row.supportNeedListingId ? await this.prisma.supportNeedListing.findUnique({ where: { id: row.supportNeedListingId }, select: { id: true, title: true } }) : null;
    return {
      id: row.id,
      reference: `DN-${row.id.slice(0, 8).toUpperCase()}`,
      status: row.status,
      amountIrr: row.amountIrr,
      currency: CURRENCY,
      fundType: row.fundType,
      campaign: { id: row.campaign.id, title: row.campaign.title },
      organization: row.campaign.organization,
      supportNeed: need,
      showDonorPublicly: row.showDonorPublicly,
      publicDisplayName: row.publicDisplayName,
      createdAt: row.createdAt.toISOString(),
      succeededAt: row.succeededAt?.toISOString() ?? null,
      failedAt: row.failedAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
    };
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
  /**
   * Batch 6: only the name the donor chose for this donation is ever shown — never the account's
   * display name (which may be a full legal name), never contact or payment identity.
   */
  async listPublicDonors(campaignId: string, limit: number) {
    const rows = await this.prisma.donationIntent.findMany({
      where: { campaignId, status: DonationStatus.SUCCEEDED, showDonorPublicly: true, publicDisplayName: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { publicDisplayName: true, amountIrr: true, createdAt: true },
    });
    return rows.map((row) => toPublicDonationEntryDto({ donorDisplayName: row.publicDisplayName, amountIrr: row.amountIrr, createdAt: row.createdAt }));
  }
}
