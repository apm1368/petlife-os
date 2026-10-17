import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderBookingsService } from "./provider-bookings.service";
import { RideProgressService } from "./ride-progress.service";
import { ListProviderBookingsDto } from "./dto/list-provider-bookings.dto";
import { AddBookingProviderNoteDto, RecordRideEventDto, CompleteBookingDto, ProviderCancelBookingDto, RejectBookingRequestDto } from "./dto/provider-booking-actions.dto";

@Controller("provider/bookings")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderBookingsController {
  constructor(
    private readonly bookings: ProviderBookingsService,
    private readonly rides: RideProgressService,
  ) {}

  /** Pet taxi: route, declared needs, pickup contact and the manual progress timeline. */
  @Get(":id/ride")
  ride(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.rides.get(ctx, id);
  }

  @Post(":id/ride-events")
  recordRideEvent(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RecordRideEventDto) {
    return this.rides.record(ctx, id, dto.type, dto.note);
  }

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

  @Post(":id/accept")
  accept(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.accept(ctx, id);
  }

  @Post(":id/reject")
  reject(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RejectBookingRequestDto) {
    return this.bookings.reject(ctx, id, dto.reason);
  }

  @Post(":id/no-show")
  noShow(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.markNoShow(ctx, id);
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
