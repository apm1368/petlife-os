import { Injectable } from "@nestjs/common";
import { CartStatus, CheckoutStatus, DeliveryMethod, SellerOfferStatus } from "@prisma/client";
import { ProductCompatibilityStatus, type CartDto, type CartLineDto, type CheckoutDto, type CheckoutValidationIssueDto, type PayCheckoutResultDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  CartEmptyException,
  CheckoutExpiredException,
  CheckoutNotFoundException,
  OfferNotAvailableException,
  PaymentAlreadyCompletedException,
  SafetyConflictException,
  SellerNotAvailableException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import { HouseholdsService } from "../../households/households.service";
import { CartService } from "../cart/cart.service";
import { PaymentsService } from "../payments/payments.service";
import { OrdersService } from "../orders/orders.service";
import { InventoryReservationService, RESERVATION_TTL_MINUTES } from "./inventory-reservation.service";
import type { CreateCheckoutDto, PayCheckoutDto, UpdateCheckoutDto } from "./dto/checkout.dto";

/** Dev-calculated placeholder only (spec section 47) — no delivery integration exists this phase. Amounts are integer IRR. */
const DELIVERY_AMOUNT_BY_METHOD: Record<DeliveryMethod, number> = {
  [DeliveryMethod.STANDARD]: 0,
  [DeliveryMethod.EXPRESS]: 500_000,
};

function allLines(cart: CartDto): CartLineDto[] {
  return cart.sellerGroups.flatMap((g) => g.lines);
}

function computeValidationIssues(cart: CartDto): CheckoutValidationIssueDto[] {
  const issues: CheckoutValidationIssueDto[] = [];
  for (const line of allLines(cart)) {
    if (line.priceChanged) {
      issues.push({ code: "PRICE_CHANGED", cartLineId: line.id, message: `${line.productTitle}'s price changed since it was added to your cart.` });
    }
    if (line.compatibility?.status === ProductCompatibilityStatus.NEEDS_REVIEW || line.compatibility?.status === ProductCompatibilityStatus.NOT_RECOMMENDED) {
      issues.push({ code: "COMPATIBILITY_REVIEW_REQUIRED", cartLineId: line.id, message: `${line.productTitle} needs your review for this pet before purchase.` });
    }
  }
  return issues;
}

/**
 * Checkout is a snapshot-at-creation-time attempt over the cart (spec
 * section 25) — full revalidation happens at creation (spec section 26)
 * and inventory is reserved in the same transaction (spec section 38's
 * "Create Checkout → Reserve Inventory" ordering). Every hard-blocking
 * condition (unavailable offer/seller, insufficient inventory, an
 * unacknowledged safety conflict, an empty cart) throws; the two
 * advisory-only conditions (a price that moved, a NEEDS_REVIEW/
 * NOT_RECOMMENDED compatibility line) are returned as `validationIssues`
 * instead, per spec section 23's "prefer explicit acknowledgement... unless
 * product metadata marks hard block" — POTENTIAL_SAFETY_CONFLICT is the one
 * status this phase treats as that hard block.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdsService,
    private readonly cart: CartService,
    private readonly reservations: InventoryReservationService,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly events: DomainEventsService,
  ) {}

  private async assertAddressOwned(userId: string, addressId: string): Promise<string> {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address) throw new ValidationApiException({ field: "addressId", reason: "Address not found" });
    const membership = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: address.householdId, userId } } });
    if (!membership) throw new ValidationApiException({ field: "addressId", reason: "Address does not belong to your household" });
    return address.householdId;
  }

  async create(userId: string, dto: CreateCheckoutDto): Promise<CheckoutDto> {
    const cartRow = await this.cart.getOrCreateActiveCart(userId);
    const cartDto = await this.cart.getCart(userId);
    const lines = allLines(cartDto);
    if (lines.length === 0) throw new CartEmptyException();

    for (const line of lines) {
      if (line.sellerOffer.status !== SellerOfferStatus.ACTIVE) throw new OfferNotAvailableException({ cartLineId: line.id, offerId: line.sellerOffer.id });
      if (line.sellerOffer.sellerOrganization.verificationStatus !== "VERIFIED" || line.sellerOffer.sellerOrganization.status !== "ACTIVE") {
        throw new SellerNotAvailableException({ cartLineId: line.id, sellerOrganizationId: line.sellerOffer.sellerOrganization.id });
      }
      if (line.quantity > line.sellerOffer.availableQuantity) {
        throw new ValidationApiException({ field: "quantity", cartLineId: line.id, reason: "INSUFFICIENT_INVENTORY" });
      }
      if (line.compatibility?.status === ProductCompatibilityStatus.POTENTIAL_SAFETY_CONFLICT && !dto.acknowledgeSafetyConflict) {
        throw new SafetyConflictException({ cartLineId: line.id, productId: line.productId });
      }
    }

    let householdId = cartRow.householdId;
    if (dto.addressId) householdId = await this.assertAddressOwned(userId, dto.addressId);

    const deliveryMethod = dto.deliveryMethod ?? DeliveryMethod.STANDARD;
    const deliveryAmount = DELIVERY_AMOUNT_BY_METHOD[deliveryMethod];
    const subtotalAmount = cartDto.subtotalAmount;
    const totalAmount = subtotalAmount + deliveryAmount;
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000);

    const checkoutId = await this.prisma.$transaction(async (tx) => {
      const checkout = await tx.checkout.create({
        data: {
          userId,
          householdId,
          cartId: cartRow.id,
          addressId: dto.addressId ?? null,
          deliveryMethod,
          status: dto.addressId ? CheckoutStatus.READY_FOR_PAYMENT : CheckoutStatus.DRAFT,
          subtotalAmount,
          deliveryAmount,
          discountAmount: 0,
          totalAmount,
          currency: cartDto.currency,
          expiresAt,
        },
      });

      for (const line of lines) {
        await this.reservations.reserve(tx, checkout.id, line.sellerOffer.id, line.quantity, expiresAt);
      }

      await this.events.publish("CheckoutCreated", { checkoutId: checkout.id, userId, totalAmount }, { tx, aggregateType: "Checkout", aggregateId: checkout.id });
      return checkout.id;
    });

    return this.toDto(userId, checkoutId);
  }

  async update(userId: string, id: string, dto: UpdateCheckoutDto): Promise<CheckoutDto> {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.status !== CheckoutStatus.DRAFT && checkout.status !== CheckoutStatus.READY_FOR_PAYMENT) {
      throw new ValidationApiException({ field: "status", reason: "Checkout can no longer be edited" });
    }

    let householdId = checkout.householdId;
    if (dto.addressId) householdId = await this.assertAddressOwned(userId, dto.addressId);

    const deliveryMethod = dto.deliveryMethod ?? checkout.deliveryMethod;
    const deliveryAmount = DELIVERY_AMOUNT_BY_METHOD[deliveryMethod];
    const totalAmount = checkout.subtotalAmount + deliveryAmount - checkout.discountAmount;
    const addressId = dto.addressId ?? checkout.addressId;

    await this.prisma.checkout.update({
      where: { id },
      data: {
        addressId,
        householdId,
        deliveryMethod,
        deliveryAmount,
        totalAmount,
        status: addressId ? CheckoutStatus.READY_FOR_PAYMENT : CheckoutStatus.DRAFT,
      },
    });

    return this.toDto(userId, id);
  }

  async getById(userId: string, id: string): Promise<CheckoutDto> {
    await this.loadOwned(userId, id);
    return this.toDto(userId, id);
  }

  private async loadOwned(userId: string, id: string) {
    const checkout = await this.prisma.checkout.findUnique({ where: { id } });
    if (!checkout) throw new CheckoutNotFoundException({ checkoutId: id });
    if (checkout.userId !== userId) throw new CheckoutNotFoundException({ checkoutId: id });
    return checkout;
  }

  async createPaymentIntent(userId: string, id: string, idempotencyKey?: string) {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.expiresAt && checkout.expiresAt < new Date()) throw new CheckoutExpiredException({ checkoutId: id });
    if (checkout.status !== CheckoutStatus.READY_FOR_PAYMENT && checkout.status !== CheckoutStatus.PAYMENT_PENDING) {
      throw new ValidationApiException({ field: "status", reason: "An address is required before a payment intent can be created" });
    }
    const intent = await this.payments.createIntent(checkout.id, checkout.totalAmount, checkout.currency, idempotencyKey);
    return { id: intent.id, checkoutId: intent.checkoutId, amount: intent.amount, currency: intent.currency, status: intent.status, provider: intent.provider };
  }

  async pay(userId: string, id: string, dto: PayCheckoutDto): Promise<PayCheckoutResultDto> {
    const checkout = await this.loadOwned(userId, id);
    if (checkout.status === CheckoutStatus.CONFIRMED) throw new PaymentAlreadyCompletedException({ checkoutId: id });

    if (checkout.expiresAt && checkout.expiresAt < new Date()) {
      await this.prisma.$transaction(async (tx) => {
        await this.reservations.releaseAllForCheckout(tx, id);
        await tx.checkout.update({ where: { id }, data: { status: CheckoutStatus.EXPIRED } });
      });
      throw new CheckoutExpiredException({ checkoutId: id });
    }

    const intent = await this.payments.getIntent(id);
    if (!intent) throw new ValidationApiException({ field: "paymentIntent", reason: "Create a payment intent before paying" });

    const outcome = await this.payments.charge(intent.id, dto.mode);

    let orderIds: string[] = [];
    if (outcome.status === "SUCCEEDED") {
      orderIds = await this.finalizeSuccessfulPayment(id);
    } else if (outcome.status === "PENDING") {
      await this.prisma.checkout.update({ where: { id }, data: { status: CheckoutStatus.PAYMENT_PENDING } });
    }
    // FAILED: checkout status is left untouched (still READY_FOR_PAYMENT) and reservations
    // are never released, so the exact same checkout can be retried immediately without
    // losing its place in the stock queue — see README "Payment failure".

    return { checkout: await this.toDto(userId, id), paymentStatus: outcome.status, failureCode: outcome.failureCode, failureMessage: outcome.failureMessage, orderIds };
  }

  /**
   * The single completion path for a successful charge — called
   * synchronously from `pay()` and, for a PENDING intent resolved later,
   * from the webhook-driven event listener (see PaymentEventsListener).
   * Idempotent: a checkout already CONFIRMED is a no-op (its existing
   * order ids are returned rather than recomputed), which is what makes a
   * duplicate webhook or a raced retry safe.
   */
  async finalizeSuccessfulPayment(checkoutId: string): Promise<string[]> {
    const checkout = await this.prisma.checkout.findUnique({ where: { id: checkoutId } });
    if (!checkout) return [];
    if (checkout.status === CheckoutStatus.CONFIRMED) {
      const existing = await this.prisma.order.findMany({ where: { checkoutId }, select: { id: true } });
      return existing.map((o) => o.id);
    }

    const cartDto = await this.cart.getCart(checkout.userId);
    const lines = allLines(cartDto);
    const address = checkout.addressId ? await this.prisma.customerAddress.findUnique({ where: { id: checkout.addressId } }) : null;

    return this.prisma.$transaction(async (tx) => {
      await this.reservations.consumeAllForCheckout(tx, checkoutId);
      const orderIds = await this.orders.createForCheckout(
        tx,
        { id: checkout.id, userId: checkout.userId, householdId: checkout.householdId, deliveryAmount: checkout.deliveryAmount, discountAmount: checkout.discountAmount, currency: checkout.currency },
        lines,
        checkout.addressId,
        address ? { addressLine: address.addressLine, city: address.city, region: address.region, countryCode: address.countryCode, recipient: address.recipient, phone: address.phone } : null,
      );
      await tx.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatus.CONFIRMED } });
      await tx.cart.update({ where: { id: checkout.cartId }, data: { status: CartStatus.CONVERTED } });
      await this.events.publish("CartConverted", { cartId: checkout.cartId, checkoutId }, { tx, aggregateType: "Cart", aggregateId: checkout.cartId });
      return orderIds;
    });
  }

  private async toDto(userId: string, checkoutId: string): Promise<CheckoutDto> {
    const checkout = await this.prisma.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    const cartDto = await this.cart.getCart(userId);
    return {
      id: checkout.id,
      status: checkout.status as unknown as CheckoutDto["status"],
      addressId: checkout.addressId,
      deliveryMethod: checkout.deliveryMethod as unknown as CheckoutDto["deliveryMethod"],
      subtotalAmount: checkout.subtotalAmount,
      deliveryAmount: checkout.deliveryAmount,
      discountAmount: checkout.discountAmount,
      totalAmount: checkout.totalAmount,
      currency: checkout.currency,
      sellerGroups: cartDto.sellerGroups,
      expiresAt: checkout.expiresAt?.toISOString() ?? null,
      validationIssues: computeValidationIssues(cartDto),
      createdAt: checkout.createdAt.toISOString(),
      updatedAt: checkout.updatedAt.toISOString(),
    };
  }
}
