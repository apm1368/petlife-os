import { HttpStatus, Injectable } from "@nestjs/common";
import {
  OrderRefundRequestStatus,
  OrderStatus,
  Prisma,
  ProductReviewStatus,
  ProductStatus,
  RepeatDeliveryStatus,
  SellerOfferModerationStatus,
  SellerOfferStatus,
  SellerStatus,
  SellerVerificationStatus,
  type FulfillmentStatus as PrismaFulfillmentStatus,
} from "@prisma/client";
import type {
  AdminCommerceAnalyticsDto,
  AdminCommerceOrderDetailDto,
  AdminCommerceOrderRowDto,
  AdminInventoryRowDto,
  AdminProductDetailDto,
  AdminProductOfferDto,
  AdminProductReviewRowDto,
  AdminProductRowDto,
  AdminRefundRequestDto,
  AdminSellerOfferModerationDto,
  AdminSellerRowDto,
  PaginatedDto,
  RefundStatus,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  ApiException,
  NotFoundApiException,
  OrderNotFoundException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import { assertObjectKeyUnder } from "../../../common/storage-keys/object-key.validator";
import { resolveObjectUrl } from "../../storage/object-url.util";
import { StorageService } from "../../storage/storage.service";
import { toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminRefundService } from "../finance/admin-refund.service";
import { orderNumberOf, toOrderItemDto } from "../../commerce/orders/orders.service";
import { toFulfillmentDto } from "../../commerce/logistics/logistics-dto.mapper";

export class RefundRequestDecisionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super(
      "REFUND_REQUEST_ALREADY_DECIDED",
      "This refund request has already been decided.",
      HttpStatus.CONFLICT,
      details,
    );
  }
}

export class SellerOfferModerationDecisionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super(
      "SELLER_OFFER_MODERATION_CHANGED",
      "This seller offer changed or was already reviewed. Refresh and try again.",
      HttpStatus.CONFLICT,
      details,
    );
  }
}

const PAGE_SIZE = 25;
const LOW_STOCK = 5;

function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "—";
}

function orderNumberSearch(q: string): string | null {
  const hex = q.trim().replace(/^PL-/i, "").replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{4,32}$/.test(hex) ? hex : null;
}

/**
 * Admin Commerce (Batch 4). Read access: commerce.view. Moderation
 * (product status, review visibility): commerce.manage. Refund-request
 * decisions: finance.refund.request — approving never moves money itself;
 * it opens the existing two-person AdminRefundApproval workflow, whose
 * execute step (finance.refund.execute) is the only path to the gateway.
 * Every mutation writes the admin audit log. Customer PII stays minimal:
 * first name and shipping city only.
 */
