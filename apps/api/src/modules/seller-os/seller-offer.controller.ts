import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerOfferService } from "./seller-offer.service";
import { CreateSellerOfferDto, ListSellerOffersQueryDto, UpdateSellerOfferDto } from "./dto/seller-offer.dto";

/** Seller Offer management (spec section 6, 42, 52) — reads are open to any active member; writes require CATALOG_MANAGER (or ADMIN/OWNER, which always satisfy any role check). */
@Controller("seller-organizations/:sellerId/offers")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerOfferController {
  constructor(private readonly offers: SellerOfferService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListSellerOffersQueryDto) {
    return this.offers.list(ctx, query);
  }

  @Get(":offerId")
  getById(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("offerId") offerId: string) {
    return this.offers.getById(ctx, offerId);
  }

  @Post()
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  create(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: CreateSellerOfferDto) {
    return this.offers.create(ctx, dto);
  }

  @Patch(":offerId")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  update(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("offerId") offerId: string, @Body() dto: UpdateSellerOfferDto) {
    return this.offers.update(ctx, offerId, dto);
  }
}
