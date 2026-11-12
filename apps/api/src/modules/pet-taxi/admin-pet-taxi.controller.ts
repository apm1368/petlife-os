import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { PetTaxiRideStatus } from "@prisma/client";
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import type { AdminPetTaxiOverviewDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import { PetTaxiService, PRESENCE_FRESH_MS } from "./pet-taxi.service";
import { normalizeCity } from "./pet-taxi-fare.policy";

const IRR = 100_000_000;
class FareRuleDto {
  @IsInt() @Min(0) @Max(IRR) baseFareIrr!: number;
  @IsInt() @Min(0) @Max(IRR) perKmIrr!: number;
  @IsInt() @Min(0) @Max(IRR) perMinuteIrr!: number;
  @IsInt() @Min(0) @Max(IRR) minimumFareIrr!: number;
  @IsInt() @Min(0) @Max(300) mediumSurchargePercent!: number;
  @IsInt() @Min(0) @Max(300) largeSurchargePercent!: number;
  @IsInt() @Min(0) @Max(IRR) extraPetIrr!: number;
  @IsBoolean() active!: boolean;
  @IsOptional() @IsString() @Length(3, 300) reason?: string;
}

/** Pet-taxi fares per city ("*" = every other city) and the rides in progress. */
@Controller("admin/pet-taxi")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPetTaxiController {
  constructor(private readonly prisma: PrismaService, private readonly taxi: PetTaxiService, private readonly audit: AdminAuditLogService) {}

  @Get()
  @RequireAdminPermission("services.view")
  async overview(): Promise<AdminPetTaxiOverviewDto> {
    await this.taxi.expireSearches();
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
    const city = rawCity === "*" ? "*" : normalizeCity(decodeURIComponent(rawCity));
    if (!city || city.length > 120) throw new ValidationApiException({ field: "city", reason: "REQUIRED" });
    const { reason, ...data } = dto;
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
}
