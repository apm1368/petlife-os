import { Injectable } from "@nestjs/common";
import { Prisma, ProductStatus, SellerOfferStatus, SellerStatus, SellerVerificationStatus, type PetSpecies } from "@prisma/client";
import type { ProductCategoryDto, ProductDetailDto, ProductSummaryDto, SellerOfferDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { toBrandDto, toCategoryDto, toSellerOfferDto, toVariantDto } from "../commerce-dto.mapper";
import { ProductCompatibilityService } from "./product-compatibility.service";

const OFFER_INCLUDE = {
  sellerOrganization: true,
  inventoryItem: true,
} satisfies Prisma.SellerOfferInclude;

const ACTIVE_OFFER_WHERE = {
  status: SellerOfferStatus.ACTIVE,
  sellerOrganization: { verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE },
} satisfies Prisma.SellerOfferWhereInput;

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  variants: {
    where: { isActive: true },
    include: { offers: { where: ACTIVE_OFFER_WHERE, include: OFFER_INCLUDE } },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/**
 * Product discovery + detail (spec sections 14-16). Only VERIFIED + ACTIVE
 * sellers' ACTIVE offers are ever surfaced (spec section 3) — an
 * unverified/paused/suspended seller's offer simply never appears, the same
 * "only VERIFIED providers appear by default" precedent from
 * ProvidersService (Handoff 03/04). A missing Active Pet never blocks
 * browsing (spec section 16) — compatibility is just omitted (`null`).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compatibility: ProductCompatibilityService,
    private readonly events: DomainEventsService,
  ) {}

  async listCategories(): Promise<ProductCategoryDto[]> {
    const categories = await this.prisma.productCategory.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
    return categories.map(toCategoryDto);
  }

  async search(userId: string, filter: { category?: string; species?: PetSpecies; search?: string; petId?: string }): Promise<ProductSummaryDto[]> {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      ...(filter.category ? { categoryId: filter.category } : {}),
      ...(filter.search ? { title: { contains: filter.search, mode: "insensitive" } } : {}),
      ...(filter.species === "DOG" ? { supportsDog: true } : filter.species === "CAT" ? { supportsCat: true } : {}),
    };

    const [products, pet] = await Promise.all([
      this.prisma.product.findMany({ where, include: PRODUCT_INCLUDE, orderBy: { title: "asc" } }),
      filter.petId ? this.prisma.pet.findUnique({ where: { id: filter.petId } }) : Promise.resolve(null),
    ]);

    const results: ProductSummaryDto[] = [];
    for (const product of products) {
      results.push(await this.toSummaryDto(product, pet, userId));
    }
    return results;
  }

  private async toSummaryDto(product: ProductWithRelations, pet: Prisma.PetGetPayload<Record<string, never>> | null, userId: string): Promise<ProductSummaryDto> {
    const allOffers = product.variants.flatMap((v) => v.offers.map((o) => ({ offer: o, variant: v })));
    const cheapest = allOffers.reduce<(typeof allOffers)[number] | null>((best, current) => {
      if (!best || current.offer.priceAmount < best.offer.priceAmount) return current;
      return best;
    }, null);

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      brand: product.brand ? toBrandDto(product.brand) : null,
      category: toCategoryDto(product.category),
      variantId: cheapest?.variant.id ?? product.variants[0]?.id ?? "",
      variantTitle: cheapest?.variant.title ?? product.variants[0]?.title ?? null,
      bestOffer: cheapest ? toSellerOfferDto(cheapest.offer) : null,
      compatibility: pet ? await this.compatibility.evaluate(pet, product, userId) : null,
    };
  }

  async getDetail(userId: string, productId: string, petId?: string): Promise<ProductDetailDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundApiException("Product");

    const pet = petId ? await this.prisma.pet.findUnique({ where: { id: petId } }) : null;
    const compatibility = pet ? await this.compatibility.evaluate(pet, product, userId) : null;

    await this.events.publish("ProductViewed", { productId, petId: petId ?? null });

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      brand: product.brand ? toBrandDto(product.brand) : null,
      category: toCategoryDto(product.category),
      status: product.status as unknown as ProductDetailDto["status"],
      variants: product.variants.map(toVariantDto),
      offers: product.variants.flatMap((v) => v.offers.map(toSellerOfferDto)),
      compatibility,
    };
  }

  async getOffers(productId: string): Promise<SellerOfferDto[]> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundApiException("Product");
    return product.variants.flatMap((v) => v.offers.map(toSellerOfferDto));
  }
}
