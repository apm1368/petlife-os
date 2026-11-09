import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { CreateCatalogProductRequestDto } from "./dto/catalog-product-request.dto";
import { SellerCatalogRequestService } from "./seller-catalog-request.service";

@Controller("seller-organizations/:sellerId/catalog-product-requests")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
@RequireSellerRole(SellerMembershipRole.CATALOG_MANAGER)
export class SellerCatalogRequestController {
  constructor(private readonly requests: SellerCatalogRequestService) {}
  @Get() list(@CurrentSellerContext() ctx: ResolvedSellerContext) { return this.requests.list(ctx); }
  @Post() create(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: CreateCatalogProductRequestDto) { return this.requests.create(ctx, dto); }
}
