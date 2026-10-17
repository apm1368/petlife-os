import { Injectable } from "@nestjs/common";
import { PromotionDiscountType, PromotionScope, PromotionStatus, type Prisma, type Promotion } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";

export interface PricingSubject {
  offerId: string;
  priceAmount: number;
  sellerOrganizationId: string;
  productId: string;
  categoryId: string;
}

export interface EffectivePrice {
  offerId: string;
  /** The seller's current price — the legitimate "original" price. */
  listUnitPrice: number;
  /** What the customer pays per unit now. */
  unitPrice: number;
  unitDiscount: number;
  promotion: { id: string; name: string; endsAt: string | null; fundedBy: string } | null;
}

type Client = PrismaService | Prisma.TransactionClient;

/** Categories include their descendants: a "Food" promotion applies to "Dog food". */
async function categoryAncestors(client: Client, categoryIds: string[]): Promise<Map<string, Set<string>>> {
  const all = await client.productCategory.findMany({ select: { id: true, parentId: true } });
  const parent = new Map(all.map((c) => [c.id, c.parentId]));
  const out = new Map<string, Set<string>>();
  for (const id of categoryIds) {
    const chain = new Set<string>();
    let cur: string | null | undefined = id;
    for (let guard = 0; cur && guard < 20; guard++) {
      chain.add(cur);
      cur = parent.get(cur);
    }
    out.set(id, chain);
  }
  return out;
}

export function promotionDiscount(promotion: Pick<Promotion, "discountType" | "value" | "maxDiscountAmount">, unitPrice: number): number {
  const raw = promotion.discountType === PromotionDiscountType.PERCENT ? Math.floor((unitPrice * promotion.value) / 100) : promotion.value;
  const capped = promotion.maxDiscountAmount ? Math.min(raw, promotion.maxDiscountAmount) : raw;
  // A promotion can never make an item free or negative.
  return Math.max(0, Math.min(capped, unitPrice - 1));
}

/**
 * The single server-side pricing authority for products. Every price the customer sees in search,
 * product detail, cart, checkout and repeat delivery comes from here; no client-sent price, discount
 * or total is ever trusted. Promotions are automatic and non-stacking: the one giving the largest
 * discount applies (ties: earliest end, then id). Seller-owned promotions only touch that seller's offers.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async activePromotions(client: Client = this.prisma, now = new Date()): Promise<Promotion[]> {
    const rows = await client.promotion.findMany({
      where: { status: PromotionStatus.ACTIVE, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], scope: { not: PromotionScope.SERVICE } },
    });
    return rows.filter((p) => p.usageLimit === null || p.usageCount < p.usageLimit);
  }

  async price(subjects: PricingSubject[], client: Client = this.prisma, now = new Date()): Promise<Map<string, EffectivePrice>> {
    const promotions = await this.activePromotions(client, now);
    const ancestors = promotions.some((p) => p.scope === PromotionScope.CATEGORY) ? await categoryAncestors(client, [...new Set(subjects.map((s) => s.categoryId))]) : new Map<string, Set<string>>();
    const result = new Map<string, EffectivePrice>();
    for (const s of subjects) {
      let best: { promotion: Promotion; discount: number } | null = null;
      for (const p of promotions) {
        if (p.ownerSellerOrganizationId && p.ownerSellerOrganizationId !== s.sellerOrganizationId) continue;
        const applies =
          p.scope === PromotionScope.ALL ||
          (p.scope === PromotionScope.PRODUCT && p.productIds.includes(s.productId)) ||
          (p.scope === PromotionScope.SELLER && p.sellerOrganizationIds.includes(s.sellerOrganizationId)) ||
          (p.scope === PromotionScope.CATEGORY && p.categoryIds.some((c) => ancestors.get(s.categoryId)?.has(c)));
        if (!applies) continue;
        const discount = promotionDiscount(p, s.priceAmount);
        if (discount <= 0) continue;
        const better =
          !best ||
          discount > best.discount ||
          (discount === best.discount && (p.endsAt?.getTime() ?? Infinity) < (best.promotion.endsAt?.getTime() ?? Infinity)) ||
          (discount === best.discount && (p.endsAt?.getTime() ?? Infinity) === (best.promotion.endsAt?.getTime() ?? Infinity) && p.id < best.promotion.id);
        if (better) best = { promotion: p, discount };
      }
      result.set(s.offerId, {
        offerId: s.offerId,
        listUnitPrice: s.priceAmount,
        unitPrice: s.priceAmount - (best?.discount ?? 0),
        unitDiscount: best?.discount ?? 0,
        promotion: best ? { id: best.promotion.id, name: best.promotion.name, endsAt: best.promotion.endsAt?.toISOString() ?? null, fundedBy: best.promotion.fundedBy } : null,
      });
    }
    return result;
  }
}
