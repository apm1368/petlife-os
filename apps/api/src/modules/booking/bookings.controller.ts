import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { IsBooleanString, IsOptional, IsUUID } from "class-validator";
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

class ListBookingsDto {
  @IsOptional()
  @IsBooleanString()
  upcoming?: string;

  @IsOptional()
  @IsBooleanString()
  past?: string;

  @IsOptional()
  @IsUUID()
  petId?: string;
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
      petId: query.petId,
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
}
