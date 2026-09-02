import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "../../seller-os/auth/seller-auth.guard";
import { RequireSellerRole } from "../../seller-os/auth/require-seller-role.decorator";
import { CurrentSellerContext } from "../../seller-os/auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "../../seller-os/auth/seller-context.types";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { CreateMarketplaceListingDto, ListMarketplaceListingsQueryDto, UpdateMarketplaceListingMappingDto } from "./dto/marketplace-listing.dto";

/** Seller-facing marketplace listing management (spec section 15-18, 45, 52). */
@Controller("seller-organizations/:sellerId/marketplace-listings")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class MarketplaceListingController {
  constructor(private readonly listings: MarketplaceListingService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListMarketplaceListingsQueryDto) {
    return this.listings.list(ctx, query);
  }

  @Get(":listingId")
  getById(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("listingId") listingId: string) {
    return this.listings.getById(ctx, listingId);
  }

  @Post()
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  create(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: CreateMarketplaceListingDto) {
    return this.listings.create(ctx, dto);
  }

  @Patch(":listingId")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  updateMapping(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("listingId") listingId: string, @Body() dto: UpdateMarketplaceListingMappingDto) {
    return this.listings.updateMapping(ctx, listingId, dto);
  }

  @Post(":listingId/publish")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  publish(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("listingId") listingId: string) {
    return this.listings.publish(ctx, listingId);
  }

  @Post(":listingId/sync")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  sync(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("listingId") listingId: string) {
    return this.listings.syncAll(ctx, listingId);
  }

  @Post(":listingId/deactivate")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  deactivate(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("listingId") listingId: string) {
    return this.listings.deactivate(ctx, listingId);
  }

  @Post(":listingId/reconcile")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  reconcile(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("listingId") listingId: string) {
    return this.listings.reconcile(ctx, listingId);
  }
}
