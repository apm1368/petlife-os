import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { BookingStatus, ProviderReviewStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminServicesService } from "./admin-services.service";
import { AdminBookingMoneyService, type StaffRefundChoice } from "../finance/admin-booking-money.service";

/** Staff cancellation: a reason, and what goes back (the booking's own terms, everything, a set amount, or nothing). */
export class StaffCancelBookingDto {
  @IsString() @Length(3, 500) reason!: string;
  @IsIn(["POLICY", "FULL", "AMOUNT", "NONE"]) refund!: StaffRefundChoice;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amount?: number;
}

/** A refund without cancelling (goodwill or partial); always through a finance approval. */
export class StaffRefundBookingDto {
  @Type(() => Number) @IsInt() @Min(1) amount!: number;
  @IsString() @Length(3, 500) reason!: string;
}

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
  constructor(
    private readonly services: AdminServicesService,
    private readonly money: AdminBookingMoneyService,
  ) {}

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

  /** Paid, refunded, refundable and policy amounts, plus this booking's refund approvals. */
  @Get("service-bookings/:id/money")
  @RequireAdminPermission("services.view")
  async bookingMoney(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    await this.services.getBooking(admin, id); // vertical scope check
    return this.money.serviceBookingMoney(id);
  }

  @Post("service-bookings/:id/cancel")
  @RequireAdminPermission("services.manage")
  async cancelBooking(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: StaffCancelBookingDto, @Req() req: AdminAuthedRequest) {
    await this.services.getBooking(admin, id);
    return this.money.cancelServiceBooking(admin, id, dto, req.requestId);
  }

  @Post("service-bookings/:id/refund")
  @RequireAdminPermission("finance.refund.request")
  async refundBooking(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: StaffRefundBookingDto, @Req() req: AdminAuthedRequest) {
    await this.services.getBooking(admin, id);
    return this.money.refundServiceBooking(admin, id, dto, req.requestId);
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
