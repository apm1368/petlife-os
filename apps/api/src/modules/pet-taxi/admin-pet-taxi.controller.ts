import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { PetTaxiDriverStatus, PetTaxiRideStatus } from "@prisma/client";
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min } from "class-validator";
import type { AdminPetTaxiDriverDto, AdminPetTaxiOverviewDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import { PetTaxiService, PRESENCE_FRESH_MS } from "./pet-taxi.service";
import { normalizeCity, validCityBox } from "./pet-taxi-fare.policy";

const IRR = 100_000_000;
class FareRuleDto {
  @IsInt() @Min(0) @Max(IRR) baseFareIrr!: number;
  @IsInt() @Min(0) @Max(IRR) perKmIrr!: number;
  @IsInt() @Min(0) @Max(IRR) perMinuteIrr!: number;
  @IsInt() @Min(0) @Max(IRR) minimumFareIrr!: number;
  @IsInt() @Min(0) @Max(300) mediumSurchargePercent!: number;
  @IsInt() @Min(0) @Max(300) largeSurchargePercent!: number;
  /** Retired (one price per ride, X-08): accepted for older clients, always stored as 0. */
  @IsOptional() @IsInt() @Min(0) @Max(IRR) extraPetIrr?: number;
  @IsBoolean() active!: boolean;
  /** The city's bounding box; required for every rule except "*". */
  @IsOptional() @IsLatitude() south?: number;
  @IsOptional() @IsLongitude() west?: number;
  @IsOptional() @IsLatitude() north?: number;
  @IsOptional() @IsLongitude() east?: number;
  @IsOptional() @IsString() @Length(3, 300) reason?: string;
}

const DECISIONS = [PetTaxiDriverStatus.VERIFIED, PetTaxiDriverStatus.SUSPENDED] as const;
class DriverDecisionDto {
  @IsIn(DECISIONS) status!: (typeof DECISIONS)[number];
  @IsString() @Length(3, 300) reason!: string;
}

/** Pet-taxi fares per city ("*" = every other city) and the rides in progress. */
@Controller("admin/pet-taxi")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPetTaxiController {
  constructor(private readonly prisma: PrismaService, private readonly taxi: PetTaxiService, private readonly audit: AdminAuditLogService) {}

  @Get()
  @RequireAdminPermission("services.view")
  async overview(): Promise<AdminPetTaxiOverviewDto> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [rules, onlineDrivers, rides] = await Promise.all([
      this.prisma.petTaxiFareRule.findMany({ orderBy: { city: "asc" } }),
      this.prisma.petTaxiDriverPresence.count({ where: { online: true, updatedAt: { gt: new Date(Date.now() - PRESENCE_FRESH_MS) } } }),
      this.prisma.petTaxiRide.findMany({
        where: { OR: [{ status: { in: [PetTaxiRideStatus.SEARCHING, PetTaxiRideStatus.DRIVER_ASSIGNED, PetTaxiRideStatus.ARRIVING, PetTaxiRideStatus.PICKED_UP] } }, { createdAt: { gt: since } }] },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { displayName: true, phone: true } } },
      }),
    ]);
    const driverIds = [...new Set(rides.map((r) => r.driverUserId).filter((id): id is string => !!id))];
    const drivers = driverIds.length ? await this.prisma.user.findMany({ where: { id: { in: driverIds } }, select: { id: true, displayName: true } }) : [];
    const driverName = new Map(drivers.map((d) => [d.id, d.displayName]));
    return {
      rules: rules.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString(), createdAt: undefined, updatedByAdminId: undefined }) as never),
      onlineDrivers,
      rides: await Promise.all(rides.map(async (r) => ({ ...(await this.taxi.toDto(r, "admin")), memberName: r.user.displayName, driverName: r.driverUserId ? driverName.get(r.driverUserId) ?? null : null }))),
    };
  }

  @Put("fare-rules/:city")
  @RequireAdminPermission("services.manage")
  async upsertRule(@CurrentAdmin() admin: ResolvedAdminContext, @Param("city") rawCity: string, @Body() dto: FareRuleDto, @Req() request: AdminAuthedRequest) {
    // Route params arrive decoded already; decoding again would fail on a literal "%".
    const city = rawCity === "*" ? "*" : normalizeCity(rawCity);
    if (!city || city.length > 120) throw new ValidationApiException({ field: "city", reason: "REQUIRED" });
    const { reason, south, west, north, east, ...rest } = dto;
    // A city rule applies where its box is; "*" covers everything else and has no box.
    const box = { south: south ?? null, west: west ?? null, north: north ?? null, east: east ?? null };
    if (city !== "*" && !validCityBox(box)) throw new ValidationApiException({ field: "bbox", reason: "CITY_BOX_REQUIRED" });
    const data = { ...rest, extraPetIrr: 0, ...(city === "*" ? { south: null, west: null, north: null, east: null } : box) };
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.petTaxiFareRule.findUnique({ where: { city } });
      const after = await tx.petTaxiFareRule.upsert({ where: { city }, create: { city, ...data, updatedByAdminId: admin.adminUserId }, update: { ...data, updatedByAdminId: admin.adminUserId } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "pet_taxi_fare.updated",
        entityType: "PetTaxiFareRule",
        entityId: after.id,
        reason: reason?.trim() || undefined,
        beforeSummary: before ? { ...before, createdAt: undefined, updatedAt: undefined } : { city },
        afterSummary: { ...after, createdAt: undefined, updatedAt: undefined },
        requestId: request.requestId,
        tx,
      });
    });
    return this.overview();
  }

  /** Every registered driver, pending checks first. */
  @Get("drivers")
  @RequireAdminPermission("services.view")
  async drivers(): Promise<AdminPetTaxiDriverDto[]> {
    const rows = await this.prisma.petTaxiDriver.findMany({ orderBy: [{ status: "asc" }, { createdAt: "asc" }], take: 500 });
    const [users, orgs] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, displayName: true } }),
      this.prisma.providerOrganization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.providerOrganizationId))] } }, select: { id: true, name: true, verificationStatus: true } }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.displayName]));
    const org = new Map(orgs.map((o) => [o.id, o]));
    return Promise.all(rows.map(async (r) => ({ ...(await this.taxi.toDriverDto(r, userName.get(r.userId) ?? "")), organizationName: org.get(r.providerOrganizationId)?.name ?? "", organizationVerified: org.get(r.providerOrganizationId)?.verificationStatus === "VERIFIED" })));
  }

  /** Staff check a driver's licence and vehicle (or suspend them); audited with the reason. A suspended driver goes offline. */
  @Post("drivers/:id/decision")
  @RequireAdminPermission("services.manage")
  async decideDriver(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: DriverDecisionDto, @Req() request: AdminAuthedRequest) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.petTaxiDriver.findUnique({ where: { id } });
      if (!before) throw new ValidationApiException({ field: "driver", reason: "NOT_FOUND" });
      const verified = dto.status === PetTaxiDriverStatus.VERIFIED;
      const after = await tx.petTaxiDriver.update({
        where: { id },
        data: { status: dto.status, statusReason: dto.reason.trim(), verifiedByAdminId: verified ? admin.adminUserId : before.verifiedByAdminId, verifiedAt: verified ? new Date() : before.verifiedAt },
      });
      if (!verified) await tx.petTaxiDriverPresence.updateMany({ where: { providerUserId: after.providerUserId }, data: { online: false, latitude: null, longitude: null, locatedAt: null } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: verified ? "pet_taxi_driver.verified" : "pet_taxi_driver.suspended",
        entityType: "PetTaxiDriver",
        entityId: id,
        reason: dto.reason.trim(),
        beforeSummary: { status: before.status },
        afterSummary: { status: after.status, licenceNumber: after.licenceNumber, vehiclePlate: after.vehiclePlate },
        requestId: request.requestId,
        tx,
      });
    });
    return this.drivers();
  }
}
