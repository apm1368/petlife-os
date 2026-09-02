import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SellerAccessService } from "./seller-access.service";
import { SetSellerContextDto } from "./dto/seller-context.dto";

/**
 * `GET /seller-organizations` + context switching (spec section 5, 52).
 * Deliberately session-scoped only (no `:sellerId` param, no SellerAuthGuard)
 * — this is how a user discovers which seller organizations they belong to
 * in the first place, before any `:sellerId`-scoped route becomes useful.
 */
@Controller("seller-organizations")
@UseGuards(SessionAuthGuard)
export class SellerContextController {
  constructor(private readonly sellerAccess: SellerAccessService) {}

  @Get()
  async list(@CurrentUser() user: SessionUser) {
    return (await this.sellerAccess.getContextDto(user.id)).memberships;
  }
}

@Controller("seller-context")
@UseGuards(SessionAuthGuard)
export class SellerContextPreferenceController {
  constructor(private readonly sellerAccess: SellerAccessService) {}

  @Get()
  getContext(@CurrentUser() user: SessionUser) {
    return this.sellerAccess.getContextDto(user.id);
  }

  @Post()
  setContext(@CurrentUser() user: SessionUser, @Body() dto: SetSellerContextDto) {
    return this.sellerAccess.setContext(user.id, dto.sellerOrganizationId);
  }
}
