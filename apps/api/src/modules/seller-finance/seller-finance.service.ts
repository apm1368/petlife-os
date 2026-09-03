import { Injectable } from "@nestjs/common";
import { DeliveryResponsibility, FinancialConfidence, MarketplaceProvider, OrderOrigin, Prisma, type OrderFinancialBreakdown } from "@prisma/client";
import type { OrderFinancialBreakdownDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NegativePlatformRevenueException } from "../../common/errors/api-exception";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { CommissionRuleService } from "./commission-rule.service";
import { SellerLedgerService } from "./seller-ledger.service";

/** Fixed, deterministic simulated commission the DEV marketplace channel charges the platform (spec: "DEV marketplace may use deterministic simulated fee rules") — 2%, never varying, never fetched from anywhere real. */
const DEV_MARKETPLACE_SIMULATED_CHANNEL_FEE_BPS = 200;

function applyBasisPoints(amountIrr: number, basisPoints: number): number {
  return Math.round((amountIrr * basisPoints) / 10_000);
}

function toMarketplaceOrigin(provider: MarketplaceProvider): OrderOrigin {
  switch (provider) {
    case MarketplaceProvider.DEV:
      return OrderOrigin.DEV_MARKETPLACE;
    case MarketplaceProvider.TOROB:
      return OrderOrigin.TOROB;
    case MarketplaceProvider.DIGIKALA:
      return OrderOrigin.DIGIKALA;
  }
}

