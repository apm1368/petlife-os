import { Injectable } from "@nestjs/common";
import { CartStatus, Prisma, SellerOfferStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { ProductCompatibilityStatus, type CartDto, type CartLineDto, type CartLineIssue, type CartSellerGroupDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { NotFoundApiException, OfferNotAvailableException, PetAccessDeniedException, ValidationApiException } from "../../../common/errors/api-exception";
import { HouseholdsService } from "../../households/households.service";
import { PetAccessService } from "../../pet-access/pet-access.service";
import { LOW_STOCK_THRESHOLD, toSellerOfferDto } from "../commerce-dto.mapper";
import { PricingService, type EffectivePrice } from "../promotions/pricing.service";
import { ProductCompatibilityService } from "../catalog/product-compatibility.service";
import type { AddCartItemDto, UpdateCartItemDto } from "./dto/cart-item.dto";

const CART_LINE_INCLUDE = {
  sellerOffer: {
    include: {
      sellerOrganization: true,
      inventoryItem: true,
      productVariant: { include: { product: true } },
    },
  },
  targetPet: true,
} satisfies Prisma.CartLineInclude;

type CartLineRow = Prisma.CartLineGetPayload<{ include: typeof CART_LINE_INCLUDE }>;

/**
 * A persistent, server-side Cart (spec section 18) — never localStorage. One
 * ACTIVE cart per user at a time; `getOrCreateActiveCart` is the only way a
 * Cart row comes into existence, mirroring the idempotent "find or create"
 * pattern PetAccessService.applyHouseholdDefaults uses.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly households: HouseholdsService,
    private readonly petAccess: PetAccessService,
    private readonly compatibility: ProductCompatibilityService,
    private readonly events: DomainEventsService,
    private readonly pricing: PricingService,
  ) {}

  /** Per-line business limit, independent of stock. */
  static readonly MAX_LINE_QUANTITY = 20;

  private async priceOffer(offer: { id: string; priceAmount: number; sellerOrganizationId: string; productVariant: { product: { id: string; categoryId: string } } }): Promise<EffectivePrice> {
    const prices = await this.pricing.price([{ offerId: offer.id, priceAmount: offer.priceAmount, sellerOrganizationId: offer.sellerOrganizationId, productId: offer.productVariant.product.id, categoryId: offer.productVariant.product.categoryId }]);
    return prices.get(offer.id)!;
  }

  /** Quantity can never exceed what is actually available to sell right now, nor the per-line limit. */
  private assertQuantity(quantity: number, offer: { inventoryItem: { onHand: number; reserved: number } | null }) {
    const available = Math.max(0, (offer.inventoryItem?.onHand ?? 0) - (offer.inventoryItem?.reserved ?? 0));
    if (quantity > CartService.MAX_LINE_QUANTITY) throw new ValidationApiException({ field: "quantity", reason: "LINE_LIMIT", max: CartService.MAX_LINE_QUANTITY });
    if (quantity > available) throw new ValidationApiException({ field: "quantity", reason: "INSUFFICIENT_INVENTORY", available });
  }

  async getOrCreateActiveCart(userId: string) {
    const existing = await this.prisma.cart.findFirst({ where: { userId, status: CartStatus.ACTIVE } });
    if (existing) return existing;

    const households = await this.households.listForUser(userId);
    const created = await this.prisma.cart.create({ data: { userId, householdId: households[0]?.id ?? null } });
    await this.events.publish("CartCreated", { cartId: created.id, userId }, { aggregateType: "Cart", aggregateId: created.id });
    return created;
  }

  private async assertPetAccessible(userId: string, petId: string): Promise<void> {
    const effective = await this.petAccess.getEffectivePermissions(petId, userId);
    if (!effective) throw new PetAccessDeniedException({ petId });
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const offer = await this.prisma.sellerOffer.findUnique({ where: { id: dto.offerId }, include: { sellerOrganization: true, inventoryItem: true, productVariant: { include: { product: true } } } });
    if (!offer) throw new NotFoundApiException("Offer");
    if (
      offer.status !== SellerOfferStatus.ACTIVE ||
      offer.sellerOrganization.verificationStatus !== SellerVerificationStatus.VERIFIED ||
      offer.sellerOrganization.status !== SellerStatus.ACTIVE
    ) {
      throw new OfferNotAvailableException({ offerId: dto.offerId });
    }
    if (offer.productVariant.product.status !== "ACTIVE" || !offer.productVariant.isActive) throw new OfferNotAvailableException({ offerId: dto.offerId });

    if (dto.targetPetId) await this.assertPetAccessible(userId, dto.targetPetId);

    const cart = await this.getOrCreateActiveCart(userId);

    const existingLine = await this.prisma.cartLine.findFirst({
      where: { cartId: cart.id, sellerOfferId: dto.offerId, targetPetId: dto.targetPetId ?? null },
    });
    this.assertQuantity((existingLine?.quantity ?? 0) + dto.quantity, offer);
    const price = await this.priceOffer(offer);

    if (existingLine) {
      await this.prisma.cartLine.update({
        where: { id: existingLine.id },
        data: { quantity: existingLine.quantity + dto.quantity, unitPriceSnapshot: price.unitPrice, promotionIdSnapshot: price.promotion?.id ?? null, currency: offer.currency },
      });
      await this.events.publish("CartItemUpdated", { cartId: cart.id, cartLineId: existingLine.id }, { aggregateType: "Cart", aggregateId: cart.id });
    } else {
      const created = await this.prisma.cartLine.create({
        data: {
          cartId: cart.id,
          sellerOfferId: dto.offerId,
          targetPetId: dto.targetPetId ?? null,
          quantity: dto.quantity,
          unitPriceSnapshot: price.unitPrice,
          promotionIdSnapshot: price.promotion?.id ?? null,
          currency: offer.currency,
        },
      });
      await this.events.publish("CartItemAdded", { cartId: cart.id, cartLineId: created.id, offerId: dto.offerId }, { aggregateType: "Cart", aggregateId: cart.id });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, lineId: string, dto: UpdateCartItemDto) {
    const line = await this.loadOwnedLine(userId, lineId);
    const offer = await this.prisma.sellerOffer.findUniqueOrThrow({ where: { id: line.sellerOfferId }, include: { inventoryItem: true, productVariant: { include: { product: true } } } });
    this.assertQuantity(dto.quantity, offer);
    // Changing quantity is an explicit customer action: re-accept the current price.
    const price = await this.priceOffer(offer);
    await this.prisma.cartLine.update({ where: { id: line.id }, data: { quantity: dto.quantity, unitPriceSnapshot: price.unitPrice, promotionIdSnapshot: price.promotion?.id ?? null } });
    await this.events.publish("CartItemUpdated", { cartId: line.cartId, cartLineId: line.id }, { aggregateType: "Cart", aggregateId: line.cartId });
    return this.getCart(userId);
  }

  async removeItem(userId: string, lineId: string) {
    const line = await this.loadOwnedLine(userId, lineId);
    await this.prisma.cartLine.delete({ where: { id: line.id } });
    await this.events.publish("CartItemRemoved", { cartId: line.cartId, cartLineId: line.id }, { aggregateType: "Cart", aggregateId: line.cartId });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.prisma.cart.findFirst({ where: { userId, status: CartStatus.ACTIVE } });
    if (cart) await this.prisma.cartLine.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  private async loadOwnedLine(userId: string, lineId: string): Promise<{ id: string; cartId: string; sellerOfferId: string }> {
    const line = await this.prisma.cartLine.findUnique({ where: { id: lineId }, include: { cart: true } });
    if (!line || line.cart.userId !== userId) throw new NotFoundApiException("Cart item");
    return line;
  }

  async getCart(userId: string): Promise<CartDto> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      include: { lines: { include: CART_LINE_INCLUDE, orderBy: { createdAt: "asc" } } },
    });

    if (!cart) {
      return { id: "", status: CartStatus.ACTIVE as unknown as CartDto["status"], sellerGroups: [], totalItems: 0, subtotalAmount: 0, currency: "IRR", hasSafetyConflict: false, discountAmount: 0, hasBlockingIssues: false };
    }

    const prices = await this.pricing.price(
      cart.lines.map((l) => ({ offerId: l.sellerOffer.id, priceAmount: l.sellerOffer.priceAmount, sellerOrganizationId: l.sellerOffer.sellerOrganizationId, productId: l.sellerOffer.productVariant.product.id, categoryId: l.sellerOffer.productVariant.product.categoryId })),
    );
    const lineDtos: (CartLineDto & { sellerOrgId: string })[] = [];
    for (const line of cart.lines) {
      lineDtos.push(await this.toLineDto(line, userId, prices.get(line.sellerOffer.id)!));
    }

    const groupsByOrg = new Map<string, CartSellerGroupDto>();
    for (const { sellerOrgId, ...lineDto } of lineDtos) {
      const existing = groupsByOrg.get(sellerOrgId);
      if (existing) {
        existing.lines.push(lineDto);
        existing.subtotalAmount += lineDto.lineTotal;
      } else {
        groupsByOrg.set(sellerOrgId, { sellerOrganization: lineDto.sellerOffer.sellerOrganization, lines: [lineDto], subtotalAmount: lineDto.lineTotal });
      }
    }

    const sellerGroups = Array.from(groupsByOrg.values());
    const totalItems = lineDtos.reduce((sum, l) => sum + l.quantity, 0);
    const subtotalAmount = sellerGroups.reduce((sum, g) => sum + g.subtotalAmount, 0);
    const hasSafetyConflict = lineDtos.some((l) => l.compatibility?.status === ProductCompatibilityStatus.POTENTIAL_SAFETY_CONFLICT);
    const discountAmount = lineDtos.reduce((sum, l) => sum + l.unitDiscount * l.quantity, 0);
    const blocking: CartLineIssue[] = ["OFFER_UNAVAILABLE", "SELLER_UNAVAILABLE", "OUT_OF_STOCK", "QUANTITY_EXCEEDS_STOCK"];
    const hasBlockingIssues = lineDtos.some((l) => l.issues.some((i) => blocking.includes(i)));

    return {
      id: cart.id,
      status: cart.status as unknown as CartDto["status"],
      sellerGroups,
      totalItems,
      subtotalAmount,
      currency: lineDtos[0]?.currency ?? "IRR",
      hasSafetyConflict,
      discountAmount,
      hasBlockingIssues,
    };
  }

  /**
   * Every state is explicit and nothing is silently swapped: an unavailable offer or seller stays in
   * the cart, flagged, until the customer removes it — no automatic substitution of seller or variant.
   */
  private async toLineDto(line: CartLineRow, userId: string, price: EffectivePrice): Promise<CartLineDto & { sellerOrgId: string }> {
    const offer = line.sellerOffer;
    const product = offer.productVariant.product;
    let compatibility = null;
    if (line.targetPet) {
      compatibility = await this.compatibility.evaluate(line.targetPet, product, userId);
    }
    const available = Math.max(0, (offer.inventoryItem?.onHand ?? 0) - (offer.inventoryItem?.reserved ?? 0));
    const issues: CartLineIssue[] = [];
    if (offer.status !== SellerOfferStatus.ACTIVE || product.status !== "ACTIVE" || !offer.productVariant.isActive) issues.push("OFFER_UNAVAILABLE");
    if (offer.sellerOrganization.verificationStatus !== SellerVerificationStatus.VERIFIED || offer.sellerOrganization.status !== SellerStatus.ACTIVE) issues.push("SELLER_UNAVAILABLE");
    if (available === 0) issues.push("OUT_OF_STOCK");
    else if (line.quantity > available) issues.push("QUANTITY_EXCEEDS_STOCK");
    else if (available <= LOW_STOCK_THRESHOLD) issues.push("LOW_STOCK");
    const priceChanged = price.unitPrice !== line.unitPriceSnapshot;
    if (priceChanged) issues.push(line.promotionIdSnapshot && price.promotion?.id !== line.promotionIdSnapshot && price.unitPrice > line.unitPriceSnapshot ? "PROMOTION_EXPIRED" : "PRICE_CHANGED");

    return {
      id: line.id,
      sellerOffer: toSellerOfferDto(offer, price),
      sellerOrgId: offer.sellerOrganizationId,
      productId: product.id,
      productTitle: product.title,
      variantTitle: offer.productVariant.title,
      variantSku: offer.productVariant.sku,
      targetPetId: line.targetPetId,
      targetPetName: line.targetPet?.name ?? null,
      quantity: line.quantity,
      unitPriceSnapshot: line.unitPriceSnapshot,
      currentPriceAmount: price.unitPrice,
      priceChanged,
      currency: line.currency,
      lineTotal: price.unitPrice * line.quantity,
      compatibility,
      listUnitPrice: price.listUnitPrice,
      unitDiscount: price.unitDiscount,
      promotionName: price.promotion?.name ?? null,
      promotionId: price.promotion?.id ?? null,
      issues,
    };
  }

  /** The customer explicitly accepts current prices after a change (never done silently). */
  async acceptCurrentPrices(userId: string) {
    const cart = await this.prisma.cart.findFirst({ where: { userId, status: CartStatus.ACTIVE }, include: { lines: { include: CART_LINE_INCLUDE } } });
    if (cart) {
      const prices = await this.pricing.price(cart.lines.map((l) => ({ offerId: l.sellerOffer.id, priceAmount: l.sellerOffer.priceAmount, sellerOrganizationId: l.sellerOffer.sellerOrganizationId, productId: l.sellerOffer.productVariant.product.id, categoryId: l.sellerOffer.productVariant.product.categoryId })));
      for (const l of cart.lines) {
        const p = prices.get(l.sellerOffer.id)!;
        await this.prisma.cartLine.update({ where: { id: l.id }, data: { unitPriceSnapshot: p.unitPrice, promotionIdSnapshot: p.promotion?.id ?? null } });
      }
    }
    return this.getCart(userId);
  }
}
