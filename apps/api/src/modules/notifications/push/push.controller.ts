import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { PUSH_ENDPOINT_MAX_LENGTH } from "./push-endpoint.util";
import { PushSubscriptionService } from "./push-subscription.service";

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

class PushKeysDto {
  /** Browser's P-256 ECDH public key (65 bytes, base64url ≈ 87 chars). */
  @IsString() @MaxLength(128) @Matches(BASE64URL) p256dh!: string;
  /** Browser's 16-byte auth secret (base64url ≈ 22 chars). */
  @IsString() @MaxLength(64) @Matches(BASE64URL) auth!: string;
}

/** The shape PushSubscription.toJSON() produces in the browser. */
class PushSubscribeDto {
  @IsString() @MaxLength(PUSH_ENDPOINT_MAX_LENGTH) endpoint!: string;
  @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
  @IsOptional() @IsNumber() expirationTime?: number | null;
}

class PushEndpointDto {
  @IsString() @MaxLength(PUSH_ENDPOINT_MAX_LENGTH) endpoint!: string;
}

class PushTestDto {
  @IsOptional() @IsString() @MaxLength(PUSH_ENDPOINT_MAX_LENGTH) endpoint?: string;
  @IsOptional() @IsIn(["fa", "en", "de", "es", "ar", "nl"]) locale?: string;
}

/** Public: the application server key is public by design, and the page needs it before the member opts in. */
@Controller("push")
export class PushConfigController {
  constructor(private readonly subscriptions: PushSubscriptionService) {}

  @Get("config")
  config() {
    return this.subscriptions.publicConfig();
  }
}

/** Every route acts on the caller's own subscriptions only; there is no userId parameter to get wrong. */
@Controller("push/subscriptions")
@UseGuards(SessionAuthGuard)
export class PushSubscriptionsController {
  constructor(private readonly subscriptions: PushSubscriptionService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.subscriptions.list(user.id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  subscribe(@CurrentUser() user: SessionUser, @Body() dto: PushSubscribeDto, @Headers("user-agent") userAgent?: string) {
    return this.subscriptions.subscribe(user.id, dto, userAgent);
  }

  /** This browser opts out (by endpoint). A POST, not a DELETE with a body, so every proxy passes it through. */
  @Post("remove")
  @HttpCode(200)
  unsubscribe(@CurrentUser() user: SessionUser, @Body() dto: PushEndpointDto) {
    return this.subscriptions.unsubscribe(user.id, dto.endpoint);
  }

  @Delete(":id")
  remove(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.subscriptions.remove(user.id, id);
  }

  @Post("test")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  test(@CurrentUser() user: SessionUser, @Body() dto: PushTestDto) {
    return this.subscriptions.sendTest(user.id, dto.locale ?? user.locale ?? "fa", dto.endpoint);
  }
}
