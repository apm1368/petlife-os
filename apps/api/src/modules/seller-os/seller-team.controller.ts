import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerTeamService } from "./seller-team.service";
import { InviteSellerMemberDto, UpdateSellerMemberDto } from "./dto/seller-team.dto";

/** Seller Team management (spec section 4, 48, 52) — invite/role-change/remove are ADMIN+ only; any active member can list the roster. */
@Controller("seller-organizations/:sellerId/members")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerTeamController {
  constructor(private readonly team: SellerTeamService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.team.list(ctx);
  }

  @Post()
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  invite(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: InviteSellerMemberDto) {
    return this.team.invite(ctx, dto);
  }

  @Patch(":membershipId")
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  updateRole(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("membershipId") membershipId: string, @Body() dto: UpdateSellerMemberDto) {
    return this.team.updateRole(ctx, membershipId, dto.role);
  }

  @Delete(":membershipId")
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  remove(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("membershipId") membershipId: string) {
    return this.team.remove(ctx, membershipId);
  }
}
