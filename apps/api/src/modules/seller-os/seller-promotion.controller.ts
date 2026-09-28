import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { PromotionManagementService, type PromotionActor } from "../commerce/promotions/promotion-management.service";
import { ListPromotionsQueryDto, PromotionInputDto, PromotionTransitionDto, UpdatePromotionDto } from "../commerce/promotions/dto/promotion.dto";

function actorOf(ctx: ResolvedSellerContext): PromotionActor {
  return { kind: "SELLER", userId: ctx.userId, sellerOrganizationId: ctx.sellerOrganizationId };
}

/** Seller-funded promotions on the seller's own offers. Reads: any active member; writes: CATALOG_MANAGER and above. */
@Controller("seller-organizations/:sellerId/promotions")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerPromotionController {
  constructor(private readonly promotions: PromotionManagementService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListPromotionsQueryDto) {
    return this.promotions.list(actorOf(ctx), query.status);
  }

  @Get(":promotionId")
  get(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("promotionId", ParseUUIDPipe) id: string) {
    return this.promotions.get(actorOf(ctx), id);
  }

  @Post()
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  create(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: PromotionInputDto) {
    return this.promotions.create(actorOf(ctx), dto);
  }

  @Patch(":promotionId")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  update(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("promotionId", ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotions.update(actorOf(ctx), id, dto);
  }

  @Post(":promotionId/status")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  transition(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("promotionId", ParseUUIDPipe) id: string, @Body() dto: PromotionTransitionDto) {
    return this.promotions.transition(actorOf(ctx), id, dto.status);
  }
}
