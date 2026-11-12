import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { PetTaxiCarrierSize, PetTaxiRideStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { PetTaxiService } from "./pet-taxi.service";

class PointDto {
  @IsString() @Length(1, 200) label!: string;
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsOptional() @IsString() @Length(1, 120) city?: string;
  @IsOptional() @IsString() @Length(1, 300) note?: string;
}

class QuoteDto {
  @ValidateNested() @Type(() => PointDto) pickup!: PointDto;
  @ValidateNested() @Type(() => PointDto) dropoff!: PointDto;
  @IsIn(Object.values(PetTaxiCarrierSize)) carrierSize!: PetTaxiCarrierSize;
  @IsInt() @Min(1) @Max(4) petCount!: number;
}

class RequestRideDto {
  @ValidateNested() @Type(() => PointDto) pickup!: PointDto;
  @ValidateNested() @Type(() => PointDto) dropoff!: PointDto;
  @IsIn(Object.values(PetTaxiCarrierSize)) carrierSize!: PetTaxiCarrierSize;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsUUID("4", { each: true }) petIds!: string[];
}

class CancelDto {
  @IsOptional() @IsString() @Length(2, 300) reason?: string;
}

class RateDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @Length(1, 500) comment?: string;
}

class PresenceDto {
  @IsBoolean() online!: boolean;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}

const DRIVER_STEPS = [PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP, PetTaxiRideStatus.COMPLETED] as const;
class AdvanceDto {
  @IsIn(DRIVER_STEPS) status!: (typeof DRIVER_STEPS)[number];
}
class ReleaseDto {
  @IsString() @Length(3, 200) reason!: string;
}

/** The member side: fare, request, follow, cancel, rate. */
@Controller("pet-taxi")
@UseGuards(SessionAuthGuard)
export class PetTaxiController {
  constructor(private readonly taxi: PetTaxiService) {}

  @Post("quote")
  quote(@Body() dto: QuoteDto) {
    return this.taxi.quote(dto);
  }

  @Post("rides")
  request(@CurrentUser() user: SessionUser, @Body() dto: RequestRideDto, @Headers("idempotency-key") key?: string) {
    return this.taxi.request(user.id, dto, key);
  }

  @Get("rides")
  list(@CurrentUser() user: SessionUser) {
    return this.taxi.list(user.id);
  }

  @Get("rides/:id")
  get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.taxi.memberView(id, user.id);
  }

  @Post("rides/:id/cancel")
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CancelDto) {
    return this.taxi.cancelByMember(id, user.id, dto.reason);
  }

  @Post("rides/:id/rate")
  rate(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RateDto) {
    return this.taxi.rate(id, user.id, dto.rating, dto.comment);
  }
}

/** The driver side, for members of a verified PET_TAXI provider organization. */
@Controller("provider/pet-taxi")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderPetTaxiController {
  constructor(private readonly taxi: PetTaxiService) {}

  @Get()
  state(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.taxi.driverState(ctx);
  }

  @Post("presence")
  presence(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: PresenceDto) {
    return this.taxi.presence(ctx, dto);
  }

  @Post("rides/:id/accept")
  accept(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.taxi.accept(ctx, id);
  }

  @Post("rides/:id/decline")
  decline(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.taxi.decline(ctx, id);
  }

  @Post("rides/:id/status")
  advance(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AdvanceDto) {
    return this.taxi.advance(ctx, id, dto.status);
  }

  @Post("rides/:id/release")
  release(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReleaseDto) {
    return this.taxi.release(ctx, id, dto.reason);
  }
}
