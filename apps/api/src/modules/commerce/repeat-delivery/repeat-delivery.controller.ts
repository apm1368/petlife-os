import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { RepeatDeliveryService } from "./repeat-delivery.service";

class CreateRepeatDeliveryDto {
  @IsUUID() sellerOfferId!: string;
  @IsInt() @Min(1) @Max(20) quantity!: number;
  @IsInt() @Min(7) @Max(180) intervalDays!: number;
  @IsUUID() addressId!: string;
  @IsOptional() @IsDateString() firstDeliveryAt?: string;
}

class UpdateRepeatDeliveryDto {
  @IsOptional() @IsInt() @Min(1) @Max(20) quantity?: number;
  @IsOptional() @IsInt() @Min(7) @Max(180) intervalDays?: number;
  @IsOptional() @IsUUID() addressId?: string;
}

@Controller("repeat-deliveries")
@UseGuards(SessionAuthGuard)
export class RepeatDeliveryController {
  constructor(private readonly repeat: RepeatDeliveryService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.repeat.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateRepeatDeliveryDto) {
    return this.repeat.create(user.id, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRepeatDeliveryDto) {
    return this.repeat.update(user.id, id, dto);
  }

  @Post(":id/skip")
  skip(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.skip(user.id, id);
  }

  @Post(":id/pause")
  pause(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.pause(user.id, id);
  }

  @Post(":id/resume")
  resume(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.resume(user.id, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.cancel(user.id, id);
  }

  @Post(":id/accept-price")
  acceptPrice(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.acceptCurrentPrice(user.id, id);
  }

  /** Puts this cycle in the cart at the live price; the customer then checks out normally. */
  @Post(":id/order-cycle")
  orderCycle(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.repeat.prepareCycleOrder(user.id, id);
  }
}
