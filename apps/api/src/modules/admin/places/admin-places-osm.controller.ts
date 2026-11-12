import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { OsmDirectoryService } from "../../places/osm/osm-directory.service";
import { PlaceClaimsService } from "../../places/osm/place-claims.service";

class AreaDto {
  @IsString() @Length(2, 120) city!: string;
  @IsOptional() @IsString() @Length(2, 120) province?: string;
  @IsLatitude() south!: number;
  @IsLongitude() west!: number;
  @IsLatitude() north!: number;
  @IsLongitude() east!: number;
  @IsBoolean() active!: boolean;
}

class ClaimsQueryDto {
  @IsOptional() @IsIn(["PENDING", "APPROVED"]) status?: "PENDING" | "APPROVED";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class ReleaseClaimDto {
  @IsString() @Length(3, 500) reason!: string;
}

class DecideClaimDto {
  @IsBoolean() approve!: boolean;
  @IsString() @Length(3, 500) reason!: string;
}

/** OpenStreetMap seeding of the places directory (areas, runs) and business claims on listings. */
@Controller("admin/places")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPlacesOsmController {
  private readonly logger = new Logger(AdminPlacesOsmController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly osm: OsmDirectoryService,
    private readonly claims: PlaceClaimsService,
    private readonly audit: AdminAuditLogService,
  ) {}

  @Get("osm/areas")
  @RequireAdminPermission("places.view")
  async areas() {
    const [areas, totals] = await Promise.all([
      this.prisma.osmSyncArea.findMany({ orderBy: { city: "asc" }, include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } } }),
      this.prisma.petFriendlyPlace.groupBy({ by: ["city"], where: { source: "OSM", isPubliclyListed: true }, _count: { _all: true } }),
    ]);
    const listed = new Map(totals.map((t) => [t.city, t._count._all]));
    return areas.map(({ runs, ...a }) => ({
      ...a,
      lastRunAt: a.lastRunAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      listedPlaces: listed.get(a.city) ?? 0,
      lastRun: runs[0] ? { ...runs[0], startedAt: runs[0].startedAt.toISOString(), finishedAt: runs[0].finishedAt?.toISOString() ?? null } : null,
    }));
  }

  @Put("osm/areas")
  @RequireAdminPermission("places.manage")
  async upsertArea(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: AreaDto, @Req() request: AdminAuthedRequest) {
    if (dto.south >= dto.north || dto.west >= dto.east) throw new ValidationApiException({ field: "bbox", reason: "SOUTH_WEST_MUST_BE_BELOW_NORTH_EAST" });
    // Overpass fair use: a city-sized box only (about 1.5° either way at most).
    if (dto.north - dto.south > 1.5 || dto.east - dto.west > 1.5) throw new ValidationApiException({ field: "bbox", reason: "AREA_TOO_LARGE" });
    const data = { province: dto.province?.trim() || null, south: dto.south, west: dto.west, north: dto.north, east: dto.east, active: dto.active };
    const area = await this.prisma.osmSyncArea.upsert({ where: { city: dto.city.trim() }, create: { city: dto.city.trim(), ...data }, update: data });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "osm_area.updated", entityType: "OsmSyncArea", entityId: area.id, afterSummary: { city: area.city, ...data }, requestId: request.requestId });
    return this.areas();
  }

  /** Starts one area now (in the background); the run shows up in the list when it finishes. */
  @Post("osm/areas/:id/run")
  @RequireAdminPermission("places.manage")
  async runNow(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Req() request: AdminAuthedRequest) {
    const area = await this.prisma.osmSyncArea.findUnique({ where: { id } });
    if (!area) throw new ValidationApiException({ field: "area", reason: "NOT_FOUND" });
    const running = await this.prisma.osmImportRun.findFirst({ where: { status: "RUNNING", startedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } } });
    if (running || this.osm.isRunning()) throw new ValidationApiException({ field: "run", reason: "ANOTHER_RUN_IN_PROGRESS" });
    const recent = await this.prisma.osmImportRun.findFirst({ where: { areaId: id, startedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } } });
    if (recent) throw new ValidationApiException({ field: "run", reason: "RAN_RECENTLY" });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "osm_area.run_requested", entityType: "OsmSyncArea", entityId: id, requestId: request.requestId });
    // Runs in the background; run() records its own failures, and nothing may surface as an unhandled rejection.
    void this.osm.run(area, admin.adminUserId).catch((error: unknown) => this.logger.error(`OSM run for ${area.city} failed to start`, error instanceof Error ? error.stack : String(error)));
    return { started: true };
  }

  @Get("claims")
  @RequireAdminPermission("places.view")
  claimsQueue(@Query() query: ClaimsQueryDto) {
    return this.claims.list(query.status ?? "PENDING", query.page ?? 1, query.pageSize ?? 20);
  }

  @Post("claims/:id/decision")
  @RequireAdminPermission("places.manage")
  async decide(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: DecideClaimDto, @Req() request: AdminAuthedRequest) {
    const claim = await this.prisma.$transaction(async (tx) => {
      const decided = await this.claims.decide(tx, admin.adminUserId, id, dto.approve, dto.reason);
      await this.audit.record({ adminUserId: admin.adminUserId, action: dto.approve ? "place_claim.approved" : "place_claim.rejected", entityType: "PlaceClaim", entityId: id, reason: dto.reason, afterSummary: { placeId: decided.placeId, status: decided.status }, requestId: request.requestId, tx });
      return decided;
    });
    return { id: claim.id, status: claim.status };
  }

  /** Takes a listing back from the business that claimed it (wrong approval, or the real owner's dispute upheld). */
  @Post(":placeId/release-claim")
  @RequireAdminPermission("places.manage")
  async releaseClaim(@CurrentAdmin() admin: ResolvedAdminContext, @Param("placeId", ParseUUIDPipe) placeId: string, @Body() dto: ReleaseClaimDto, @Req() request: AdminAuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const released = await this.claims.release(tx, admin.adminUserId, placeId, dto.reason);
      await this.audit.record({ adminUserId: admin.adminUserId, action: "place_claim.released", entityType: "PetFriendlyPlace", entityId: placeId, reason: dto.reason, beforeSummary: { claimedByProviderOrganizationId: released.releasedFromOrganizationId }, afterSummary: { claimedByProviderOrganizationId: null, status: released.status }, requestId: request.requestId, tx });
      return { placeId, released: true };
    });
  }
}
