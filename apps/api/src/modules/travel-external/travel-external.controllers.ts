import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUrl, Length, Matches, Max, Min } from "class-validator";
import type { Response } from "express";
import { ExternalAvailability, ExternalImagePolicy, ExternalMatchStatus, ExternalPriceBasis, ExternalPublishState, ExternalStayStatus, ExternalSyncKind, PetEvidenceType } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { CurrentUser, OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { PaginationQueryDto } from "../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { TravelExternalPublicService } from "./travel-external-public.service";
import { TravelExternalAdminService } from "./travel-external-admin.service";
import { OVERRIDABLE } from "./travel-external.service";

const bool = ({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
class ContextDto {
  @IsOptional() @Matches(DATE) checkIn?: string;
  @IsOptional() @Matches(DATE) checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) guests?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) pets?: number;
}
class SearchDto extends ContextDto {
  @IsOptional() @IsString() @Length(1, 60) city?: string;
  @IsOptional() @IsString() @Length(1, 40) stayType?: string;
  @IsOptional() @IsString() @Length(2, 30) source?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Transform(bool) @IsBoolean() instantBooking?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() dogs?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() cats?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}
class AttachDto extends ContextDto {
  @IsString() @Matches(/^[0-9a-f-]{36}$/) stayId!: string;
}

@Controller("travel/external")
export class TravelExternalPublicController {
  constructor(private readonly svc: TravelExternalPublicService) {}

  @Get("stays")
  search(@Query() q: SearchDto) { return this.svc.search(q); }

  @Get("stays/:id")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  detail(@Param("id", ParseUUIDPipe) id: string, @Query() q: ContextDto) { return this.svc.detail(id, q); }

  /** Outbound: logs the click, then 302 to the validated source URL. Never creates a PET LIFE booking. */
  @Get("stays/:id/out")
  @UseGuards(OptionalSessionAuthGuard)
  async out(@Param("id", ParseUUIDPipe) id: string, @Query() q: ContextDto, @OptionalCurrentUser() user: SessionUser | undefined, @Res() res: Response) {
    const url = await this.svc.outbound(id, user?.id ?? null, q.checkIn || q.guests ? { ...q } : null);
    res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
    res.redirect(302, url);
  }
}

@Controller("me/external-stays")
@UseGuards(SessionAuthGuard)
export class ExternalStayFavoritesController {
  constructor(private readonly svc: TravelExternalPublicService) {}
  @Get("favorites")
  list(@CurrentUser() u: SessionUser) { return this.svc.favorites(u.id); }
  @Post(":id/favorite")
  save(@CurrentUser() u: SessionUser, @Param("id", ParseUUIDPipe) id: string) { return this.svc.favorite(u.id, id, true); }
  @Delete(":id/favorite")
  unsave(@CurrentUser() u: SessionUser, @Param("id", ParseUUIDPipe) id: string) { return this.svc.favorite(u.id, id, false); }
}

@Controller("pets/:petId/trips/:tripId/external-stays")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class TripExternalStaysController {
  constructor(private readonly svc: TravelExternalPublicService) {}
  @Get()
  @RequirePetAccess("canViewIdentity")
  list(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string) { return this.svc.tripStaysForPet(petId, tripId); }
  @Post()
  @RequirePetAccess("canEditCareProfile")
  attach(@CurrentUser() u: SessionUser, @Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Body() dto: AttachDto) {
    return this.svc.attachToTrip(u.id, petId, tripId, dto.stayId, dto.checkIn && dto.checkOut ? { checkIn: dto.checkIn, checkOut: dto.checkOut, guests: dto.guests ?? 2, pets: dto.pets } : undefined);
  }
  @Delete(":stayId")
  @RequirePetAccess("canEditCareProfile")
  detach(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Param("stayId", ParseUUIDPipe) stayId: string) { return this.svc.detachFromTrip(petId, tripId, stayId); }
}

// ------------------------------------------------------------------ admin
class ReasonDto { @IsString() @Length(5, 500) reason!: string; }
class ConfigDto extends ReasonDto {
  @IsOptional() @IsInt() @Min(60) @Max(10080) syncIntervalMinutes?: number;
  @IsOptional() @IsInt() @Min(15) @Max(10080) priceTtlMinutes?: number;
  @IsOptional() @IsInt() @Min(60) @Max(43200) metadataTtlMinutes?: number;
  @IsOptional() @IsIn(Object.values(ExternalImagePolicy)) imagePolicy?: ExternalImagePolicy;
  @IsOptional() @IsInt() @Min(1) @Max(500) maxRequestsPerRun?: number;
  @IsOptional() @IsInt() @Min(1000) @Max(30000) timeoutMs?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5) retryCount?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) cityScopes?: string[];
  @IsOptional() @IsBoolean() autoPublish?: boolean;
}
class RunDto { @IsIn(Object.values(ExternalSyncKind)) kind!: ExternalSyncKind; @IsOptional() @IsString() @Matches(/^[0-9a-f-]{36}$/) listingId?: string; }
class ListingsDto extends PaginationQueryDto {
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsIn(Object.values(ExternalStayStatus)) status?: ExternalStayStatus;
  @IsOptional() @IsIn(Object.values(ExternalPublishState)) publishState?: ExternalPublishState;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() @Length(1, 100) q?: string;
}
class ManualStayDto {
  @IsString() @Length(2, 30) sourceCode!: string;
  @IsUrl({ protocols: ["https"], require_protocol: true }) sourceUrl!: string;
  @IsOptional() @IsString() @Length(1, 120) sourceListingId?: string;
  @IsString() @Length(2, 200) title!: string;
  @IsString() @Length(2, 60) city!: string;
  @IsOptional() @IsString() @Length(1, 60) province?: string;
  @IsOptional() @IsString() @Length(1, 80) area?: string;
  @IsOptional() @IsString() @Length(1, 40) stayType?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) capacity?: number;
  @IsIn([PetEvidenceType.SOURCE_FILTER, PetEvidenceType.SOURCE_AMENITY, PetEvidenceType.SOURCE_POLICY_TEXT]) petEvidenceType!: PetEvidenceType;
  @IsString() @Length(5, 500) petEvidenceText!: string;
  @IsOptional() @IsObject() petPolicy?: Record<string, string | number | boolean>;
  @IsOptional() @IsBoolean() instantBooking?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) imageUrls?: string[];
}
class PriceDto {
  @Matches(DATE) checkIn!: string;
  @Matches(DATE) checkOut!: string;
  @IsInt() @Min(1) @Max(30) guests!: number;
  @IsOptional() @IsInt() @Min(0) pets?: number;
  @IsOptional() @IsInt() @Min(0) priceIrr?: number;
  @IsOptional() @IsInt() @Min(0) oldPriceIrr?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) discountPercent?: number;
  @IsIn(Object.values(ExternalPriceBasis)) priceBasis!: ExternalPriceBasis;
  @IsIn(Object.values(ExternalAvailability)) availability!: ExternalAvailability;
  @IsISO8601() observedAt!: string;
}
class OverrideDto { @IsIn(OVERRIDABLE as unknown as string[]) field!: (typeof OVERRIDABLE)[number]; @IsOptional() @IsString() @Length(1, 500) value?: string | null; }
class VisibilityDto extends ReasonDto { @IsIn(["hide", "unhide", "publish", "unpublish"]) action!: "hide" | "unhide" | "publish" | "unpublish"; }
class MatchQueryDto { @IsOptional() @IsIn(Object.values(ExternalMatchStatus)) status?: ExternalMatchStatus; }

