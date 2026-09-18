import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { SupportNeedModerationService } from "./support-need-moderation.service";
import { ListAdminSupportNeedListingsQueryDto, ReviewSupportNeedListingDto } from "../../animal-support/dto/support-need.dto";

/** Classifieds moderation, gated by the existing trust.view/trust.manage permissions — never a new classifieds-specific permission. */
@Controller("admin/animal-support/needs")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSupportNeedController {
  constructor(private readonly moderation: SupportNeedModerationService) {}

  @Get()
  @RequireAdminPermission("trust.view")
  list(@Query() query: ListAdminSupportNeedListingsQueryDto) {
    return this.moderation.list(query);
  }

  @Get(":listingId")
  @RequireAdminPermission("trust.view")
  get(@Param("listingId") listingId: string) {
    return this.moderation.get(listingId);
  }

  /** Publish / reject / remove / expire — every outcome is audited. */
  @Post(":listingId/review")
  @RequireAdminPermission("trust.manage")
  review(@Param("listingId") listingId: string, @Body() dto: ReviewSupportNeedListingDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.moderation.review(admin, listingId, dto);
  }
}
