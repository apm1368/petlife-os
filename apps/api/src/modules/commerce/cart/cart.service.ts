import { Injectable } from "@nestjs/common";
import { CartStatus, Prisma, SellerOfferStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { ProductCompatibilityStatus, type CartDto, type CartLineDto, type CartSellerGroupDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { NotFoundApiException, OfferNotAvailableException, PetAccessDeniedException } from "../../../common/errors/api-exception";
import { HouseholdsService } from "../../households/households.service";
import { PetAccessService } from "../../pet-access/pet-access.service";
import { toSellerOfferDto } from "../commerce-dto.mapper";
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
  ) {}

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
    const offer = await this.prisma.sellerOffer.findUnique({ where: { id: dto.offerId }, include: { sellerOrganization: true, productVariant: true } });
    if (!offer) throw new NotFoundApiException("Offer");
    if (
      offer.status !== SellerOfferStatus.ACTIVE ||
      offer.sellerOrganization.verificationStatus !== SellerVerificationStatus.VERIFIED ||
      offer.sellerOrganization.status !== SellerStatus.ACTIVE
    ) {
      throw new OfferNotAvailableException({ offerId: dto.offerId });
    }

    if (dto.targetPetId) await this.assertPetAccessible(userId, dto.targetPetId);

    const cart = await this.getOrCreateActiveCart(userId);

    const existingLine = await this.prisma.cartLine.findFirst({
      where: { cartId: cart.id, sellerOfferId: dto.offerId, targetPetId: dto.targetPetId ?? null },
    });

    if (existingLine) {
      await this.prisma.cartLine.update({
        where: { id: existingLine.id },
        data: { quantity: existingLine.quantity + dto.quantity, unitPriceSnapshot: offer.priceAmount, currency: offer.currency },
      });
      await this.events.publish("CartItemUpdated", { cartId: cart.id, cartLineId: existingLine.id }, { aggregateType: "Cart", aggregateId: cart.id });
    } else {
      const created = await this.prisma.cartLine.create({
        data: {
          cartId: cart.id,
          sellerOfferId: dto.offerId,
          targetPetId: dto.targetPetId ?? null,
          quantity: dto.quantity,
          unitPriceSnapshot: offer.priceAmount,
          currency: offer.currency,
        },
      });
      await this.events.publish("CartItemAdded", { cartId: cart.id, cartLineId: created.id, offerId: dto.offerId }, { aggregateType: "Cart", aggregateId: cart.id });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, lineId: string, dto: UpdateCartItemDto) {
    const line = await this.loadOwnedLine(userId, lineId);
    await this.prisma.cartLine.update({ where: { id: line.id }, data: { quantity: dto.quantity } });
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

  private async loadOwnedLine(userId: string, lineId: string): Promise<{ id: string; cartId: string }> {
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
      return { id: "", status: CartStatus.ACTIVE as unknown as CartDto["status"], sellerGroups: [], totalItems: 0, subtotalAmount: 0, currency: "IRR", hasSafetyConflict: false };
    }

    const lineDtos: (CartLineDto & { sellerOrgId: string })[] = [];
    for (const line of cart.lines) {
      lineDtos.push(await this.toLineDto(line, userId));
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

    return {
      id: cart.id,
      status: cart.status as unknown as CartDto["status"],
      sellerGroups,
      totalItems,
      subtotalAmount,
      currency: lineDtos[0]?.currency ?? "IRR",
      hasSafetyConflict,
    };
  }

  private async toLineDto(line: CartLineRow, userId: string): Promise<CartLineDto & { sellerOrgId: string }> {
    const product = line.sellerOffer.productVariant.product;
    const currentPriceAmount = line.sellerOffer.priceAmount;
    let compatibility = null;
    if (line.targetPet) {
      compatibility = await this.compatibility.evaluate(line.targetPet, product, userId);
    }

    return {
      id: line.id,
      sellerOffer: toSellerOfferDto(line.sellerOffer),
      sellerOrgId: line.sellerOffer.sellerOrganizationId,
      productId: product.id,
      productTitle: product.title,
      variantTitle: line.sellerOffer.productVariant.title,
      variantSku: line.sellerOffer.productVariant.sku,
      targetPetId: line.targetPetId,
      targetPetName: line.targetPet?.name ?? null,
      quantity: line.quantity,
      unitPriceSnapshot: line.unitPriceSnapshot,
      currentPriceAmount,
      priceChanged: currentPriceAmount !== line.unitPriceSnapshot,
      currency: line.currency,
      lineTotal: currentPriceAmount * line.quantity,
      compatibility,
    };
  }
}
