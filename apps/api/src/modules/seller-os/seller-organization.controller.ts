import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerOrganizationService } from "./seller-organization.service";
import { UpdateSellerOrganizationDto } from "./dto/seller-organization.dto";

/** `:sellerId`-scoped seller organization detail/settings (spec section 3, 49, 52). */
@Controller("seller-organizations/:sellerId")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerOrganizationController {
  constructor(private readonly sellerOrganizations: SellerOrganizationService) {}

  @Get()
  get(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.sellerOrganizations.getDetail(ctx);
  }

  @Patch()
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  update(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: UpdateSellerOrganizationDto) {
    return this.sellerOrganizations.updateSettings(ctx, dto);
  }
}