@Injectable()
export class AdminCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
    private readonly refundApprovals: AdminRefundService,
    private readonly storage: StorageService,
  ) {}

  // ----------------------------------------------------- repeat deliveries

  /** Members' repeat-delivery schedules (read-only for staff): what, how often, next run, and the last order made. */
  async listRepeatDeliveries(query: { status?: "ACTIVE" | "PAUSED" | "CANCELLED"; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.repeatDeliverySchedule.findMany({
        where,
        orderBy: [{ status: "asc" }, { nextCycleAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, displayName: true } },
          productVariant: { select: { title: true, product: { select: { id: true, title: true } } } },
          sellerOffer: { select: { sellerOrganization: { select: { id: true, name: true } } } },
          address: { select: { city: true } },
          lastOrder: { select: { id: true, status: true, createdAt: true } },
        },
      }),
      this.prisma.repeatDeliverySchedule.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        member: { id: r.user.id, displayName: r.user.displayName },
        product: { id: r.productVariant.product.id, title: r.productVariant.product.title, variant: r.productVariant.title },
        seller: r.sellerOffer.sellerOrganization,
        quantity: r.quantity,
        intervalDays: r.intervalDays,
        unitPrice: r.acceptedUnitPrice,
        city: r.address?.city ?? null,
        nextCycleAt: r.nextCycleAt.toISOString(),
        lastOrder: r.lastOrder,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  // ---------------------------------------------------------------- orders

  async listOrders(query: {
    status?: OrderStatus;
    sellerId?: string;
    q?: string;
    refundRequested?: boolean;
    from?: string;
    to?: string;
    page?: number;
  }): Promise<PaginatedDto<AdminCommerceOrderRowDto>> {
    const page = query.page ?? 1;
    const where: Prisma.OrderWhereInput = {
      checkoutId: { not: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.sellerId ? { sellerOrganizationId: query.sellerId } : {}),
      ...(query.refundRequested
        ? { refundRequests: { some: { status: OrderRefundRequestStatus.PENDING_REVIEW } } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    if (query.q) {
      const hex = orderNumberSearch(query.q);
      if (!hex) return toPaginatedDto([], 0, page, PAGE_SIZE);
      // Order numbers are the id's first hex digits; match on the id's text form.
      const ids = await this.prisma.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "orders" WHERE replace("id"::text, '-', '') LIKE ${hex + "%"} LIMIT 50`;
      where.id = { in: ids.map((r) => r.id) };
    }
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          sellerOrganization: { select: { id: true, name: true } },
          user: { select: { displayName: true } },
          items: { select: { quantity: true } },
          refundRequests: { select: { status: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);
    const fulfillments = await this.prisma.fulfillment.findMany({
      where: { orderId: { in: rows.map((r) => r.id) }, sequenceNumber: 1 },
      select: { orderId: true, status: true },
    });
    const fByOrder = new Map(fulfillments.map((f) => [f.orderId, f.status]));
    return toPaginatedDto(
      rows.map((o) => this.toRow(o, fByOrder.get(o.id) ?? null)),
      total,
      page,
      PAGE_SIZE,
    );
  }

  private toRow(
    o: {
      id: string;
      status: OrderStatus;
      totalAmount: number;
      discountAmount: number;
      currency: string;
      cancelledAt: Date | null;
      createdAt: Date;
      sellerOrganization: { id: string; name: string };
      user: { displayName: string | null } | null;
      items: { quantity: number }[];
      refundRequests: { status: OrderRefundRequestStatus }[];
    },
    fulfillmentStatus: PrismaFulfillmentStatus | null,
  ): AdminCommerceOrderRowDto {
    return {
      id: o.id,
      orderNumber: orderNumberOf(o.id),
      status: o.status as unknown as AdminCommerceOrderRowDto["status"],
      fulfillmentStatus: fulfillmentStatus as unknown as AdminCommerceOrderRowDto["fulfillmentStatus"],
      sellerOrganization: o.sellerOrganization,
      customerName: firstName(o.user?.displayName),
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      totalAmount: o.totalAmount,
      discountAmount: o.discountAmount,
      currency: o.currency,
      hasOpenRefundRequest: o.refundRequests.some(
        (r) => r.status === OrderRefundRequestStatus.PENDING_REVIEW,
      ),
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  }

  async getOrder(id: string): Promise<AdminCommerceOrderDetailDto> {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        sellerOrganization: { select: { id: true, name: true } },
        user: { select: { displayName: true } },
        items: { include: { review: { select: { id: true } } } },
        refundRequests: { orderBy: { createdAt: "desc" } },
        statusEvents: { orderBy: { createdAt: "asc" } },
        refunds: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!o) throw new OrderNotFoundException({ orderId: id });
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { orderId_sequenceNumber: { orderId: id, sequenceNumber: 1 } },
    });
    const snapshot = (o.shippingAddressSnapshot ?? {}) as { city?: unknown };
    return {
      ...this.toRow(o, fulfillment?.status ?? null),
      subtotalAmount: o.subtotalAmount,
      deliveryAmount: o.deliveryAmount,
      items: o.items.map(toOrderItemDto),
      timeline: o.statusEvents.map((e) => ({
        toStatus: e.toStatus,
        fromStatus: e.fromStatus,
        actorType: e.actorType,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
      refunds: o.refunds.map((r) => ({
        id: r.id,
        paymentIntentId: r.paymentIntentId,
        financingIntentId: r.financingIntentId,
        orderId: r.orderId,
        amount: r.amount,
        currency: r.currency,
        status: r.status as unknown as RefundStatus,
        reason: r.reason,
        providerReference: r.providerReference,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      refundRequests: o.refundRequests.map((r) =>
        this.toRequestDto({
          ...r,
          order: { id: o.id, user: o.user, sellerOrganization: o.sellerOrganization },
        }),
      ),
      fulfillment: fulfillment ? toFulfillmentDto(fulfillment) : null,
      shippingCity: typeof snapshot.city === "string" ? snapshot.city : null,
      cancelReason: o.cancelReason,
      checkoutId: o.checkoutId,
    };
  }

  // -------------------------------------------------------- refund requests

  async listRefundRequests(
    status?: OrderRefundRequestStatus,
    page = 1,
  ): Promise<PaginatedDto<AdminRefundRequestDto>> {
    const where: Prisma.OrderRefundRequestWhereInput = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.orderRefundRequest.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              user: { select: { displayName: true } },
              sellerOrganization: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.orderRefundRequest.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((r) => this.toRequestDto(r)),
      total,
      page,
      PAGE_SIZE,
    );
  }

  /**
   * Approve = open a finance AdminRefundApproval for the order total (the
   * idempotency key is the request id, so a double click never opens two).
   * Money moves only when finance executes that approval.
   */
  async approveRefundRequest(
    admin: ResolvedAdminContext,
    requestId: string,
    note: string | undefined,
    httpRequestId?: string,
  ): Promise<AdminRefundRequestDto> {
    const current = await this.prisma.orderRefundRequest.findUnique({ where: { id: requestId } });
    if (!current) throw new NotFoundApiException("Refund request", { requestId });
    if (current.status !== OrderRefundRequestStatus.PENDING_REVIEW)
      throw new RefundRequestDecisionException({ requestId, status: current.status });

    const approval = await this.refundApprovals.request(
      admin,
      current.orderId,
      current.requestedAmount,
      `Customer refund request ${requestId}: ${current.reason}`,
      `order-refund-request:${requestId}`,
      httpRequestId,
    );
    const updated = await this.prisma.orderRefundRequest.updateMany({
      where: { id: requestId, status: OrderRefundRequestStatus.PENDING_REVIEW },
      data: {
        status: OrderRefundRequestStatus.APPROVED,
        decisionReason: note?.trim() || null,
        decidedByAdminId: admin.adminUserId,
        adminRefundApprovalId: approval.id,
      },
    });
    if (updated.count === 0) throw new RefundRequestDecisionException({ requestId });
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "order_refund_request.approved",
      entityType: "ORDER_REFUND_REQUEST",
      entityId: requestId,
      reason: note,
      afterSummary: { adminRefundApprovalId: approval.id },
      requestId: httpRequestId,
    });
    await this.events.publish(
      "OrderRefundRequestApproved",
      { orderId: current.orderId, requestId, userId: current.userId },
      { aggregateType: "Order", aggregateId: current.orderId },
    );
    return this.getRefundRequest(requestId);
  }

  async rejectRefundRequest(
    admin: ResolvedAdminContext,
    requestId: string,
    reason: string,
    httpRequestId?: string,
  ): Promise<AdminRefundRequestDto> {
    const current = await this.prisma.orderRefundRequest.findUnique({ where: { id: requestId } });
    if (!current) throw new NotFoundApiException("Refund request", { requestId });
    const updated = await this.prisma.orderRefundRequest.updateMany({
      where: { id: requestId, status: OrderRefundRequestStatus.PENDING_REVIEW },
      data: {
        status: OrderRefundRequestStatus.REJECTED,
        decisionReason: reason.trim(),
        decidedByAdminId: admin.adminUserId,
      },
    });
    if (updated.count === 0) throw new RefundRequestDecisionException({ requestId, status: current.status });
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "order_refund_request.rejected",
      entityType: "ORDER_REFUND_REQUEST",
      entityId: requestId,
      reason,
      requestId: httpRequestId,
    });
    await this.events.publish(
      "OrderRefundRequestRejected",
      { orderId: current.orderId, requestId, userId: current.userId },
      { aggregateType: "Order", aggregateId: current.orderId },
    );
    return this.getRefundRequest(requestId);
  }

  private async getRefundRequest(requestId: string): Promise<AdminRefundRequestDto> {
    const row = await this.prisma.orderRefundRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        order: {
          select: {
            id: true,
            user: { select: { displayName: true } },
            sellerOrganization: { select: { id: true, name: true } },
          },
        },
      },
    });
    return this.toRequestDto(row);
  }

  private toRequestDto(r: {
    id: string;
    orderId: string;
    status: OrderRefundRequestStatus;
    reason: string;
    description: string | null;
    requestedAmount: number;
    orderItemIds: string[];
    decisionReason: string | null;
    adminRefundApprovalId: string | null;
    createdAt: Date;
    updatedAt: Date;
    order: {
      id: string;
      user: { displayName: string | null } | null;
      sellerOrganization: { id: string; name: string };
    };
  }): AdminRefundRequestDto {
    return {
      id: r.id,
      orderId: r.orderId,
      orderNumber: orderNumberOf(r.orderId),
      customerName: firstName(r.order.user?.displayName),
      sellerName: r.order.sellerOrganization.name,
      status: r.status,
      reason: r.reason,
      description: r.description,
      requestedAmount: r.requestedAmount,
      orderItemIds: r.orderItemIds,
      decisionReason: r.decisionReason,
      adminRefundApprovalId: r.adminRefundApprovalId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // --------------------------------------------------------------- products

  async listProducts(query: {
    status?: ProductStatus;
    q?: string;
    categoryId?: string;
    page?: number;
  }): Promise<PaginatedDto<AdminProductRowDto>> {
    const page = query.page ?? 1;
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { variants: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { name: true } },
          brand: { select: { name: true } },
          _count: { select: { media: true } },
          variants: {
            select: { id: true, offers: { select: { status: true, sellerOrganizationId: true } } },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.product.count({ where }),
    ]);
    const ratings = await this.prisma.productReview.groupBy({
      by: ["productId"],
      where: {
        productId: { in: rows.map((r) => r.id) },
        status: { in: [ProductReviewStatus.PUBLISHED, ProductReviewStatus.APPROVED] },
      },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const rById = new Map(ratings.map((r) => [r.productId, r]));
    return toPaginatedDto(
      rows.map((p) => {
        const offers = p.variants.flatMap((v) => v.offers);
        const r = rById.get(p.id);
        return {
          id: p.id,
          title: p.title,
          isDemoRecord: p.isDemoRecord,
          status: p.status as unknown as AdminProductRowDto["status"],
          categoryName: p.category.name,
          brandName: p.brand?.name ?? null,
          variantCount: p.variants.length,
          activeOfferCount: offers.filter((o) => o.status === SellerOfferStatus.ACTIVE).length,
          sellerCount: new Set(offers.map((o) => o.sellerOrganizationId)).size,
          rating: {
            average: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null,
            count: r?._count._all ?? 0,
          },
          mediaCount: p._count.media,
          hasMedia: p._count.media > 0,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      total,
      page,
      PAGE_SIZE,
    );
  }

  /**
   * One product as staff see it: catalog identity, every variant, and every
   * seller's offer with price, stock and whether a customer can buy it now,
   * plus the seller requests it came from. Read-only; status changes stay on
   * the existing product, offer-moderation and inventory actions.
   */
  async productDetail(productId: string): Promise<AdminProductDetailDto> {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        _count: { select: { media: true } },
        variants: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            offers: {
              orderBy: [{ priceAmount: "asc" }, { id: "asc" }],
              include: { inventoryItem: true, sellerOrganization: { select: { id: true, name: true, status: true, verificationStatus: true } } },
            },
          },
        },
      },
    });
    if (!p) throw new NotFoundApiException("Product", { productId });
    const [rating, requests] = await Promise.all([
      this.prisma.productReview.aggregate({ where: { productId, status: { in: [ProductReviewStatus.PUBLISHED, ProductReviewStatus.APPROVED] } }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.catalogProductRequest.findMany({ where: { resolvedProductId: productId }, orderBy: { createdAt: "desc" }, take: 20, include: { sellerOrganization: { select: { name: true } } } }),
    ]);
    const offers: AdminProductOfferDto[] = p.variants.flatMap((v) =>
      v.offers.map((o) => {
        const stock = o.inventoryItem ? { onHand: o.inventoryItem.onHand, reserved: o.inventoryItem.reserved, available: Math.max(0, o.inventoryItem.onHand - o.inventoryItem.reserved) } : null;
        // Same conditions as the public catalog (ACTIVE_OFFER_WHERE) plus stock on hand.
        const buyable =
          p.status === ProductStatus.ACTIVE &&
          o.status === SellerOfferStatus.ACTIVE &&
          o.moderationStatus === SellerOfferModerationStatus.APPROVED &&
          o.sellerOrganization.verificationStatus === SellerVerificationStatus.VERIFIED &&
          o.sellerOrganization.status === SellerStatus.ACTIVE &&
          (stock?.available ?? 0) > 0;
        return {
          id: o.id,
          variantId: v.id,
          variantSku: v.sku,
          variantTitle: v.title,
          seller: { id: o.sellerOrganization.id, name: o.sellerOrganization.name, status: o.sellerOrganization.status, verificationStatus: o.sellerOrganization.verificationStatus },
          status: o.status,
          moderationStatus: o.moderationStatus,
          moderationReason: o.moderationReason,
          priceAmount: o.priceAmount,
          compareAtAmount: o.compareAtAmount,
          currency: o.currency,
          sellerSku: o.sellerSku,
          stock,
          buyable,
          updatedAt: o.updatedAt.toISOString(),
        };
      }),
    );
    const buyablePrices = offers.filter((o) => o.buyable).map((o) => o.priceAmount);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      isDemoRecord: p.isDemoRecord,
      status: p.status as unknown as AdminProductDetailDto["status"],
      categoryName: p.category.name,
      brandName: p.brand?.name ?? null,
      category: p.category,
      brand: p.brand,
      variantCount: p.variants.length,
      activeOfferCount: offers.filter((o) => o.status === SellerOfferStatus.ACTIVE).length,
      sellerCount: new Set(offers.map((o) => o.seller.id)).size,
      rating: { average: rating._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : null, count: rating._count._all },
      mediaCount: p._count.media,
      hasMedia: p._count.media > 0,
      createdAt: p.createdAt.toISOString(),
      variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, title: v.title, isActive: v.isActive })),
      offers,
      catalogRequests: requests.map((r) => ({ id: r.id, status: r.status, sellerName: r.sellerOrganization.name, requestedTitle: r.requestedTitle, reviewedAt: r.reviewedAt?.toISOString() ?? null, decisionReason: r.decisionReason })),
      lowestBuyablePrice: buyablePrices.length ? Math.min(...buyablePrices) : null,
    };
  }

  /** Platform maintains catalog identity; seller offers remain the sole price/inventory owner. */
  async listProductCategories() {
    return this.prisma.productCategory.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async createCatalogProduct(
    admin: ResolvedAdminContext,
    input: {
      categoryId: string;
      title: string;
      slug: string;
      sku: string;
      description?: string;
      variantTitle?: string;
      supportsDog?: boolean;
      supportsCat?: boolean;
      status?: ProductStatus;
    },
    httpRequestId?: string,
  ) {
    // Product creation intentionally starts as INACTIVE. Gallery upload is a
    // separate, direct-to-storage step and cannot happen before a product id
    // exists, so accepting ACTIVE here would create a bypass around C-03.
    if (input.status === ProductStatus.ACTIVE) {
      throw new ApiException(
        "PRODUCT_MEDIA_INCOMPLETE",
        "A public product needs exactly three images with alternative text.",
        HttpStatus.CONFLICT,
        { mediaCount: 0, hasDescriptiveAlt: false },
      );
    }
    const category = await this.prisma.productCategory.findFirst({
      where: { id: input.categoryId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!category)
      throw new NotFoundApiException("Active product category", { categoryId: input.categoryId });
    const duplicate = await this.prisma.product.findFirst({
      where: { OR: [{ slug: input.slug.trim() }, { variants: { some: { sku: input.sku.trim() } } }] },
      select: { id: true },
    });
    if (duplicate)
      throw new ApiException(
        "PRODUCT_IDENTITY_CONFLICT",
        "Product slug or SKU already exists.",
        HttpStatus.CONFLICT,
      );
    const row = await this.prisma.product.create({
      data: {
        categoryId: category.id,
        title: input.title.trim(),
        slug: input.slug.trim(),
        description: input.description?.trim() || null,
        supportsDog: input.supportsDog ?? true,
        supportsCat: input.supportsCat ?? true,
        status: input.status ?? ProductStatus.INACTIVE,
        variants: { create: { sku: input.sku.trim(), title: input.variantTitle?.trim() || null } },
      },
      select: { id: true, title: true, slug: true, status: true, categoryId: true },
    });
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "product.created",
      entityType: "PRODUCT",
      entityId: row.id,
      afterSummary: { title: row.title, status: row.status, categoryId: row.categoryId },
      requestId: httpRequestId,
    });
    return row;
  }

  /** Draft products may be incomplete, but public catalogue records may not
   * claim to be ready without the three reviewed, accessible gallery images
   * required by the approved Shop pattern. This is enforced at the domain
   * boundary, not only in the admin browser. */
  private async assertProductReadyForPublic(
    productId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const media = await db.productMedia.findMany({
      where: { productId },
      select: { alt: true },
      orderBy: { sortOrder: "asc" },
    });
    const hasDescriptiveAlt = media.every((item) => Boolean(item.alt?.trim()));
    if (media.length !== 3 || !hasDescriptiveAlt) {
      throw new ApiException(
        "PRODUCT_MEDIA_INCOMPLETE",
        "A public product needs exactly three images with alternative text.",
        HttpStatus.CONFLICT,
        { mediaCount: media.length, hasDescriptiveAlt },
      );
    }
  }

  async updateCatalogProduct(
    admin: ResolvedAdminContext,
    productId: string,
    input: {
      categoryId?: string;
      title?: string;
      slug?: string;
      description?: string;
      supportsDog?: boolean;
      supportsCat?: boolean;
      status?: ProductStatus;
    },
    httpRequestId?: string,
  ) {
    const before = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        categoryId: true,
        title: true,
        slug: true,
        description: true,
        supportsDog: true,
        supportsCat: true,
        status: true,
      },
    });
    if (!before) throw new NotFoundApiException("Product", { productId });
    if (input.categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: input.categoryId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!category)
        throw new NotFoundApiException("Active product category", { categoryId: input.categoryId });
    }
    if (input.slug && input.slug.trim() !== before.slug) {
      const duplicate = await this.prisma.product.findUnique({
        where: { slug: input.slug.trim() },
        select: { id: true },
      });
      if (duplicate)
        throw new ApiException("PRODUCT_SLUG_CONFLICT", "Product slug already exists.", HttpStatus.CONFLICT);
    }
    const data = {
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
      ...(input.supportsDog !== undefined ? { supportsDog: input.supportsDog } : {}),
      ...(input.supportsCat !== undefined ? { supportsCat: input.supportsCat } : {}),
      ...(input.status ? { status: input.status } : {}),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.status === ProductStatus.ACTIVE) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
        await this.assertProductReadyForPublic(productId, tx);
      }
      const updated = await tx.product.update({
        where: { id: productId },
        data,
        select: { id: true, title: true, slug: true, status: true, categoryId: true },
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "product.updated",
        entityType: "PRODUCT",
        entityId: productId,
        beforeSummary: before,
        afterSummary: updated,
        requestId: httpRequestId,
        tx,
      });
      return updated;
    });
    return row;
  }

  async setProductStatus(
    admin: ResolvedAdminContext,
    productId: string,
    status: ProductStatus,
    reason: string,
    httpRequestId?: string,
  ): Promise<{ id: string; status: string }> {
    const before = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { status: true },
    });
    if (!before) throw new NotFoundApiException("Product", { productId });
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      const current = await tx.product.findUnique({ where: { id: productId }, select: { status: true } });
      if (!current) throw new NotFoundApiException("Product", { productId });
      if (status === ProductStatus.ACTIVE) await this.assertProductReadyForPublic(productId, tx);
      const updated = await tx.product.update({ where: { id: productId }, data: { status } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "product.status_changed",
        entityType: "PRODUCT",
        entityId: productId,
        reason,
        beforeSummary: { status: current.status },
        afterSummary: { status },
        requestId: httpRequestId,
        tx,
      });
      return updated;
    });
    return { id: row.id, status: row.status };
  }

  // ---------------------------------------------------------- product media

  private async productOrThrow(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundApiException("Product", { productId });
  }

  async listProductMedia(productId: string) {
    await this.productOrThrow(productId);
    const media = await this.prisma.productMedia.findMany({
      where: { productId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, url: true, alt: true, variantId: true, sortOrder: true, createdAt: true },
    });
    return media.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
  }

  async requestProductMediaUpload(productId: string, input: { contentType: string; fileSizeBytes: number }) {
    await this.productOrThrow(productId);
    const count = await this.prisma.productMedia.count({ where: { productId } });
    if (count >= 3) {
      throw new ApiException(
        "PRODUCT_MEDIA_LIMIT_REACHED",
        "A product can have at most three images. Remove one before adding another.",
        HttpStatus.CONFLICT,
        { maximum: 3 },
      );
    }
    return this.storage.createProductMediaUploadTarget(productId, input.contentType, input.fileSizeBytes);
  }

  async confirmProductMediaUpload(
    admin: ResolvedAdminContext,
    productId: string,
    input: { objectKey: string; alt: string; variantId?: string },
    httpRequestId?: string,
  ) {
    await this.productOrThrow(productId);
    assertObjectKeyUnder(input.objectKey, "product-media", productId);
    const alt = input.alt.trim();
    if (!alt) throw new ValidationApiException({ field: "alt", reason: "REQUIRED" });
    if (input.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: input.variantId, productId },
        select: { id: true },
      });
      if (!variant) throw new ValidationApiException({ field: "variantId", reason: "NOT_IN_PRODUCT" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      // Serialize confirmations for one product. Without a per-product lock,
      // concurrent confirmations can both observe two images and create a
      // fourth image, leaving the product impossible to publish under C-03.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      const count = await tx.productMedia.count({ where: { productId } });
      if (count >= 3) {
        throw new ApiException(
          "PRODUCT_MEDIA_LIMIT_REACHED",
          "A product can have at most three images. Remove one before adding another.",
          HttpStatus.CONFLICT,
          { maximum: 3 },
        );
      }
      const created = await tx.productMedia.create({
        data: {
          productId,
          variantId: input.variantId ?? null,
          objectKey: input.objectKey,
          url: resolveObjectUrl(input.objectKey)!,
          alt,
          sortOrder: count,
        },
        select: { id: true, url: true, alt: true, variantId: true, sortOrder: true, createdAt: true },
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "product.media_added",
        entityType: "PRODUCT",
        entityId: productId,
        afterSummary: { mediaId: created.id, variantId: created.variantId, sortOrder: created.sortOrder },
        requestId: httpRequestId,
        tx,
      });
      return created;
    });
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async reorderProductMedia(
    admin: ResolvedAdminContext,
    productId: string,
    mediaIds: string[],
    httpRequestId?: string,
  ) {
    await this.productOrThrow(productId);
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw new ValidationApiException({ field: "mediaIds", reason: "DUPLICATE_MEDIA_ID" });
    }
    const existing = await this.prisma.productMedia.findMany({
      where: { productId },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    if (existing.length !== mediaIds.length || existing.some((item) => !mediaIds.includes(item.id))) {
      throw new ValidationApiException({ field: "mediaIds", reason: "MUST_CONTAIN_EVERY_PRODUCT_MEDIA_ID" });
    }
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        mediaIds.map((id, sortOrder) => tx.productMedia.update({ where: { id }, data: { sortOrder } })),
      );
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "product.media_reordered",
        entityType: "PRODUCT",
        entityId: productId,
        beforeSummary: { mediaIds: existing.map((item) => item.id) },
        afterSummary: { mediaIds },
        requestId: httpRequestId,
        tx,
      });
    });
    return this.listProductMedia(productId);
  }

  async removeProductMedia(
    admin: ResolvedAdminContext,
    productId: string,
    mediaId: string,
    httpRequestId?: string,
  ) {
    await this.productOrThrow(productId);
    const existing = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, productId },
      select: { id: true, variantId: true, sortOrder: true },
    });
    if (!existing) throw new NotFoundApiException("Product media", { productId, mediaId });
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { status: true },
      });
      await tx.productMedia.delete({ where: { id: mediaId } });
      const remaining = await tx.productMedia.findMany({
        where: { productId },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      await Promise.all(
        remaining.map((item, sortOrder) =>
          tx.productMedia.update({ where: { id: item.id }, data: { sortOrder } }),
        ),
      );
      // An active product must never remain discoverable after its required
      // gallery becomes incomplete. Deactivate atomically with the removal
      // and record the status correction in the same append-only audit log.
      if (product.status === ProductStatus.ACTIVE && remaining.length !== 3) {
        await tx.product.update({ where: { id: productId }, data: { status: ProductStatus.INACTIVE } });
        await this.audit.record({
          adminUserId: admin.adminUserId,
          action: "product.status_changed",
          entityType: "PRODUCT",
          entityId: productId,
          reason: "Product gallery became incomplete after an image was removed.",
          beforeSummary: { status: ProductStatus.ACTIVE },
          afterSummary: { status: ProductStatus.INACTIVE },
          requestId: httpRequestId,
          tx,
        });
      }
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "product.media_removed",
        entityType: "PRODUCT",
        entityId: productId,
        beforeSummary: { mediaId: existing.id, variantId: existing.variantId, sortOrder: existing.sortOrder },
        requestId: httpRequestId,
        tx,
      });
    });
    // The object is deliberately retained under storage lifecycle policy.
    // Deleting a database link must not race an in-flight CDN read; the
    // unreachable object can be reclaimed by an audited storage sweeper.
    return { removed: true as const, mediaId };
  }

  async listSellerOffersForModeration(query: {
    status?: SellerOfferModerationStatus;
    q?: string;
    page?: number;
  }): Promise<PaginatedDto<AdminSellerOfferModerationDto>> {
    const page = query.page ?? 1;
    const where: Prisma.SellerOfferWhereInput = {
      moderationStatus: query.status ?? SellerOfferModerationStatus.PENDING_REVIEW,
      ...(query.q
        ? {
            OR: [
              { sellerSku: { contains: query.q, mode: "insensitive" } },
              { productVariant: { sku: { contains: query.q, mode: "insensitive" } } },
              { productVariant: { product: { title: { contains: query.q, mode: "insensitive" } } } },
              { sellerOrganization: { name: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const include = {
      sellerOrganization: { select: { id: true, name: true } },
      productVariant: { include: { product: { select: { id: true, title: true } } } },
      inventoryItem: { select: { onHand: true, reserved: true } },
    } satisfies Prisma.SellerOfferInclude;
    const [rows, total] = await Promise.all([
      this.prisma.sellerOffer.findMany({
        where,
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.sellerOffer.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((row) => this.toSellerOfferModerationDto(row)),
      total,
      page,
      PAGE_SIZE,
    );
  }

  async getSellerOfferForModeration(offerId: string): Promise<AdminSellerOfferModerationDto> {
    const row = await this.prisma.sellerOffer.findUnique({
      where: { id: offerId },
      include: {
        sellerOrganization: { select: { id: true, name: true } },
        productVariant: { include: { product: { select: { id: true, title: true } } } },
        inventoryItem: { select: { onHand: true, reserved: true } },
      },
    });
    if (!row) throw new NotFoundApiException("Seller offer", { offerId });
    return this.toSellerOfferModerationDto(row);
  }

  async decideSellerOfferModeration(
    admin: ResolvedAdminContext,
    offerId: string,
    decision: SellerOfferModerationStatus,
    reason: string,
    expectedUpdatedAt: string,
    httpRequestId?: string,
  ): Promise<AdminSellerOfferModerationDto> {
    const before = await this.prisma.sellerOffer.findUnique({
      where: { id: offerId },
      select: { moderationStatus: true, status: true, updatedAt: true, sellerOrganizationId: true },
    });
    if (!before) throw new NotFoundApiException("Seller offer", { offerId });
    const expected = new Date(expectedUpdatedAt);
    if (
      before.moderationStatus !== SellerOfferModerationStatus.PENDING_REVIEW ||
      before.updatedAt.getTime() !== expected.getTime()
    ) {
      throw new SellerOfferModerationDecisionException({
        offerId,
        moderationStatus: before.moderationStatus,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.sellerOffer.updateMany({
        where: {
          id: offerId,
          updatedAt: expected,
          moderationStatus: SellerOfferModerationStatus.PENDING_REVIEW,
        },
        data: {
          moderationStatus: decision,
          moderationReason: reason.trim(),
          moderatedAt: new Date(),
          moderatedByAdminId: admin.adminUserId,
        },
      });
      if (result.count !== 1) throw new SellerOfferModerationDecisionException({ offerId });
      const event =
        decision === SellerOfferModerationStatus.APPROVED
          ? "SellerOfferModerationApproved"
          : "SellerOfferModerationRejected";
      await this.events.publish(
        event,
        {
          sellerOfferId: offerId,
          sellerOrganizationId: before.sellerOrganizationId,
          adminUserId: admin.adminUserId,
        },
        { tx, aggregateType: "SellerOffer", aggregateId: offerId },
      );
      if (decision === SellerOfferModerationStatus.APPROVED && before.status === SellerOfferStatus.ACTIVE) {
        await this.events.publish(
          "SellerOfferActivated",
          { sellerOfferId: offerId, sellerOrganizationId: before.sellerOrganizationId },
          { tx, aggregateType: "SellerOffer", aggregateId: offerId },
        );
      }
    });

    await this.audit.record({
      adminUserId: admin.adminUserId,
      action:
        decision === SellerOfferModerationStatus.APPROVED
          ? "seller_offer.moderation_approved"
          : "seller_offer.moderation_rejected",
      entityType: "SELLER_OFFER",
      entityId: offerId,
      reason,
      beforeSummary: { moderationStatus: before.moderationStatus },
      afterSummary: { moderationStatus: decision },
      requestId: httpRequestId,
    });
    return this.getSellerOfferForModeration(offerId);
  }

  private toSellerOfferModerationDto(row: {
    id: string;
    sellerSku: string | null;
    priceAmount: number;
    compareAtAmount: number | null;
    currency: string;
    status: SellerOfferStatus;
    moderationStatus: SellerOfferModerationStatus;
    moderationReason: string | null;
    moderatedAt: Date | null;
    repeatDeliveryEligible: boolean;
    repeatIntervalsDays: number[];
    createdAt: Date;
    updatedAt: Date;
    sellerOrganization: { id: string; name: string };
    productVariant: { id: string; title: string | null; sku: string; product: { id: string; title: string } };
    inventoryItem: { onHand: number; reserved: number } | null;
  }): AdminSellerOfferModerationDto {
    return {
      id: row.id,
      sellerOrganization: row.sellerOrganization,
      product: row.productVariant.product,
      variant: { id: row.productVariant.id, title: row.productVariant.title, sku: row.productVariant.sku },
      sellerSku: row.sellerSku,
      priceAmount: row.priceAmount,
      compareAtAmount: row.compareAtAmount,
      currency: row.currency,
      status: row.status as AdminSellerOfferModerationDto["status"],
      moderationStatus: row.moderationStatus as AdminSellerOfferModerationDto["moderationStatus"],
      moderationReason: row.moderationReason,
      moderatedAt: row.moderatedAt?.toISOString() ?? null,
      availableQuantity: Math.max(0, (row.inventoryItem?.onHand ?? 0) - (row.inventoryItem?.reserved ?? 0)),
      repeatDeliveryEligible: row.repeatDeliveryEligible,
      repeatIntervalsDays: row.repeatIntervalsDays,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------- reviews

  async listReviews(status?: ProductReviewStatus, page = 1): Promise<PaginatedDto<AdminProductReviewRowDto>> {
    const where: Prisma.ProductReviewWhereInput = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        include: { product: { select: { title: true } }, user: { select: { displayName: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.productReview.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        productTitle: r.product.title,
        rating: r.rating,
        body: r.body,
        authorName: firstName(r.user.displayName),
        status: r.status,
        hiddenReason: r.hiddenReason,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      PAGE_SIZE,
    );
  }

  async setReviewVisibility(
    admin: ResolvedAdminContext,
    reviewId: string,
    hidden: boolean,
    reason: string,
    httpRequestId?: string,
  ) {
    const before = await this.prisma.productReview.findUnique({ where: { id: reviewId } });
    if (!before) throw new NotFoundApiException("Review", { reviewId });
    const row = await this.prisma.productReview.update({
      where: { id: reviewId },
      data: hidden
        ? { status: ProductReviewStatus.HIDDEN, hiddenReason: reason }
        : { status: ProductReviewStatus.APPROVED, hiddenReason: null },
    });
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: hidden ? "product_review.hidden" : "product_review.restored",
      entityType: "PRODUCT_REVIEW",
      entityId: reviewId,
      reason,
      beforeSummary: { status: before.status },
      afterSummary: { status: row.status },
      requestId: httpRequestId,
    });
    if (hidden)
      await this.events.publish(
        "ProductReviewHidden",
        { reviewId, productId: row.productId },
        { aggregateType: "Product", aggregateId: row.productId },
      );
    return { id: row.id, status: row.status };
  }

  // -------------------------------------------------------------- inventory

  async listInventory(query: {
    lowStock?: boolean;
    sellerId?: string;
    page?: number;
  }): Promise<PaginatedDto<AdminInventoryRowDto>> {
    const page = query.page ?? 1;
    const sellerFilter = query.sellerId
      ? Prisma.sql`AND o."sellerOrganizationId" = ${query.sellerId}::uuid`
      : Prisma.empty;
    const lowFilter = query.lowStock
      ? Prisma.sql`AND (i."onHand" - i."reserved") <= ${LOW_STOCK}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ offerId: string; total: bigint }[]>`
      SELECT o."id" AS "offerId", COUNT(*) OVER() AS "total"
      FROM "seller_offers" o JOIN "inventory_items" i ON i."sellerOfferId" = o."id"
      WHERE o."status" = 'ACTIVE' ${sellerFilter} ${lowFilter}
      ORDER BY (i."onHand" - i."reserved") ASC, o."id" ASC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;
    const offers = await this.prisma.sellerOffer.findMany({
      where: { id: { in: rows.map((r) => r.offerId) } },
      include: {
        inventoryItem: true,
        sellerOrganization: { select: { id: true, name: true } },
        productVariant: { include: { product: { select: { id: true, title: true } } } },
      },
    });
    const byId = new Map(offers.map((o) => [o.id, o]));
    const items = rows
      .map((r) => byId.get(r.offerId))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => {
        const onHand = o.inventoryItem?.onHand ?? 0;
        const reserved = o.inventoryItem?.reserved ?? 0;
        return {
          sellerOfferId: o.id,
          productId: o.productVariant.product.id,
          productTitle: o.productVariant.product.title,
          variantTitle: o.productVariant.title,
          sku: o.productVariant.sku,
          sellerOrganization: o.sellerOrganization,
          onHand,
          reserved,
          available: Math.max(0, onHand - reserved),
          offerStatus: o.status,
        };
      });
    return toPaginatedDto(items, Number(rows[0]?.total ?? 0), page, PAGE_SIZE);
  }

  // ---------------------------------------------------------------- sellers

  async listSellers(): Promise<AdminSellerRowDto[]> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const sellers = await this.prisma.sellerOrganization.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200,
      select: { id: true, name: true, verificationStatus: true, status: true },
    });
    const ids = sellers.map((s) => s.id);
    const [offers, orders, requests] = await Promise.all([
      this.prisma.sellerOffer.groupBy({
        by: ["sellerOrganizationId"],
        where: { sellerOrganizationId: { in: ids }, status: SellerOfferStatus.ACTIVE },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["sellerOrganizationId"],
        where: {
          sellerOrganizationId: { in: ids },
          createdAt: { gte: since },
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.orderRefundRequest.findMany({
        where: {
          status: OrderRefundRequestStatus.PENDING_REVIEW,
          order: { sellerOrganizationId: { in: ids } },
        },
        select: { order: { select: { sellerOrganizationId: true } } },
      }),
    ]);
    const offerBy = new Map(offers.map((o) => [o.sellerOrganizationId, o._count._all]));
    const orderBy = new Map(orders.map((o) => [o.sellerOrganizationId, o]));
    const reqBy = new Map<string, number>();
    for (const r of requests)
      reqBy.set(r.order.sellerOrganizationId, (reqBy.get(r.order.sellerOrganizationId) ?? 0) + 1);
    return sellers.map((s) => ({
      id: s.id,
      name: s.name,
      verificationStatus: s.verificationStatus,
      status: s.status,
      activeOfferCount: offerBy.get(s.id) ?? 0,
      orderCount30d: orderBy.get(s.id)?._count._all ?? 0,
      grossSales30d: orderBy.get(s.id)?._sum.totalAmount ?? 0,
      openRefundRequests: reqBy.get(s.id) ?? 0,
    }));
  }

  async auditPromotion(
    admin: ResolvedAdminContext,
    action: "created" | "updated" | "status_changed",
    promotionId: string,
    afterSummary: Record<string, unknown>,
    httpRequestId?: string,
  ): Promise<void> {
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: `promotion.${action}`,
      entityType: "PROMOTION",
      entityId: promotionId,
      afterSummary,
      requestId: httpRequestId,
    });
  }

  // -------------------------------------------------------------- analytics

  /** Direct PET LIFE checkout orders only; marketplace-channel orders are reported in seller finance. */
  async analytics(days = 30): Promise<AdminCommerceAnalyticsDto> {
    const since = new Date(Date.now() - days * 86_400_000);
    const base: Prisma.OrderWhereInput = { checkoutId: { not: null }, createdAt: { gte: since } };
    const [all, cancelledCount, refundedCount, refundRequestCount, repeatDeliveryActive, byDayRows, topRows] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { ...base, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
          _count: { _all: true },
          _sum: { totalAmount: true, discountAmount: true },
        }),
        this.prisma.order.count({ where: { ...base, cancelledAt: { not: null } } }),
        this.prisma.order.count({ where: { ...base, status: OrderStatus.REFUNDED } }),
        this.prisma.orderRefundRequest.count({ where: { createdAt: { gte: since } } }),
        this.prisma.repeatDeliverySchedule.count({ where: { status: RepeatDeliveryStatus.ACTIVE } }),
        this.prisma.$queryRaw<{ day: Date; orders: bigint; gross: bigint | null }[]>`
        SELECT date_trunc('day', "createdAt") AS "day", COUNT(*) AS "orders", SUM("totalAmount") AS "gross"
        FROM "orders" WHERE "checkoutId" IS NOT NULL AND "createdAt" >= ${since} AND "status" NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<{ productId: string; title: string; units: bigint; gross: bigint }[]>`
        SELECT oi."productId", MIN(oi."productTitleSnapshot") AS "title", SUM(oi."quantity") AS "units", SUM(oi."totalPrice") AS "gross"
        FROM "order_items" oi JOIN "orders" o ON o."id" = oi."orderId"
        WHERE o."checkoutId" IS NOT NULL AND o."createdAt" >= ${since} AND o."status" NOT IN ('CANCELLED', 'REFUNDED')
        GROUP BY oi."productId" ORDER BY "units" DESC, oi."productId" ASC LIMIT 10`,
      ]);
    const orderCount = all._count._all;
    const grossSales = all._sum.totalAmount ?? 0;
    return {
      days,
      orderCount,
      grossSales,
      discountGiven: all._sum.discountAmount ?? 0,
      averageOrderValue: orderCount ? Math.round(grossSales / orderCount) : null,
      cancelledCount,
      refundedCount,
      refundRequestCount,
      repeatDeliveryActive,
      byDay: byDayRows.map((r) => ({
        date: r.day.toISOString().slice(0, 10),
        orders: Number(r.orders),
        grossSales: Number(r.gross ?? 0),
      })),
      topProducts: topRows.map((r) => ({
        productId: r.productId,
        title: r.title,
        units: Number(r.units),
        grossSales: Number(r.gross),
      })),
    };
  }
}
