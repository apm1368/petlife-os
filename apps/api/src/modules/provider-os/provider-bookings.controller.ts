import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderBookingsService } from "./provider-bookings.service";
import { ListProviderBookingsDto } from "./dto/list-provider-bookings.dto";
import { AddBookingProviderNoteDto, CompleteBookingDto, ProviderCancelBookingDto } from "./dto/provider-booking-actions.dto";

@Controller("provider/bookings")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderBookingsController {
  constructor(private readonly bookings: ProviderBookingsService) {}

  @Get()
  list(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: ListProviderBookingsDto) {
    return this.bookings.list(ctx, query);
  }

  @Get(":id")
  getById(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.bookings.getById(ctx, id);
  }

  @Post(":id/confirm")
  confirm(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.bookings.confirm(ctx, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string, @Body() dto: ProviderCancelBookingDto) {
    return this.bookings.cancel(ctx, id, dto);
  }

  @Post(":id/check-in")
  checkIn(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.bookings.checkIn(ctx, id);
  }

  @Post(":id/start")
  start(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.bookings.start(ctx, id);
  }

  @Post(":id/complete")
  complete(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string, @Body() dto: CompleteBookingDto) {
    return this.bookings.complete(ctx, id, dto);
  }

  @Post(":id/notes")
  addNote(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string, @Body() dto: AddBookingProviderNoteDto) {
    return this.bookings.addNote(ctx, id, dto);
  }
}
