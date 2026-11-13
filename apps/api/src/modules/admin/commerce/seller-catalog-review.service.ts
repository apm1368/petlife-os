import { HttpStatus, Injectable } from "@nestjs/common";
import { CatalogProductRequestStatus, Prisma, ProductStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ApiException, NotFoundApiException } from "../../../common/errors/api-exception";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const PAGE_LIMIT = 50;
function normalizeTitle(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
function slugFor(title: string) {
  const ascii = title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  return `${ascii || "catalog-product"}-${randomUUID().slice(0, 8)}`;
}

@Injectable()
export class SellerCatalogReviewService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AdminAuditLogService) {}

  async listPending() {
    const rows = await this.prisma.catalogProductRequest.findMany({ where: { status: CatalogProductRequestStatus.PENDING_REVIEW }, orderBy: { createdAt: "asc" }, take: PAGE_LIMIT, include: { sellerOrganization: { select: { id: true, name: true } }, requestedByUser: { select: { id: true, displayName: true } }, category: { select: { id: true, name: true } } } });
    return Promise.all(rows.map(async row => {
      const candidates = await this.findDuplicateCandidates(row.requestedTitle);
      return { ...row, duplicateCandidates: candidates };
    }));
  }

  /** Decided requests, newest decision first: what was asked, by which shop, the outcome, who decided and why. */
  async listDecided() {
    const rows = await this.prisma.catalogProductRequest.findMany({
      where: { status: { not: CatalogProductRequestStatus.PENDING_REVIEW } },
      orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
      take: PAGE_LIMIT,
      include: {
        sellerOrganization: { select: { id: true, name: true } },
        requestedByUser: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true } },
        resolvedProduct: { select: { id: true, title: true } },
        reviewedByAdmin: { select: { user: { select: { displayName: true } } } },
      },
    });
    return rows.map(({ reviewedByAdmin, ...row }) => ({ ...row, reviewedByName: reviewedByAdmin?.user.displayName ?? null, duplicateCandidates: [] as Array<{ id: string; title: string; slug: string; status: string; brand: { name: string } | null }> }));
  }

  async matchExisting(admin: ResolvedAdminContext, requestId: string, productId: string, reason: string, requestIdHeader?: string) {
    const request = await this.pendingRequest(requestId);
    const candidates = await this.findDuplicateCandidates(request.requestedTitle);
    if (!candidates.some((candidate) => candidate.id === productId)) throw new ApiException("PRODUCT_NOT_A_DUPLICATE_CANDIDATE", "Choose a product from the current duplicate-candidate list.", HttpStatus.BAD_REQUEST);
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true, status: true } });
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundApiException("Active catalog product", { productId });
    return this.prisma.$transaction(async tx => {
      const changed = await tx.catalogProductRequest.updateMany({ where: { id: request.id, status: CatalogProductRequestStatus.PENDING_REVIEW }, data: { status: CatalogProductRequestStatus.MATCHED_EXISTING, resolvedProductId: product.id, reviewedByAdminId: admin.adminUserId, reviewedAt: new Date(), decisionReason: reason.trim(), duplicateReview: { action: "MATCH_EXISTING", productId: product.id, productTitle: product.title } } });
      if (!changed.count) throw this.alreadyReviewed(requestId);
      const result = await tx.catalogProductRequest.findUniqueOrThrow({ where: { id: requestId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "seller_catalog_request.matched_existing", entityType: "CATALOG_PRODUCT_REQUEST", entityId: requestId, reason: reason.trim(), beforeSummary: { status: "PENDING_REVIEW" }, afterSummary: { status: result.status, resolvedProductId: product.id }, requestId: requestIdHeader, tx });
      return result;
    });
  }

  async reject(admin: ResolvedAdminContext, requestId: string, reason: string, requestIdHeader?: string) {
    const request = await this.pendingRequest(requestId);
    return this.prisma.$transaction(async tx => {
      const changed = await tx.catalogProductRequest.updateMany({ where: { id: request.id, status: CatalogProductRequestStatus.PENDING_REVIEW }, data: { status: CatalogProductRequestStatus.REJECTED, reviewedByAdminId: admin.adminUserId, reviewedAt: new Date(), decisionReason: reason.trim() } });
      if (!changed.count) throw this.alreadyReviewed(requestId);
      const result = await tx.catalogProductRequest.findUniqueOrThrow({ where: { id: requestId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "seller_catalog_request.rejected", entityType: "CATALOG_PRODUCT_REQUEST", entityId: requestId, reason: reason.trim(), beforeSummary: { status: "PENDING_REVIEW" }, afterSummary: { status: result.status }, requestId: requestIdHeader, tx });
      return result;
    });
  }

  async approveNew(admin: ResolvedAdminContext, requestId: string, categoryId: string, reason: string, reviewedDuplicateProductIds: string[], requestIdHeader?: string) {
    const request = await this.pendingRequest(requestId);
    const category = await this.prisma.productCategory.findFirst({ where: { id: categoryId, status: "ACTIVE" }, select: { id: true } });
    if (!category) throw new NotFoundApiException("Active product category", { categoryId });
    const candidates = await this.findDuplicateCandidates(request.requestedTitle);
    const reviewed = [...new Set(reviewedDuplicateProductIds)].sort();
    const current = candidates.map((candidate) => candidate.id).sort();
    if (JSON.stringify(reviewed) !== JSON.stringify(current)) throw new ApiException("DUPLICATE_REVIEW_REQUIRED", "Review the current duplicate candidates before creating a catalog product.", HttpStatus.BAD_REQUEST, { currentCandidateIds: current });
    // Recheck exact-title collisions inside the decision path; when one exists, the reviewer must use Match Existing.
    const exact = candidates[0] ?? null;
    if (exact) throw new ApiException("POSSIBLE_DUPLICATE_REQUIRES_MATCH", "An exact-title product exists. Match the request to that product instead.", HttpStatus.CONFLICT, { productId: exact.id });
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizeTitle(request.requestedTitle)}))`;
      const collision = await tx.product.findFirst({ where: { title: { equals: request.requestedTitle.trim(), mode: "insensitive" } }, select: { id: true } });
      if (collision) throw new ApiException("POSSIBLE_DUPLICATE_REQUIRES_MATCH", "An exact-title product now exists. Match the request to that product instead.", HttpStatus.CONFLICT, { productId: collision.id });
      const changed = await tx.catalogProductRequest.updateMany({ where: { id: request.id, status: CatalogProductRequestStatus.PENDING_REVIEW }, data: { status: CatalogProductRequestStatus.APPROVED, reviewedByAdminId: admin.adminUserId, reviewedAt: new Date(), decisionReason: reason.trim(), categoryId, duplicateReview: { action: "CREATE_NEW", completedBy: admin.adminUserId, checkedCandidateIds: reviewed, exactTitleCollision: false } } });
      if (!changed.count) throw this.alreadyReviewed(requestId);
      const brand = request.brandName ? await tx.brand.findFirst({ where: { name: { equals: request.brandName.trim(), mode: "insensitive" }, status: "ACTIVE" }, select: { id: true } }) : null;
      const product = await tx.product.create({ data: {
        categoryId, brandId: brand?.id ?? null, title: request.requestedTitle.trim(), slug: slugFor(request.requestedTitle),
        description: request.description, specifications: request.specifications ?? Prisma.JsonNull,
        status: ProductStatus.ACTIVE, variants: { create: { sku: `REQ-${randomUUID()}`, title: null } },
        // Product identity only. No seller offer, price or stock is created by this decision.
      }, select: { id: true, title: true, slug: true, status: true } });
      const result = await tx.catalogProductRequest.update({ where: { id: requestId }, data: { resolvedProductId: product.id } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "seller_catalog_request.approved", entityType: "CATALOG_PRODUCT_REQUEST", entityId: requestId, reason: reason.trim(), beforeSummary: { status: "PENDING_REVIEW" }, afterSummary: { status: result.status, resolvedProductId: product.id, productSlug: product.slug }, requestId: requestIdHeader, tx });
      return { request: result, product };
    });
  }

  private async pendingRequest(id: string) {
    const request = await this.prisma.catalogProductRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundApiException("Catalog product request", { requestId: id });
    if (request.status !== CatalogProductRequestStatus.PENDING_REVIEW) throw this.alreadyReviewed(id);
    return request;
  }
  private findDuplicateCandidates(title: string) {
    return this.prisma.product.findMany({ where: { title: { equals: title.trim(), mode: "insensitive" } }, select: { id: true, title: true, slug: true, status: true, brand: { select: { name: true } }, _count: { select: { variants: true, imports: true } } }, take: 50, orderBy: [{ title: "asc" }, { id: "asc" }] });
  }
  private alreadyReviewed(id: string) { return new ApiException("CATALOG_REQUEST_ALREADY_REVIEWED", "This catalog request was already reviewed. Refresh the queue.", HttpStatus.CONFLICT, { requestId: id }); }
}
