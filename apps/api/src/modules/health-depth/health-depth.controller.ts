import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";
import { CareSuggestionStatus, ProviderUserRole } from "@prisma/client";
import type { Request } from "express";
import type { PetAccessFlags } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser, type AuthedRequest } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetAccessDeniedException } from "../../common/errors/api-exception";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { RequireProviderRole } from "../provider-os/auth/require-provider-role.decorator";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { CARE_TYPES, RECURRENCES } from "../care-reminders/care-time";
import { HEALTH_FEED_TYPES, HEALTH_SOURCES, HealthDepthService, type HealthFeedType, type HealthSource } from "./health-depth.service";
import { HEALTH_SHARE_SECTIONS, HealthShareService, type HealthShareSection } from "./health-share.service";
import { CareSuggestionService } from "./care-suggestion.service";

const csv = ({ value }: { value: unknown }) => (typeof value === "string" ? value.split(",").filter(Boolean) : value);

class HealthFeedQueryDto {
  @IsOptional() @Transform(csv) @IsArray() @IsIn(HEALTH_FEED_TYPES, { each: true }) types?: HealthFeedType[];
  @IsOptional() @Transform(csv) @IsArray() @IsIn(HEALTH_SOURCES, { each: true }) sources?: HealthSource[];
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
class CreateHealthShareDto {
  @IsArray() @ArrayUnique() @IsIn(HEALTH_SHARE_SECTIONS, { each: true }) sections!: HealthShareSection[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID(undefined, { each: true }) labResultIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID(undefined, { each: true }) clinicalVisitIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID(undefined, { each: true }) imagingStudyIds?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(168) expiresInHours?: number;
  @IsOptional() @IsString() @Length(1, 80) label?: string;
}
class SuggestionListQueryDto {
  @IsOptional() @IsIn(Object.values(CareSuggestionStatus)) status?: CareSuggestionStatus;
}
class AcceptSuggestionDto {
  @IsOptional() @IsISO8601({ strict: true }) dueAt?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() assignedToUserId?: string | null;
}
class CareSuggestionItemDto {
  @IsString() @Length(1, 200) title!: string;
  @IsIn(CARE_TYPES) type!: string;
  @IsISO8601({ strict: true }) suggestedDueAt!: string;
  @IsOptional() @IsIn(RECURRENCES) recurrence?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class CreateCareSuggestionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => CareSuggestionItemDto) items!: CareSuggestionItemDto[];
}

type PetReq = AuthedRequest & { petAccess?: PetAccessFlags };

/** G12: health snapshot + canonical feed, owner-composed health shares, and clinic care suggestions (owner side). */
@Controller("pets/:petId")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class HealthDepthController {
  constructor(
    private readonly health: HealthDepthService,
    private readonly shares: HealthShareService,
    private readonly suggestions: CareSuggestionService,
  ) {}

  @Get("health/snapshot")
  @RequirePetAccess("canViewHealth")
  snapshot(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.health.snapshot(petId);
  }

  @Get("health/feed")
  @RequirePetAccess("canViewHealth")
  feed(@Param("petId", ParseUUIDPipe) petId: string, @Query() q: HealthFeedQueryDto) {
    return this.health.feed(petId, q);
  }

  /** Sharing health needs both health access and the right to manage the pet's sharing. */
  @Post("health-shares")
  @RequirePetAccess("canViewHealth")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createShare(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateHealthShareDto, @Req() req: PetReq) {
    if (!req.petAccess?.canManageAccess) throw new PetAccessDeniedException({ petId, reason: "CAN_MANAGE_ACCESS_REQUIRED" });
    return this.shares.create(petId, user.id, dto);
  }

  @Get("health-shares")
  @RequirePetAccess("canViewHealth")
  listShares(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.shares.list(petId);
  }

  @Get("health-shares/:shareId/access-log")
  @RequirePetAccess("canManageAccess")
  accessLog(@Param("petId", ParseUUIDPipe) petId: string, @Param("shareId", ParseUUIDPipe) shareId: string) {
    return this.shares.accessLog(petId, shareId);
  }

  @Post("health-shares/:shareId/revoke")
  @RequirePetAccess("canManageAccess")
  revokeShare(@Param("petId", ParseUUIDPipe) petId: string, @Param("shareId", ParseUUIDPipe) shareId: string, @CurrentUser() user: SessionUser) {
    return this.shares.revoke(petId, shareId, user.id);
  }

  @Get("care-suggestions")
  @RequirePetAccess("canViewCareProfile")
  listSuggestions(@Param("petId", ParseUUIDPipe) petId: string, @Query() q: SuggestionListQueryDto) {
    return this.suggestions.list(petId, q.status);
  }

  @Post("care-suggestions/:suggestionId/accept")
  @RequirePetAccess("canEditCareProfile")
  accept(@Param("petId", ParseUUIDPipe) petId: string, @Param("suggestionId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser, @Body() dto: AcceptSuggestionDto) {
    return this.suggestions.accept(petId, id, user.id, dto);
  }

  @Post("care-suggestions/:suggestionId/dismiss")
  @RequirePetAccess("canEditCareProfile")
  dismiss(@Param("petId", ParseUUIDPipe) petId: string, @Param("suggestionId", ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser) {
    return this.suggestions.dismiss(petId, id, user.id);
  }
}

/** Public, unauthenticated read of an owner-created health share. Every read is logged. */
@Controller("public/health-shares")
export class PublicHealthShareController {
  constructor(private readonly shares: HealthShareService) {}

  @Get(":token")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  read(@Param("token") token: string, @Req() req: Request) {
    return this.shares.readPublic(token, { ip: req.ip, userAgent: req.headers["user-agent"] });
  }
}

/** Provider side of chain #1/#2: care instructions on a completed visit or booking of the caller's organisation. */
@Controller("provider")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderCareSuggestionController {
  constructor(private readonly suggestions: CareSuggestionService) {}

  @Post("clinical/visits/:visitId/care-suggestions")
  @RequireProviderRole(ProviderUserRole.OWNER, ProviderUserRole.VET)
  forVisit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("visitId", ParseUUIDPipe) visitId: string, @Body() dto: CreateCareSuggestionsDto) {
    return this.suggestions.createForSource(ctx.organizationId, ctx.providerUserId, { visitId }, dto.items);
  }

  @Post("bookings/:bookingId/care-suggestions")
  @RequireProviderRole(ProviderUserRole.OWNER, ProviderUserRole.VET, ProviderUserRole.STAFF)
  forBooking(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Body() dto: CreateCareSuggestionsDto) {
    return this.suggestions.createForSource(ctx.organizationId, ctx.providerUserId, { bookingId }, dto.items);
  }
}
