import { Body, Controller, Delete, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { Locale } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ConsumerHubService, RECENT_TYPES, SEARCH_TYPES, type RecentType, type SearchType } from "./consumer-hub.service";

class SearchQueryDto {
  @IsString() @Length(2, 80) q!: string;
  /** Comma-separated subset of PROVIDER, SERVICE, PRODUCT, TRAVEL_LISTING, PLACE, ARTICLE, SUPPORT_NEED, ORGANIZATION. */
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.split(",").filter(Boolean) : value)) @IsArray() @ArrayMaxSize(8) @IsIn(SEARCH_TYPES, { each: true }) types?: SearchType[];
  @IsOptional() @IsString() @Length(1, 80) city?: string;
  @IsOptional() @IsIn(["fa", "en"]) locale?: "fa" | "en";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}
class RecordViewDto {
  @IsIn(RECENT_TYPES) entityType!: RecentType;
  @IsUUID() entityId!: string;
}
class LocaleQueryDto {
  @IsOptional() @IsIn(["fa", "en"]) locale?: "fa" | "en";
}

/** Public search across catalogue types only (never private data). */
@Controller("search")
export class SearchController {
  constructor(private readonly hub: ConsumerHubService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Query() query: SearchQueryDto) {
    return this.hub.search({ q: query.q, types: query.types, city: query.city, locale: (query.locale ?? "fa") as Locale, limit: query.limit });
  }
}

@Controller("me")
@UseGuards(SessionAuthGuard)
export class ConsumerHubController {
  constructor(private readonly hub: ConsumerHubService) {}

  /** Everything the member saved, across domains, newest first, with a type discriminator and preview. */
  @Get("saved")
  saved(@CurrentUser() user: SessionUser) {
    return this.hub.saved(user.id);
  }

  @Get("recently-viewed")
  recent(@CurrentUser() user: SessionUser, @Query() query: LocaleQueryDto) {
    return this.hub.recentlyViewed(user.id, (query.locale ?? user.locale) as Locale);
  }

  @Post("recently-viewed")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  record(@CurrentUser() user: SessionUser, @Body() dto: RecordViewDto) {
    return this.hub.recordView(user.id, dto.entityType, dto.entityId);
  }

  @Delete("recently-viewed")
  clear(@CurrentUser() user: SessionUser) {
    return this.hub.clearRecentlyViewed(user.id);
  }
}
