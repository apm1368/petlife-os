import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ProductStatus, SellerMembershipRole, type Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import type { SellerCatalogDirectoryItemDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { excludeDemoRecordsFromPublicReads } from "../../common/public-record-origin";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerAuthGuard } from "./auth/seller-auth.guard";

class DirectoryQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) page?: number;
}

const PAGE_SIZE = 20;

/**
 * The product directory as a shop sees it when listing: every active catalog product and variant, whether or not
 * anyone sells it yet (the public shop search only shows products with a live offer, so it can't be used to make the
 * first one). The seller picks a variant here, then sets its own price and stock through the offers API; a product
 * that isn't in the directory goes through catalog-product-requests.
 */
@Controller("seller-organizations/:sellerId/catalog")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
@RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
export class SellerCatalogDirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("search")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async search(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: DirectoryQueryDto): Promise<{ items: SellerCatalogDirectoryItemDto[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const q = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      ...excludeDemoRecordsFromPublicReads(),
      status: ProductStatus.ACTIVE,
      variants: { some: { isActive: true } },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { brand: { name: { contains: q, mode: "insensitive" } } }, { variants: { some: { sku: { equals: q, mode: "insensitive" } } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          brand: { select: { name: true } },
          category: { select: { name: true } },
          media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          variants: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, sku: true, weightValue: true, weightUnit: true, offers: { where: { sellerOrganizationId: ctx.sellerOrganizationId }, select: { id: true, status: true }, take: 1 } },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((p) => ({
        productId: p.id,
        title: p.title,
        brandName: p.brand?.name ?? null,
        categoryName: p.category.name,
        imageUrl: p.media[0]?.url ?? null,
        variants: p.variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          weight: v.weightValue ? `${v.weightValue.toString()} ${v.weightUnit ?? "KG"}` : null,
          myOffer: v.offers[0] ? { id: v.offers[0].id, status: v.offers[0].status } : null,
        })),
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }
}