@Controller("admin/travel/external")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminTravelExternalController {
  constructor(private readonly admin: TravelExternalAdminService) {}

  @Get("dashboard") @RequireAdminPermission("travel.source.view") dashboard() { return this.admin.dashboard(); }
  @Get("sources") @RequireAdminPermission("travel.source.view") sources() { return this.admin.sources(); }
  @Get("sources/:code") @RequireAdminPermission("travel.source.view") source(@Param("code") code: string) { return this.admin.sourceDetail(code); }
  @Patch("sources/:code") @RequireAdminPermission("travel.source.manage") config(@CurrentAdmin() a: ResolvedAdminContext, @Param("code") code: string, @Body() dto: ConfigDto) { const { reason, ...input } = dto; return this.admin.updateConfig(a, code, input, reason); }
  @Post("sources/:code/pause") @RequireAdminPermission("travel.source.manage") pause(@CurrentAdmin() a: ResolvedAdminContext, @Param("code") code: string, @Body() dto: ReasonDto) { return this.admin.setPaused(a, code, true, dto.reason); }
  @Post("sources/:code/resume") @RequireAdminPermission("travel.source.manage") resume(@CurrentAdmin() a: ResolvedAdminContext, @Param("code") code: string, @Body() dto: ReasonDto) { return this.admin.setPaused(a, code, false, dto.reason); }
  @Post("sources/:code/probe") @RequireAdminPermission("travel.sync.run") probe(@CurrentAdmin() a: ResolvedAdminContext, @Param("code") code: string) { return this.admin.probe(a, code); }
  @Post("sources/:code/runs") @RequireAdminPermission("travel.sync.run") run(@CurrentAdmin() a: ResolvedAdminContext, @Param("code") code: string, @Body() dto: RunDto) { return this.admin.run(a, code, dto.kind, dto.listingId); }
  @Get("runs") @RequireAdminPermission("travel.source.view") runs(@Query() q: PaginationQueryDto & { source?: string }) { return this.admin.runs(q); }
  @Get("listings") @RequireAdminPermission("travel.source.view") listings(@Query() q: ListingsDto) { return this.admin.listings(q); }
  @Get("listings/:id") @RequireAdminPermission("travel.source.view") inspect(@Param("id", ParseUUIDPipe) id: string) { return this.admin.inspect(id); }
  @Post("listings") @RequireAdminPermission("travel.listing.manage") manual(@CurrentAdmin() a: ResolvedAdminContext, @Body() dto: ManualStayDto) { return this.admin.manualUpsert(a, dto); }
  @Post("listings/:id/visibility") @RequireAdminPermission("travel.listing.manage") visibility(@CurrentAdmin() a: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VisibilityDto) { return this.admin.setVisibility(a, id, dto.action, dto.reason); }
  @Post("listings/:id/override") @RequireAdminPermission("travel.override.manage") override(@CurrentAdmin() a: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OverrideDto) { return this.admin.setOverride(a, id, dto.field, dto.value ?? null); }
  @Post("listings/:id/prices")
  @RequireAdminPermission("travel.listing.manage")
  price(@CurrentAdmin() a: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PriceDto) {
    return this.admin.recordPrice(a, id, { checkIn: dto.checkIn, checkOut: dto.checkOut, guests: dto.guests, pets: dto.pets }, { priceIrr: dto.priceIrr ?? null, oldPriceIrr: dto.oldPriceIrr ?? null, discountPercent: dto.discountPercent ?? null, priceBasis: dto.priceBasis, availability: dto.availability }, new Date(dto.observedAt));
  }
  @Get("matches") @RequireAdminPermission("travel.source.view") matches(@Query() q: MatchQueryDto) { return this.admin.matchCandidates(q.status); }
  @Post("matches/:id/approve") @RequireAdminPermission("travel.listing.manage") approve(@CurrentAdmin() a: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) { return this.admin.reviewMatch(a, id, true); }
  @Post("matches/:id/reject") @RequireAdminPermission("travel.listing.manage") reject(@CurrentAdmin() a: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) { return this.admin.reviewMatch(a, id, false); }
}
