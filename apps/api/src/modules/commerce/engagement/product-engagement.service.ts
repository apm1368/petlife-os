import { Injectable } from "@nestjs/common";
import { FulfillmentStatus, OrderStatus, Prisma, ProductReviewStatus, ProductStatus } from "@prisma/client";
import type { PaginatedDto, ProductReviewDto, ProductSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ApiException, NotFoundApiException, OrderNotFoundException } from "../../../common/errors/api-exception";
import { toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { CatalogService } from "../catalog/catalog.service";
import { HttpStatus } from "@nestjs/common";

export class ReviewNotAllowedException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("REVIEW_NOT_ALLOWED", "Only delivered purchases can be reviewed, once per item.", HttpStatus.CONFLICT, details);
  }
}

function firstName(displayName: string | null): string {
  return (displayName ?? "").trim().split(/\s+/)[0] || "—";
}

/**
 * Product reviews and favorites (Batch 4).
 *
 * A review is tied to one delivered OrderItem of the reviewer's own order
 * (unique per item), so every published review is a verified purchase and
 * nobody can review a product they did not receive. Only the first name is
 * ever shown. Trust & Safety can hide a review from Admin Commerce; hidden
 * reviews never count in the rating.
 */
@Injectable()
export class ProductEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly catalog: CatalogService,
  ) {}

  async createReview(userId: string, orderId: string, orderItemId: string, input: { rating: number; body?: string }): Promise<ProductReviewDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: { where: { id: orderItemId } } } });
    if (!order || order.userId !== userId) throw new OrderNotFoundException({ orderId });
    const item = order.items[0];
    if (!item) throw new NotFoundApiException("Order item", { orderItemId });
    if (order.status !== OrderStatus.CONFIRMED) throw new ReviewNotAllowedException({ orderId, reason: "ORDER_NOT_ACTIVE" });
    const fulfillment = await this.prisma.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } } });
    if (fulfillment?.status !== FulfillmentStatus.DELIVERED) throw new ReviewNotAllowedException({ orderId, reason: "NOT_DELIVERED" });

    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.productReview.create({
          data: { orderItemId, productId: item.productId, productVariantId: item.productVariantId, userId, rating: input.rating, body: input.body?.trim() || null },
          include: { user: { select: { displayName: true } }, productVariant: { select: { title: true } } },
        });
        await this.events.publish("ProductReviewCreated", { reviewId: created.id, productId: item.productId, rating: input.rating }, { tx, aggregateType: "Product", aggregateId: item.productId });
        return created;
      });
      return this.toDto(review);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ReviewNotAllowedException({ orderItemId, reason: "ALREADY_REVIEWED" });
      throw error;
    }
  }

  async listReviews(productId: string, page = 1, pageSize = 10): Promise<PaginatedDto<ProductReviewDto>> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { status: true } });
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundApiException("Product");
    const size = Math.min(Math.max(pageSize, 1), 50);
    const where = { productId, status: ProductReviewStatus.PUBLISHED };
    const [rows, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        include: { user: { select: { displayName: true } }, productVariant: { select: { title: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (Math.max(page, 1) - 1) * size,
        take: size,
      }),
      this.prisma.productReview.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => this.toDto(r)), total, Math.max(page, 1), size);
  }

  async setFavorite(userId: string, productId: string, favorite: boolean): Promise<{ productId: string; favorited: boolean }> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { status: true } });
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundApiException("Product");
    if (favorite) {
      await this.prisma.productFavorite.upsert({ where: { userId_productId: { userId, productId } }, create: { userId, productId }, update: {} });
    } else {
      await this.prisma.productFavorite.deleteMany({ where: { userId, productId } });
    }
    return { productId, favorited: favorite };
  }

  async listFavorites(userId: string): Promise<ProductSummaryDto[]> {
    const rows = await this.prisma.productFavorite.findMany({ where: { userId, product: { status: ProductStatus.ACTIVE } }, orderBy: { createdAt: "desc" }, take: 100, select: { productId: true } });
    return this.catalog.summariesByIds(userId, rows.map((r) => r.productId));
  }

  private toDto(r: { id: string; rating: number; body: string | null; createdAt: Date; user: { displayName: string | null }; productVariant: { title: string | null } }): ProductReviewDto {
    return { id: r.id, rating: r.rating, body: r.body, authorName: firstName(r.user.displayName), variantTitle: r.productVariant.title, verifiedPurchase: true, createdAt: r.createdAt.toISOString() };
  }
}
