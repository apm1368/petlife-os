import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "../../seller-os/auth/seller-auth.guard";
import { RequireSellerRole } from "../../seller-os/auth/require-seller-role.decorator";
import { CurrentSellerContext } from "../../seller-os/auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "../../seller-os/auth/seller-context.types";
import { MarketplaceChannelAccountService } from "./marketplace-channel-account.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { ConnectMarketplaceChannelDto, UpdateMarketplaceChannelDto } from "./dto/marketplace-channel.dto";

/** Seller-facing marketplace channel connections (spec section 43, 52). */
@Controller("seller-organizations/:sellerId/channels")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class MarketplaceChannelController {
  constructor(
    private readonly channelAccounts: MarketplaceChannelAccountService,
    private readonly listings: MarketplaceListingService,
  ) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.channelAccounts.list(ctx);
  }

  @Get(":channelAccountId")
  getById(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string) {
    return this.channelAccounts.getByIdDto(ctx, channelAccountId);
  }

  @Post()
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  connect(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: ConnectMarketplaceChannelDto) {
    return this.channelAccounts.connect(ctx, dto.provider, dto.displayName);
  }

  @Patch(":channelAccountId")
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  update(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string, @Body() dto: UpdateMarketplaceChannelDto) {
    return this.channelAccounts.updateSyncFlags(ctx, channelAccountId, dto);
  }

  /** Bounded reconciliation (spec section 36: "do not make uncontrolled provider-wide sync run on every page load") — reconciles at most the first 50 listings under this channel account. */
  @Post(":channelAccountId/reconcile")
  @RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
  async reconcile(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string) {
    const page = await this.listings.list(ctx, { channelAccountId, page: 1, pageSize: 50 });
    const results = [];
    for (const listing of page.items) {
      results.push({ listingId: listing.id, result: await this.listings.reconcile(ctx, listing.id) });
    }
    return { checkedCount: results.length, results };
  }
}
