import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, Length } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { PlaceClaimsService } from "./place-claims.service";

class ClaimPlaceDto {
  @IsOptional() @IsString() @Length(2, 500) message?: string;
}

/** "Is this your business? Claim it": signed-in members only; the answer says what to do next (partner sign-up, KYC, or wait). */
@Controller("places/:placeId/claim")
@UseGuards(SessionAuthGuard)
export class PlaceClaimsController {
  constructor(private readonly claims: PlaceClaimsService) {}

  @Post()
  claim(@CurrentUser() user: SessionUser, @Param("placeId", ParseUUIDPipe) placeId: string, @Body() dto: ClaimPlaceDto) {
    return this.claims.claim(user.id, placeId, dto.message);
  }

  @Get()
  mine(@CurrentUser() user: SessionUser, @Param("placeId", ParseUUIDPipe) placeId: string) {
    return this.claims.mine(user.id, placeId);
  }
}