export function toOrderFinancialBreakdownDto(row: OrderFinancialBreakdown): OrderFinancialBreakdownDto {
  return {
    id: row.id,
    orderId: row.orderId,
    sellerOrganizationId: row.sellerOrganizationId,
    origin: row.origin as unknown as OrderFinancialBreakdownDto["origin"],
    grossMerchandiseIrr: row.grossMerchandiseIrr,
    shippingIrr: row.shippingIrr,
    discountIrr: row.discountIrr,
    shippingResponsibility: row.shippingResponsibility as unknown as OrderFinancialBreakdownDto["shippingResponsibility"],
    commissionBasisPoints: row.commissionBasisPoints,
    platformCommissionIrr: row.platformCommissionIrr,
    channelFeeIrr: row.channelFeeIrr,
    channelFeeConfidence: row.channelFeeConfidence as unknown as OrderFinancialBreakdownDto["channelFeeConfidence"],
    sellerGrossIrr: row.sellerGrossIrr,
    sellerNetIrr: row.sellerNetIrr,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Closes "Order Financial Attribution -> Platform Fees -> Seller
 * Receivable" (spec goal) for exactly one Order, exactly once. Called from
 * two places only: CheckoutService.finalizeSuccessfulPayment (PET_LIFE
 * origin, inside its own $transaction, once the Order's Fulfillment already
 * exists so `shippingResponsibility` reflects reality) and
 * MarketplaceOrderIngestionService.ingestOrder (marketplace origin, inside
 * its own $transaction, right after the internal Order is created).
 *
 * Idempotency mirrors every other append-only write in this codebase:
 * OrderFinancialBreakdown's own `@@unique([orderId])` is the guard. Both
 * call sites are themselves already idempotent (a retried checkout
 * confirmation or a replayed marketplace webhook never reaches this method
 * twice for the same order — see each call site's own doc comment), so a
 * caught P2002 here is a genuine concurrent race, not the normal path, and
 * is treated as "someone else already attributed this order" rather than
 * an error worth surfacing.
 */
@Injectable()
export class SellerFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly sellerLedger: SellerLedgerService,
    private readonly commissionRules: CommissionRuleService,
  ) {}

  /** PET_LIFE-origin order: the customer paid PET LIFE OS directly (spec: "use H07 payment confirmation as the financial trigger"). `tx` must be the same transaction that already recorded the payment and created the Order's Fulfillment. */
  async attributeDirectSale(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const fulfillment = await tx.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } } });
    await this.attribute(tx, order, OrderOrigin.PET_LIFE, fulfillment?.deliveryResponsibility ?? DeliveryResponsibility.PETLIFE);
  }

  /** Marketplace-origin order: PET LIFE OS never collected this cash (spec: "do not create a fake PaymentIntent"). `tx` must be the same transaction that just created the internal Order during ingestion. */
  async attributeMarketplaceSale(tx: Prisma.TransactionClient, orderId: string, provider: MarketplaceProvider, marketplaceDeliveryResponsibility: DeliveryResponsibility): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.attribute(tx, order, toMarketplaceOrigin(provider), marketplaceDeliveryResponsibility);
  }

  private async attribute(
    tx: Prisma.TransactionClient,
    order: { id: string; sellerOrganizationId: string; currency: string; subtotalAmount: number; deliveryAmount: number; discountAmount: number; totalAmount: number },
    origin: OrderOrigin,
    shippingResponsibility: DeliveryResponsibility,
  ): Promise<void> {
    const existing = await tx.orderFinancialBreakdown.findUnique({ where: { orderId: order.id } });
    if (existing) return;

    const { rule, basisPoints } = await this.commissionRules.resolve(order.sellerOrganizationId, origin);

    const grossMerchandiseIrr = order.subtotalAmount;
    const shippingIrr = order.deliveryAmount;
    const discountIrr = order.discountAmount;
    const sellerGrossIrr = grossMerchandiseIrr - discountIrr;
    const shippingForSellerIrr = shippingResponsibility === DeliveryResponsibility.SELLER ? shippingIrr : 0;
    const commissionOnGrossIrr = applyBasisPoints(sellerGrossIrr, basisPoints);
    const sellerNetIrr = sellerGrossIrr - commissionOnGrossIrr + shippingForSellerIrr;
    // Derived, never independently rounded (see OrderFinancialBreakdown.platformCommissionIrr's own doc comment) — guarantees the two-line platform ledger posting below always balances exactly against totalAmount.
    const platformCommissionIrr = order.totalAmount - sellerNetIrr;
    if (platformCommissionIrr < 0) {
      throw new NegativePlatformRevenueException({ orderId: order.id, totalAmount: order.totalAmount, sellerNetIrr });
    }
    if (sellerNetIrr < 0) {
      throw new Error(`SellerFinanceService.attribute: computed a negative sellerNetIrr (${sellerNetIrr}) for order ${order.id} — unreachable while order-level discounts are always 0`);
    }

    const isDevMarketplace = origin === OrderOrigin.DEV_MARKETPLACE;
    const channelFeeIrr = isDevMarketplace ? applyBasisPoints(grossMerchandiseIrr, DEV_MARKETPLACE_SIMULATED_CHANNEL_FEE_BPS) : 0;
    const channelFeeConfidence: FinancialConfidence = origin === OrderOrigin.PET_LIFE ? FinancialConfidence.KNOWN : isDevMarketplace ? FinancialConfidence.ESTIMATED : FinancialConfidence.UNKNOWN;

    try {
      await tx.orderFinancialBreakdown.create({
        data: {
          orderId: order.id,
          sellerOrganizationId: order.sellerOrganizationId,
          origin,
          grossMerchandiseIrr,
          shippingIrr,
          discountIrr,
          shippingResponsibility,
          commissionRuleId: rule.id,
          commissionBasisPoints: basisPoints,
          platformCommissionIrr,
          channelFeeIrr,
          channelFeeConfidence,
          sellerGrossIrr,
          sellerNetIrr,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    }

    if (origin === OrderOrigin.PET_LIFE) {
      await this.ledger.recordSellerAttribution(order.id, sellerNetIrr, platformCommissionIrr, order.currency, tx);
    } else {
      await this.ledger.recordMarketplaceCommission(order.id, platformCommissionIrr, order.currency, tx);
    }

    if (sellerNetIrr > 0) {
      await this.sellerLedger.recordSale(order.sellerOrganizationId, order.id, sellerNetIrr, order.currency, tx);
    }
  }

  /**
   * Reverses a PET_LIFE-origin order's seller/platform economics by the
   * refunded amount's proportional share (spec: "support partial/
   * proportional refund impact where existing model supports it — never
   * assume every refund is full-order"). H07's RefundsService currently
   * only ever supports a full-order refund, so `refundAmountIrr` always
   * equals the order's own `totalAmount` in practice and this reduces to
   * "reverse the whole attribution" — but the math here does not assume
   * that, so a future partial-refund capability needs no change here.
   *
   * Called from RefundsService's own `refundPayment`/`refundFinancing`
   * transactions, *alongside* (never instead of) `ledger.recordRefundSucceeded`
   * — H07's refund ledger code is untouched. A marketplace-origin order
   * never reaches this (RefundsService requires a checkoutId, which
   * marketplace orders never have), and an order with no
   * OrderFinancialBreakdown yet (attribution somehow never ran) is a no-op
   * rather than a thrown error, since refunding is still the safer default.
   */
  async applyRefundImpact(tx: Prisma.TransactionClient, orderId: string, refundId: string, refundAmountIrr: number, currency: string): Promise<void> {
    const breakdown = await tx.orderFinancialBreakdown.findUnique({ where: { orderId } });
    if (!breakdown || breakdown.origin !== OrderOrigin.PET_LIFE) return;

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const sellerImpactIrr = order.totalAmount > 0 ? Math.round((refundAmountIrr / order.totalAmount) * breakdown.sellerNetIrr) : 0;
    // Derived, never independently rounded — see `platformCommissionIrr`'s own doc comment in `attribute()` for why this balancer pattern always keeps the reversal exact.
    const platformShareIrr = refundAmountIrr - sellerImpactIrr;

    if (sellerImpactIrr > 0) {
      await this.sellerLedger.recordRefund(breakdown.sellerOrganizationId, refundId, sellerImpactIrr, currency, tx);
    }
    if (sellerImpactIrr > 0 || platformShareIrr > 0) {
      await this.ledger.recordSellerAttributionReversal(orderId, sellerImpactIrr, platformShareIrr, currency, tx);
    }
  }
}
