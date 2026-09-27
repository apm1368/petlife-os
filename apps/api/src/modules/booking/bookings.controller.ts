import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { IsBooleanString, IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../common/session/session.service";
import { CreateBookingHoldDto } from "./dto/create-booking-hold.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { BookingsService } from "./bookings.service";
import { PayBookingDto } from "./dto/pay-booking.dto";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto";

class ListBookingsDto {
  @IsOptional()
  @IsBooleanString()
  upcoming?: string;

  @IsOptional()
  @IsBooleanString()
  past?: string;

  @IsOptional()
  @IsBooleanString()
  cancelled?: string;

  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsBooleanString()
  requested?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

class CreateSeriesDto {
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(8)
  occurrences!: number;

  /** Custom recurrence: every N weeks (1 = weekly). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  intervalWeeks?: number;
}

@Controller()
@UseGuards(SessionAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post("booking-holds")
  @UseGuards(PetAccessGuard)
  @RequirePetAccess("canBookCare")
  createHold(@CurrentUser() user: SessionUser, @Body() dto: CreateBookingHoldDto) {
    return this.bookingsService.createHold(user.id, dto);
  }

  @Post("bookings")
  @UseGuards(PetAccessGuard)
  @RequirePetAccess("canBookCare")
  @UseInterceptors(IdempotencyInterceptor)
  confirm(@CurrentUser() user: SessionUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.confirm(user.id, dto);
  }

  @Get("bookings")
  list(@CurrentUser() user: SessionUser, @Query() query: ListBookingsDto) {
    return this.bookingsService.list(user.id, {
      upcoming: query.upcoming === "true",
      past: query.past === "true",
      cancelled: query.cancelled === "true",
      requested: query.requested === "true",
      petId: query.petId,
      serviceId: query.serviceId,
      providerId: query.providerId,
      from: query.from,
      to: query.to,
    });
  }

  @Get("bookings/:id")
  getById(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.bookingsService.getById(user.id, id);
  }

  @Post("bookings/:id/cancel")
  cancel(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancel(user.id, id, dto);
  }

  @Post("bookings/:id/pay")
  @UseInterceptors(IdempotencyInterceptor)
  pay(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PayBookingDto) {
    return this.bookingsService.pay(user.id, id, dto);
  }

  @Post("bookings/:id/reschedule")
  @UseInterceptors(IdempotencyInterceptor)
  reschedule(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookingsService.reschedule(user.id, id, dto);
  }

  @Post("bookings/:id/cancel-following")
  cancelFollowing(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancelSeriesFrom(user.id, id, dto.reason);
  }

  @Post("bookings/:id/recur")
  recur(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: CreateSeriesDto) {
    return this.bookingsService.createWeeklySeries(user.id, id, dto.occurrences, dto.intervalWeeks ?? 1);
  }
}
