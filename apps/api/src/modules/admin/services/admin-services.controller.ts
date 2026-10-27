import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { BookingStatus, ProviderReviewStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminServicesService } from "./admin-services.service";

class AdminBookingListQueryDto {
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @IsUUID() providerId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}

class ProviderFilterDto {
  @IsOptional() @IsUUID() providerId?: string;
}

class ReviewFilterDto {
  @IsOptional() @IsEnum(ProviderReviewStatus) status?: ProviderReviewStatus;
}

class AnalyticsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

class ReasonDto {
  @IsString() @MaxLength(500) reason!: string;
}

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminServicesController {
  constructor(private readonly services: AdminServicesService) {}

  @Get("service-bookings")
  @RequireAdminPermission("services.view")
  listBookings(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: AdminBookingListQueryDto) {
    return this.services.listBookings(admin, query);
  }

  @Get("service-bookings/:id")
  @RequireAdminPermission("services.view")
  getBooking(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.services.getBooking(admin, id);
  }

  @Get("provider-services")
  @RequireAdminPermission("services.view")
  listServices(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: ProviderFilterDto) {
    return this.services.listServices(admin, query.providerId);
  }

  @Post("provider-services/:id/deactivate")
  @RequireAdminPermission("services.manage")
  deactivate(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.services.setServiceActive(admin, id, false, dto.reason);
  }

  @Post("provider-services/:id/reactivate")
  @RequireAdminPermission("services.manage")
  reactivate(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.services.setServiceActive(admin, id, true, dto.reason);
  }

  @Get("provider-reviews")
  @RequireAdminPermission("services.view")
  listReviews(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: ReviewFilterDto) {
    return this.services.listReviews(admin, query.status);
  }

  @Post("provider-reviews/:id/hide")
  @RequireAdminPermission("services.manage")
  hideReview(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.services.hideReview(admin, id, dto.reason);
  }

  @Get("service-waitlist")
  @RequireAdminPermission("services.view")
  waitlist(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: ProviderFilterDto) {
    return this.services.listWaitlist(admin, query.providerId);
  }

  @Get("services-analytics")
  @RequireAdminPermission("services.view")
  analytics(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: AnalyticsQueryDto) {
    return this.services.analytics(admin, query.days ?? 30);
  }
}
