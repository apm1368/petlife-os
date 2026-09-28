import { Injectable } from "@nestjs/common";
import { Prisma, ProductReviewStatus, ProductStatus, SellerOfferStatus, SellerStatus, SellerVerificationStatus, type Pet, type PetSpecies } from "@prisma/client";
import type { ProductCategoryDto, ProductDetailDto, ProductSearchResultDto, ProductSummaryDto, RatingSummaryDto, SellerOfferDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { PetAccessService } from "../../pet-access/pet-access.service";
import { toBrandDto, toCategoryDto, toSellerOfferDto, toVariantDto } from "../commerce-dto.mapper";
import { PricingService, type EffectivePrice } from "../promotions/pricing.service";
import { ProductCompatibilityService } from "./product-compatibility.service";

const OFFER_INCLUDE = {
  sellerOrganization: true,
  inventoryItem: true,
} satisfies Prisma.SellerOfferInclude;

export const ACTIVE_OFFER_WHERE = {
  status: SellerOfferStatus.ACTIVE,
  sellerOrganization: { verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE },
} satisfies Prisma.SellerOfferWhereInput;

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  media: { orderBy: { sortOrder: "asc" } },
  variants: {
    where: { isActive: true },
    include: { offers: { where: ACTIVE_OFFER_WHERE, include: OFFER_INCLUDE } },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;
type OfferRow = ProductWithRelations["variants"][number]["offers"][number];

export type ProductSort = "RECOMMENDED" | "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "TOP_RATED";

export interface ProductSearchFilter {
  category?: string;
  species?: PetSpecies;
  search?: string;
  petId?: string;
  brand?: string;
  seller?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onPromotion?: boolean;
  minRating?: number;
  attributes?: Record<string, string>;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

/** Bounded candidate set: computed price/rating filters run in memory over at most this many products. */
const MAX_CANDIDATES = 1000;
const PRIOR_RATING = 4;
const PRIOR_WEIGHT = 5;
const EMPTY_RATING: RatingSummaryDto = { average: null, count: 0 };

function available(o: OfferRow): boolean {
  return (o.inventoryItem?.onHand ?? 0) - (o.inventoryItem?.reserved ?? 0) > 0;
}

/**
 * Public catalog. Only ACTIVE products with at least one active offer from a verified, active seller
 * are discoverable; searchable fields are public ones only (title, brand, category, description) —
 * never seller notes, costs, inventory internals or moderation notes. Prices come from PricingService.
 *
 * RECOMMENDED order (documented, no paid placement): purchasable first, then Bayesian rating
 * (prior 4.0 weighted as 5 reviews), then review count, then an active promotion, then newest, then id.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compatibility: ProductCompatibilityService,
    private readonly events: DomainEventsService,
    private readonly pricing: PricingService,
    private readonly petAccess: PetAccessService,
  ) {}

  async listCategories(): Promise<ProductCategoryDto[]> {
    const categories = await this.prisma.productCategory.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
    return categories.map(toCategoryDto);
  }

  /** A pet's traits are used for compatibility only when the caller may see that pet; otherwise ignored (no IDOR). */
  private async visiblePet(userId: string | undefined, petId: string | undefined): Promise<Pet | null> {
    if (!petId || !userId) return null;
    const access = await this.petAccess.getEffectivePermissions(petId, userId);
    if (!access?.canViewIdentity) return null;
    return this.prisma.pet.findUnique({ where: { id: petId } });
  }

  private async descendantCategoryIds(categoryId: string): Promise<string[]> {
    const all = await this.prisma.productCategory.findMany({ where: { status: "ACTIVE" }, select: { id: true, parentId: true } });
    const out = new Set([categoryId]);
    for (let changed = true; changed; ) {
      changed = false;
      for (const c of all) {
        if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
          out.add(c.id);
          changed = true;
        }
      }
    }
    return [...out];
  }

  async ratings(productIds: string[]): Promise<Map<string, RatingSummaryDto>> {
    if (!productIds.length) return new Map();
    const rows = await this.prisma.productReview.groupBy({ by: ["productId"], where: { productId: { in: productIds }, status: ProductReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.productId, { average: r._avg.rating === null ? null : Math.round(r._avg.rating * 10) / 10, count: r._count._all }]));
  }

  private priceOffers(products: ProductWithRelations[]): Promise<Map<string, EffectivePrice>> {
    return this.pricing.price(products.flatMap((p) => p.variants.flatMap((v) => v.offers.map((o) => ({ offerId: o.id, priceAmount: o.priceAmount, sellerOrganizationId: o.sellerOrganizationId, productId: p.id, categoryId: p.categoryId })))));
  }

  /** Default offer: available first, then the lowest price the customer actually pays, then offer id. */
  private defaultOffer(product: ProductWithRelations, prices: Map<string, EffectivePrice>): { offer: OfferRow; variantId: string } | null {
    const candidates = product.variants.flatMap((v) => v.offers.map((offer) => ({ offer, variantId: v.id })));
    candidates.sort(
      (a, b) =>
        Number(available(b.offer)) - Number(available(a.offer)) ||
        (prices.get(a.offer.id)?.unitPrice ?? a.offer.priceAmount) - (prices.get(b.offer.id)?.unitPrice ?? b.offer.priceAmount) ||
        a.offer.id.localeCompare(b.offer.id),
    );
    return candidates[0] ?? null;
  }

  private async toSummary(product: ProductWithRelations, prices: Map<string, EffectivePrice>, rating: RatingSummaryDto, pet: Pet | null, userId: string | undefined): Promise<ProductSummaryDto> {
    const best = this.defaultOffer(product, prices);
    const bestOffer = best ? toSellerOfferDto(best.offer, prices.get(best.offer.id)) : null;
    const variant = product.variants.find((v) => v.id === best?.variantId) ?? product.variants[0];
    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      brand: product.brand ? toBrandDto(product.brand) : null,
      category: toCategoryDto(product.category),
      variantId: variant?.id ?? "",
      variantTitle: variant?.title ?? null,
      bestOffer,
      compatibility: pet ? await this.compatibility.evaluate(pet, product, userId) : null,
      imageUrl: product.media.find((m) => !m.variantId)?.url ?? product.media[0]?.url ?? null,
      stockState: bestOffer?.stockState ?? "OUT_OF_STOCK",
      rating,
      supportsDog: product.supportsDog,
      supportsCat: product.supportsCat,
    };
  }

  async search(userId: string | undefined, filter: ProductSearchFilter): Promise<ProductSearchResultDto> {
    const categoryIds = filter.category ? await this.descendantCategoryIds(filter.category) : null;
    const q = filter.search?.trim();
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      variants: { some: { isActive: true, offers: { some: { ...ACTIVE_OFFER_WHERE, ...(filter.seller ? { sellerOrganizationId: filter.seller } : {}) } } } },
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(filter.brand ? { brandId: filter.brand } : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { brand: { name: { contains: q, mode: "insensitive" } } }, { category: { name: { contains: q, mode: "insensitive" } } }] }
        : {}),
      ...(filter.species === "DOG" ? { supportsDog: true } : filter.species === "CAT" ? { supportsCat: true } : {}),
    };
    const [products, pet] = await Promise.all([
      this.prisma.product.findMany({ where, include: PRODUCT_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: MAX_CANDIDATES }),
      this.visiblePet(userId, filter.petId),
    ]);
    const [prices, ratings] = await Promise.all([this.priceOffers(products), this.ratings(products.map((p) => p.id))]);

    const attributeFilter = Object.entries(filter.attributes ?? {}).filter(([, v]) => v);
    type Row = { product: ProductWithRelations; price: number | null; available: boolean; promoted: boolean; rating: RatingSummaryDto };
    let rows: Row[] = [];
    for (const product of products) {
      const variants = attributeFilter.length ? product.variants.filter((v) => attributeFilter.every(([k, val]) => (v.attributes as Record<string, string> | null)?.[k] === val)) : product.variants;
      const offers = variants.flatMap((v) => v.offers).filter((o) => !filter.seller || o.sellerOrganizationId === filter.seller);
      if (!offers.length) continue;
      const availableOffers = offers.filter(available);
      const priced = (availableOffers.length ? availableOffers : offers).map((o) => prices.get(o.id)!);
      rows.push({
        product,
        price: priced.length ? Math.min(...priced.map((p) => p.unitPrice)) : null,
        available: availableOffers.length > 0,
        promoted: priced.some((p) => p.unitDiscount > 0),
        rating: ratings.get(product.id) ?? EMPTY_RATING,
      });
    }

    // Facets reflect the query before price/stock/rating/promotion narrowing, from structured data only.
    const brandCounts = new Map<string, { id: string; name: string; count: number }>();
    const sellerCounts = new Map<string, { id: string; name: string; count: number }>();
    const attributeValues = new Map<string, Set<string>>();
    for (const { product } of rows) {
      if (product.brand) brandCounts.set(product.brand.id, { id: product.brand.id, name: product.brand.name, count: (brandCounts.get(product.brand.id)?.count ?? 0) + 1 });
      const sellers = new Map(product.variants.flatMap((v) => v.offers.map((o) => [o.sellerOrganizationId, o.sellerOrganization.name] as const)));
      for (const [id, name] of sellers) sellerCounts.set(id, { id, name, count: (sellerCounts.get(id)?.count ?? 0) + 1 });
      for (const v of product.variants) {
        for (const [k, val] of Object.entries((v.attributes as Record<string, unknown> | null) ?? {})) {
          if (typeof val === "string") attributeValues.set(k, (attributeValues.get(k) ?? new Set<string>()).add(val));
        }
      }
    }
    const pricesSeen = rows.map((r) => r.price).filter((p): p is number => p !== null);

    rows = rows.filter(
      (r) =>
        (filter.minPrice === undefined || (r.price !== null && r.price >= filter.minPrice)) &&
        (filter.maxPrice === undefined || (r.price !== null && r.price <= filter.maxPrice)) &&
        (!filter.inStock || r.available) &&
        (!filter.onPromotion || r.promoted) &&
        (filter.minRating === undefined || (r.rating.average !== null && r.rating.average >= filter.minRating)),
    );

    const bayes = (r: RatingSummaryDto) => (PRIOR_RATING * PRIOR_WEIGHT + (r.average ?? 0) * r.count) / (PRIOR_WEIGHT + r.count);
    const byId = (a: Row, b: Row) => a.product.id.localeCompare(b.product.id);
    const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
    rows.sort((a, b) => {
      switch (filter.sort ?? "RECOMMENDED") {
        case "NEWEST":
          return b.product.createdAt.getTime() - a.product.createdAt.getTime() || byId(a, b);
        case "PRICE_ASC":
          return nullsLast(a.price, b.price) || byId(a, b);
        case "PRICE_DESC":
          return nullsLast(a.price === null ? null : -a.price, b.price === null ? null : -b.price) || byId(a, b);
        case "TOP_RATED":
          return nullsLast(a.rating.average === null ? null : -a.rating.average, b.rating.average === null ? null : -b.rating.average) || b.rating.count - a.rating.count || byId(a, b);
        default:
          return (
            Number(b.available) - Number(a.available) ||
            bayes(b.rating) - bayes(a.rating) ||
            b.rating.count - a.rating.count ||
            Number(b.promoted) - Number(a.promoted) ||
            b.product.createdAt.getTime() - a.product.createdAt.getTime() ||
            byId(a, b)
          );
      }
    });

    const pageSize = Math.min(Math.max(filter.pageSize ?? 24, 1), 60);
    const page = Math.max(filter.page ?? 1, 1);
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);
    const items = await Promise.all(slice.map((r) => this.toSummary(r.product, prices, r.rating, pet, userId)));
    return {
      items,
      total: rows.length,
      page,
      pageSize,
      facets: {
        brands: [...brandCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        sellers: [...sellerCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        attributes: [...attributeValues.entries()].map(([key, values]) => ({ key, values: [...values].sort() })).sort((a, b) => a.key.localeCompare(b.key)),
        priceRange: pricesSeen.length ? { min: Math.min(...pricesSeen), max: Math.max(...pricesSeen) } : null,
      },
    };
  }

  async getDetail(userId: string | undefined, productId: string, petId?: string): Promise<ProductDetailDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    // Draft, inactive and archived products are not public.
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundApiException("Product");

    const [pet, prices, ratings, reviews, favorite, relatedRows] = await Promise.all([
      this.visiblePet(userId, petId),
      this.priceOffers([product]),
      this.ratings([product.id]),
      this.prisma.productReview.findMany({
        where: { productId, status: ProductReviewStatus.PUBLISHED },
        include: { user: { select: { displayName: true } }, productVariant: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      userId ? this.prisma.productFavorite.findUnique({ where: { userId_productId: { userId, productId } } }) : Promise.resolve(null),
      this.prisma.product.findMany({
        where: { status: ProductStatus.ACTIVE, categoryId: product.categoryId, id: { not: product.id }, variants: { some: { isActive: true, offers: { some: ACTIVE_OFFER_WHERE } } } },
        include: PRODUCT_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 6,
      }),
    ]);
    const compatibility = pet ? await this.compatibility.evaluate(pet, product, userId) : null;
    const [relatedPrices, relatedRatings] = await Promise.all([this.priceOffers(relatedRows), this.ratings(relatedRows.map((r) => r.id))]);
    const related = await Promise.all(relatedRows.map((r) => this.toSummary(r, relatedPrices, relatedRatings.get(r.id) ?? EMPTY_RATING, null, userId)));

    await this.events.publish("ProductViewed", { productId, petId: pet?.id ?? null });

    const specs = Array.isArray(product.specifications)
      ? (product.specifications as { label?: unknown; value?: unknown }[]).filter((s) => typeof s.label === "string" && typeof s.value === "string").map((s) => ({ label: s.label as string, value: s.value as string }))
      : [];
    const def = this.defaultOffer(product, prices);
    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      brand: product.brand ? toBrandDto(product.brand) : null,
      category: toCategoryDto(product.category),
      status: product.status as unknown as ProductDetailDto["status"],
      variants: product.variants.map(toVariantDto),
      offers: product.variants.flatMap((v) => v.offers.map((o) => toSellerOfferDto(o, prices.get(o.id)))),
      compatibility,
      media: product.media.map((m) => ({ id: m.id, url: m.url, alt: m.alt, variantId: m.variantId })),
      specifications: specs,
      defaultOfferId: def?.offer.id ?? null,
      rating: ratings.get(product.id) ?? EMPTY_RATING,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        authorName: (r.user.displayName ?? "").trim().split(/\s+/)[0] || "—",
        variantTitle: r.productVariant.title,
        verifiedPurchase: true as const,
        createdAt: r.createdAt.toISOString(),
      })),
      related,
      favorited: Boolean(favorite),
      supportsDog: product.supportsDog,
      supportsCat: product.supportsCat,
      minAgeMonths: product.minAgeMonths,
      maxAgeMonths: product.maxAgeMonths,
      minWeightKg: product.minWeightKg === null ? null : Number(product.minWeightKg),
      maxWeightKg: product.maxWeightKg === null ? null : Number(product.maxWeightKg),
    };
  }

  /** Summaries for known ids (favorites, repeat delivery), in the given order; non-public products are skipped. */
  async summariesByIds(userId: string | undefined, productIds: string[]): Promise<ProductSummaryDto[]> {
    if (productIds.length === 0) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: productIds }, status: ProductStatus.ACTIVE }, include: PRODUCT_INCLUDE });
    const [prices, ratings] = await Promise.all([this.priceOffers(rows), this.ratings(rows.map((r) => r.id))]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = productIds.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => Boolean(r));
    return Promise.all(ordered.map((r) => this.toSummary(r, prices, ratings.get(r.id) ?? EMPTY_RATING, null, userId)));
  }

  async getOffers(productId: string): Promise<SellerOfferDto[]> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundApiException("Product");
    const prices = await this.priceOffers([product]);
    return product.variants.flatMap((v) => v.offers.map((o) => toSellerOfferDto(o, prices.get(o.id))));
  }
}
