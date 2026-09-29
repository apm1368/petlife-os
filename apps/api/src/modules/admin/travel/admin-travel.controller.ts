import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { ListAdminTravelListingsQueryDto, ModerateTravelListingDto, SetTravelListingVerificationDto } from "../../travel-marketplace/dto/travel-marketplace.dto";
import { AdminTravelService } from "./admin-travel.service";

@Controller("admin/travel")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminTravelController {
  constructor(private readonly travel: AdminTravelService) {}

  @Get("listings")
  @RequireAdminPermission("travel.view")
  list(@Query() query: ListAdminTravelListingsQueryDto) { return this.travel.list(query); }

  @Get("listings/:listingId")
  @RequireAdminPermission("travel.view")
  get(@Param("listingId") listingId: string) { return this.travel.get(listingId); }

  @Post("listings/:listingId/moderate")
  @RequireAdminPermission("travel.manage")
  moderate(@Param("listingId") listingId: string, @Body() dto: ModerateTravelListingDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.travel.moderate(admin, listingId, dto);
  }

  @Post("listings/:listingId/verification")
  @RequireAdminPermission("travel.manage")
  setVerification(@Param("listingId") listingId: string, @Body() dto: SetTravelListingVerificationDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.travel.setVerification(admin, listingId, dto);
  }
}
