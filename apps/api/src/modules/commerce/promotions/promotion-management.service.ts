import { HttpStatus, Injectable } from "@nestjs/common";
import { PromotionDiscountType, PromotionFundedBy, PromotionScope, PromotionStatus, type Prisma, type Promotion } from "@prisma/client";
import type { PromotionDto, PromotionInput } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ApiException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";

export class PromotionTransitionException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("PROMOTION_INVALID_TRANSITION", "This promotion cannot move to that state.", HttpStatus.CONFLICT, details);
  }
}

/** Who is managing: the platform (admin) or one seller organization, which may only touch its own promotions and offers. */
export type PromotionActor = { kind: "PLATFORM"; userId: string } | { kind: "SELLER"; userId: string; sellerOrganizationId: string };

const TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  [PromotionStatus.DRAFT]: [PromotionStatus.ACTIVE, PromotionStatus.ENDED],
  [PromotionStatus.ACTIVE]: [PromotionStatus.PAUSED, PromotionStatus.ENDED],
  [PromotionStatus.PAUSED]: [PromotionStatus.ACTIVE, PromotionStatus.ENDED],
  [PromotionStatus.ENDED]: [],
};

const SELLER_SCOPES: PromotionScope[] = [PromotionScope.ALL, PromotionScope.CATEGORY, PromotionScope.PRODUCT];

/**
 * Promotion authoring (Batch 4). PricingService is the only place a
 * promotion turns into a price; this service only validates and stores.
 *
 * Rules: automatic (no codes), one best promotion per unit (no stacking),
 * PERCENT 1..90 or FIXED IRR per unit, never below 1 IRR. SERVICE scope is
 * refused until services pricing consumes promotions (Batch 3 note).
 * Pricing fields (type, value, cap, scope, targets, start) are editable only
 * while DRAFT or PAUSED, so a live price never changes under a shopper
 * without the cart showing PRICE_CHANGED.
 */
