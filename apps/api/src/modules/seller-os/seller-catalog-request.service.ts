import { Injectable } from "@nestjs/common";
import { Prisma, SellerMembershipRole } from "@prisma/client";
import { ApiException, NotFoundApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import type { CreateCatalogProductRequestDto } from "./dto/catalog-product-request.dto";

const canManageCatalog = new Set<SellerMembershipRole>([SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN, SellerMembershipRole.CATALOG_MANAGER]);
function normalizeTitle(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase(); }

@Injectable()
export class SellerCatalogRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ResolvedSellerContext) {
    if (!canManageCatalog.has(ctx.role)) throw new ApiException("SELLER_CATALOG_PERMISSION_REQUIRED", "Catalog manager permission is required.", 403);
    return this.prisma.catalogProductRequest.findMany({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, requestedTitle: true, brandName: true, description: true, specifications: true, sourceUrl: true, sourceName: true, status: true, decisionReason: true, resolvedProductId: true, createdAt: true, reviewedAt: true } });
  }

  async create(ctx: ResolvedSellerContext, input: CreateCatalogProductRequestDto) {
    if (!canManageCatalog.has(ctx.role)) throw new ApiException("SELLER_CATALOG_PERMISSION_REQUIRED", "Catalog manager permission is required.", 403);
    if (input.categoryId && !(await this.prisma.productCategory.findFirst({ where: { id: input.categoryId, status: "ACTIVE" }, select: { id: true } }))) throw new NotFoundApiException("Active product category", { categoryId: input.categoryId });
    const normalizedTitle = normalizeTitle(input.requestedTitle);
    try { return await this.prisma.catalogProductRequest.create({ data: {
      sellerOrganizationId: ctx.sellerOrganizationId, requestedByUserId: ctx.userId,
      categoryId: input.categoryId ?? null, requestedTitle: input.requestedTitle.trim(), normalizedTitle, brandName: input.brandName?.trim() || null,
      description: input.description?.trim() || null,
      specifications: input.specifications === undefined ? Prisma.JsonNull : input.specifications as Prisma.InputJsonValue,
      sourceUrl: input.sourceUrl?.trim() || null, sourceName: input.sourceName?.trim() || null,
    }, select: { id: true, requestedTitle: true, brandName: true, status: true, createdAt: true } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiException("CATALOG_REQUEST_ALREADY_PENDING", "A request for this product is already awaiting review.", 409);
      throw error;
    }
  }
}
