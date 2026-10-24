import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PetSpecies, TravelBookingStatus, TravelListingStatus, TravelRequirementRuleStatus, TravelRequirementType, TravelReviewStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminTravelService } from "./admin-travel.service";

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}
class ListingQueryDto extends PageDto {
  @IsOptional() @IsEnum(TravelListingStatus) status?: TravelListingStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
class BookingQueryDto extends PageDto {
  @IsOptional() @IsEnum(TravelBookingStatus) status?: TravelBookingStatus;
  @IsOptional() @IsString() @MaxLength(40) q?: string;
}
class ReviewQueryDto extends PageDto {
  @IsOptional() @IsEnum(TravelReviewStatus) status?: TravelReviewStatus;
}
class ModerateDto {
  @IsIn(["APPROVE", "REQUEST_CORRECTION", "SUSPEND", "REINSTATE"]) action!: "APPROVE" | "REQUEST_CORRECTION" | "SUSPEND" | "REINSTATE";
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class VerifyDto {
  @IsBoolean() isVerified!: boolean;
  @IsString() @Length(3, 500) reason!: string;
}
class VisibilityDto {
  @IsBoolean() hidden!: boolean;
  @IsString() @Length(3, 500) reason!: string;
}
class RuleQueryDto {
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsEnum(TravelRequirementRuleStatus) status?: TravelRequirementRuleStatus;
}
class RuleInputDto {
  @IsString() @Length(2, 2) country!: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string | null;
  @IsEnum(TravelRequirementType) requirementType!: TravelRequirementType;
  @IsString() @Length(3, 200) title!: string;
  @IsString() @Length(3, 4000) description!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsEnum(PetSpecies, { each: true }) species?: PetSpecies[];
  @IsString() @Length(2, 300) source!: string;
  @IsOptional() @IsUrl({ require_protocol: true }) sourceUrl?: string | null;
  @IsDateString() verifiedAt!: string;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsEnum(TravelRequirementRuleStatus) status?: TravelRequirementRuleStatus;
}
class AnalyticsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

/**
 * Admin Travel. Read: travel.view. Listing/review moderation and verification:
 * travel.manage. Requirement library: travel.requirements.manage. Booking
 * inspection is read-only; money only moves through booking terms or the
 * finance refund-approval workflow.
 */
@Controller("admin/travel")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminTravelController {
  constructor(private readonly travel: AdminTravelService) {}

  @Get("listings")
  @RequireAdminPermission("travel.view")
  listings(@Query() query: ListingQueryDto) {
    return this.travel.listListings(query);
  }

  @Get("listings/:id")
  @RequireAdminPermission("travel.view")
  listing(@Param("id", ParseUUIDPipe) id: string) {
    return this.travel.getListing(id);
  }

  @Post("listings/:id/moderate")
  @RequireAdminPermission("travel.manage")
  moderate(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ModerateDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.travel.moderate(admin, id, dto.action, dto.note, req.requestId);
  }

  @Post("listings/:id/verification")
  @RequireAdminPermission("travel.manage")
  verify(@Param("id", ParseUUIDPipe) id: string, @Body() dto: VerifyDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.travel.setVerified(admin, id, dto.isVerified, dto.reason, req.requestId);
  }

  @Get("bookings")
  @RequireAdminPermission("travel.view")
  bookings(@Query() query: BookingQueryDto) {
    return this.travel.listBookings(query);
  }

  @Get("bookings/:id")
  @RequireAdminPermission("travel.view")
  booking(@Param("id", ParseUUIDPipe) id: string) {
    return this.travel.getBooking(id);
  }

  @Get("reviews")
  @RequireAdminPermission("travel.view")
  reviews(@Query() query: ReviewQueryDto) {
    return this.travel.listReviews(query.status, query.page ?? 1);
  }

  @Patch("reviews/:id/visibility")
  @RequireAdminPermission("travel.manage")
  reviewVisibility(@Param("id", ParseUUIDPipe) id: string, @Body() dto: VisibilityDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.travel.setReviewVisibility(admin, id, dto.hidden, dto.reason, req.requestId);
  }

  @Get("requirement-rules")
  @RequireAdminPermission("travel.view")
  rules(@Query() query: RuleQueryDto) {
    return this.travel.listRules(query);
  }

  @Post("requirement-rules")
  @RequireAdminPermission("travel.requirements.manage")
  createRule(@Body() dto: RuleInputDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.travel.upsertRule(admin, null, dto, req.requestId);
  }

  @Patch("requirement-rules/:id")
  @RequireAdminPermission("travel.requirements.manage")
  updateRule(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RuleInputDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.travel.upsertRule(admin, id, dto, req.requestId);
  }

  @Get("partners")
  @RequireAdminPermission("travel.view")
  partners() {
    return this.travel.listPartners();
  }

  @Get("analytics")
  @RequireAdminPermission("travel.view")
  analytics(@Query() query: AnalyticsDto) {
    return this.travel.analytics(query.days ?? 30);
  }
}