@Injectable()
export class PromotionManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async list(actor: PromotionActor, status?: PromotionStatus): Promise<PromotionDto[]> {
    const where: Prisma.PromotionWhereInput = {
      ...(actor.kind === "SELLER" ? { ownerSellerOrganizationId: actor.sellerOrganizationId } : {}),
      ...(status ? { status } : {}),
    };
    const rows = await this.prisma.promotion.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 200 });
    return this.toDtos(rows);
  }

  async get(actor: PromotionActor, id: string): Promise<PromotionDto> {
    const row = await this.loadOwned(actor, id);
    return (await this.toDtos([row]))[0]!;
  }

  async create(actor: PromotionActor, input: PromotionInput): Promise<PromotionDto> {
    const data = await this.validate(actor, input);
    const row = await this.prisma.promotion.create({
      data: {
        ...data,
        status: PromotionStatus.DRAFT,
        fundedBy: actor.kind === "SELLER" ? PromotionFundedBy.SELLER : PromotionFundedBy.PLATFORM,
        ownerSellerOrganizationId: actor.kind === "SELLER" ? actor.sellerOrganizationId : null,
        createdByUserId: actor.userId,
      },
    });
    await this.events.publish("PromotionChanged", { promotionId: row.id, action: "CREATED", actorUserId: actor.userId }, { aggregateType: "Promotion", aggregateId: row.id });
    return this.get(actor, row.id);
  }

  async update(actor: PromotionActor, id: string, input: Partial<PromotionInput>): Promise<PromotionDto> {
    const current = await this.loadOwned(actor, id);
    if (current.status === PromotionStatus.ENDED) throw new PromotionTransitionException({ promotionId: id, reason: "ENDED" });
    const pricingKeys: (keyof PromotionInput)[] = ["discountType", "value", "maxDiscountAmount", "scope", "categoryIds", "productIds", "sellerOrganizationIds", "startsAt"];
    if (current.status === PromotionStatus.ACTIVE && pricingKeys.some((k) => input[k] !== undefined)) {
      throw new PromotionTransitionException({ promotionId: id, reason: "PAUSE_BEFORE_CHANGING_PRICE_TERMS" });
    }
    const merged: PromotionInput = {
      name: input.name ?? current.name,
      description: input.description !== undefined ? input.description : current.description,
      discountType: input.discountType ?? (current.discountType as PromotionInput["discountType"]),
      value: input.value ?? current.value,
      maxDiscountAmount: input.maxDiscountAmount !== undefined ? input.maxDiscountAmount : current.maxDiscountAmount,
      scope: input.scope ?? (current.scope as PromotionInput["scope"]),
      categoryIds: input.categoryIds ?? current.categoryIds,
      productIds: input.productIds ?? current.productIds,
      sellerOrganizationIds: input.sellerOrganizationIds ?? current.sellerOrganizationIds,
      startsAt: input.startsAt ?? current.startsAt.toISOString(),
      endsAt: input.endsAt !== undefined ? input.endsAt : current.endsAt?.toISOString() ?? null,
      usageLimit: input.usageLimit !== undefined ? input.usageLimit : current.usageLimit,
    };
    const data = await this.validate(actor, merged);
    if (data.usageLimit !== null && data.usageLimit !== undefined && data.usageLimit < current.usageCount) {
      throw new ValidationApiException({ field: "usageLimit", reason: "BELOW_CURRENT_USAGE", usageCount: current.usageCount });
    }
    await this.prisma.promotion.update({ where: { id }, data });
    await this.events.publish("PromotionChanged", { promotionId: id, action: "UPDATED", actorUserId: actor.userId }, { aggregateType: "Promotion", aggregateId: id });
    return this.get(actor, id);
  }

  async transition(actor: PromotionActor, id: string, to: PromotionStatus): Promise<PromotionDto> {
    const current = await this.loadOwned(actor, id);
    if (!TRANSITIONS[current.status].includes(to)) throw new PromotionTransitionException({ promotionId: id, from: current.status, to });
    if (to === PromotionStatus.ACTIVE && current.endsAt && current.endsAt <= new Date()) {
      throw new PromotionTransitionException({ promotionId: id, reason: "WINDOW_ALREADY_OVER" });
    }
    // Optimistic guard: two admins racing cannot both apply a transition from the same state.
    const result = await this.prisma.promotion.updateMany({ where: { id, status: current.status }, data: { status: to } });
    if (result.count === 0) throw new PromotionTransitionException({ promotionId: id, reason: "CHANGED_CONCURRENTLY" });
    await this.events.publish("PromotionChanged", { promotionId: id, action: to, actorUserId: actor.userId }, { aggregateType: "Promotion", aggregateId: id });
    return this.get(actor, id);
  }

  private async loadOwned(actor: PromotionActor, id: string): Promise<Promotion> {
    const row = await this.prisma.promotion.findUnique({ where: { id } });
    if (!row) throw new NotFoundApiException("Promotion", { promotionId: id });
    if (actor.kind === "SELLER" && row.ownerSellerOrganizationId !== actor.sellerOrganizationId) throw new NotFoundApiException("Promotion", { promotionId: id });
    return row;
  }

  private async validate(actor: PromotionActor, input: PromotionInput) {
    const discountType = input.discountType as PromotionDiscountType;
    if (discountType === PromotionDiscountType.PERCENT && (input.value < 1 || input.value > 90)) {
      throw new ValidationApiException({ field: "value", reason: "PERCENT_OUT_OF_RANGE", min: 1, max: 90 });
    }
    if (discountType === PromotionDiscountType.FIXED && input.value < 1) throw new ValidationApiException({ field: "value", reason: "FIXED_MUST_BE_POSITIVE" });
    if (input.maxDiscountAmount !== undefined && input.maxDiscountAmount !== null && input.maxDiscountAmount < 1) {
      throw new ValidationApiException({ field: "maxDiscountAmount", reason: "MUST_BE_POSITIVE" });
    }
    const scope = input.scope as PromotionScope;
    if (scope === PromotionScope.SERVICE) throw new ValidationApiException({ field: "scope", reason: "SERVICE_PROMOTIONS_NOT_AVAILABLE" });
    if (actor.kind === "SELLER" && !SELLER_SCOPES.includes(scope)) throw new ValidationApiException({ field: "scope", reason: "NOT_ALLOWED_FOR_SELLER" });

    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new ValidationApiException({ field: "startsAt", reason: "INVALID_DATE" });
    if (endsAt && endsAt <= startsAt) throw new ValidationApiException({ field: "endsAt", reason: "MUST_BE_AFTER_START" });
    if (input.usageLimit !== undefined && input.usageLimit !== null && input.usageLimit < 1) throw new ValidationApiException({ field: "usageLimit", reason: "MUST_BE_POSITIVE" });

    const categoryIds = scope === PromotionScope.CATEGORY ? unique(input.categoryIds) : [];
    const productIds = scope === PromotionScope.PRODUCT ? unique(input.productIds) : [];
    let sellerOrganizationIds = scope === PromotionScope.SELLER ? unique(input.sellerOrganizationIds) : [];
    if (scope === PromotionScope.CATEGORY && categoryIds.length === 0) throw new ValidationApiException({ field: "categoryIds", reason: "REQUIRED_FOR_SCOPE" });
    if (scope === PromotionScope.PRODUCT && productIds.length === 0) throw new ValidationApiException({ field: "productIds", reason: "REQUIRED_FOR_SCOPE" });
    if (scope === PromotionScope.SELLER && sellerOrganizationIds.length === 0) throw new ValidationApiException({ field: "sellerOrganizationIds", reason: "REQUIRED_FOR_SCOPE" });

    if (categoryIds.length && (await this.prisma.productCategory.count({ where: { id: { in: categoryIds } } })) !== categoryIds.length) {
      throw new ValidationApiException({ field: "categoryIds", reason: "UNKNOWN_CATEGORY" });
    }
    if (productIds.length) {
      const where: Prisma.ProductWhereInput = { id: { in: productIds } };
      // A seller can only discount products it actually sells.
      if (actor.kind === "SELLER") where.variants = { some: { offers: { some: { sellerOrganizationId: actor.sellerOrganizationId } } } };
      if ((await this.prisma.product.count({ where })) !== productIds.length) throw new ValidationApiException({ field: "productIds", reason: "UNKNOWN_OR_NOT_YOUR_PRODUCT" });
    }
    if (sellerOrganizationIds.length && (await this.prisma.sellerOrganization.count({ where: { id: { in: sellerOrganizationIds } } })) !== sellerOrganizationIds.length) {
      throw new ValidationApiException({ field: "sellerOrganizationIds", reason: "UNKNOWN_SELLER" });
    }
    if (actor.kind === "SELLER") sellerOrganizationIds = [];

    const name = input.name?.trim();
    if (!name) throw new ValidationApiException({ field: "name", reason: "REQUIRED" });
    return {
      name,
      description: input.description?.trim() || null,
      discountType,
      value: input.value,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
      scope,
      categoryIds,
      productIds,
      sellerOrganizationIds,
      serviceIds: [] as string[],
      startsAt,
      endsAt,
      usageLimit: input.usageLimit ?? null,
    };
  }

  private async toDtos(rows: Promotion[]): Promise<PromotionDto[]> {
    if (rows.length === 0) return [];
    const stats = await this.prisma.promotionRedemption.groupBy({ by: ["promotionId"], where: { promotionId: { in: rows.map((r) => r.id) } }, _count: { _all: true }, _sum: { amount: true } });
    const byId = new Map(stats.map((s) => [s.promotionId, s]));
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      discountType: r.discountType as PromotionDto["discountType"],
      value: r.value,
      maxDiscountAmount: r.maxDiscountAmount,
      scope: r.scope as PromotionDto["scope"],
      categoryIds: r.categoryIds,
      productIds: r.productIds,
      sellerOrganizationIds: r.sellerOrganizationIds,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt?.toISOString() ?? null,
      status: r.status as PromotionDto["status"],
      fundedBy: r.fundedBy as PromotionDto["fundedBy"],
      ownerSellerOrganizationId: r.ownerSellerOrganizationId,
      usageLimit: r.usageLimit,
      usageCount: r.usageCount,
      isLive: r.status === PromotionStatus.ACTIVE && r.startsAt <= now && (!r.endsAt || r.endsAt > now) && (r.usageLimit === null || r.usageCount < r.usageLimit),
      redemptionCount: byId.get(r.id)?._count._all ?? 0,
      discountGivenAmount: byId.get(r.id)?._sum.amount ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}

function unique(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}
