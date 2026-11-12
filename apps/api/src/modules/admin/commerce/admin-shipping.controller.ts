import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AdminVertical, Prisma, ShipmentStatus, ShippingProvider } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import type { AdminShipmentListItemDto, AdminShippingOverviewDto, PaginatedDto } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { RequireAdminVertical } from "../auth/require-admin-vertical.decorator";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { MANUAL_PROVIDERS, ShippingMethodSettingsService } from "../../commerce/logistics/shipping-method-settings.service";
import { ShippingOrchestrator } from "../../commerce/logistics/shipping-orchestrator.service";
import { ShipmentEventsService } from "../../commerce/logistics/shipment-events.service";

class UpdateShippingMethodDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(3, 300) reason?: string;
}

class ListShipmentsQueryDto {
  @IsOptional() @IsIn(Object.values(ShipmentStatus)) status?: ShipmentStatus;
  @IsOptional() @IsIn(Object.values(ShippingProvider)) provider?: ShippingProvider;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

/** Statuses staff may set on a staff-run shipment, in the order a parcel moves. */
const STAFF_STATUSES = [ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED, ShipmentStatus.FAILED] as const;

class StaffShipmentUpdateDto {
  @IsIn(STAFF_STATUSES) status!: (typeof STAFF_STATUSES)[number];
  /** Post Pishtaz tracking number, a courier's job reference, or the https tracking link a courier app shares. */
  @IsOptional() @IsString() @Length(4, 300) @Matches(/^(?:[^\s:/]{4,40}|https:\/\/[^\s]+)$/i, { message: "trackingCode must be a short reference or an https link" }) trackingCode?: string;
  @IsOptional() @IsString() @Length(3, 300) note?: string;
}

/**
 * Shipping in the back office: which methods checkout offers and at what price (commerce.manage), every shipment
 * with its status (commerce.view), and moving opetlife-courier / Post shipments, which have no courier API to report
 * for them (commerce.manage). Every change is audited.
 */
@Controller("admin/shipping")
@RequireAdminVertical(AdminVertical.SHOP)
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminShippingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly methods: ShippingMethodSettingsService,
    private readonly orchestrator: ShippingOrchestrator,
    private readonly shipmentEvents: ShipmentEventsService,
    private readonly audit: AdminAuditLogService,
  ) {}

  @Get("methods")
  @RequireAdminPermission("commerce.view")
  overview(): Promise<AdminShippingOverviewDto> {
    return this.methods.overview();
  }

  @Put("methods/:provider")
  @RequireAdminPermission("commerce.manage")
  async update(@CurrentAdmin() admin: ResolvedAdminContext, @Param("provider") provider: string, @Body() dto: UpdateShippingMethodDto, @Req() request: AdminAuthedRequest): Promise<AdminShippingOverviewDto> {
    if (!(Object.values(ShippingProvider) as string[]).includes(provider)) throw new ValidationApiException({ field: "provider", reason: "UNKNOWN" });
    await this.prisma.$transaction(async (tx) => {
      const { before, after } = await this.methods.update(tx, admin.adminUserId, provider as ShippingProvider, dto);
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "shipping_method.updated",
        entityType: "ShippingMethodSetting",
        entityId: undefined,
        reason: dto.reason?.trim() || undefined,
        beforeSummary: before ? { provider, enabled: before.enabled, config: before.config } : { provider },
        afterSummary: { provider, enabled: after.enabled, config: after.config },
        requestId: request.requestId,
        tx,
      });
    });
    return this.methods.overview();
  }

  @Get("shipments")
  @RequireAdminPermission("commerce.view")
  async shipments(@Query() query: ListShipmentsQueryDto): Promise<PaginatedDto<AdminShipmentListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ShipmentWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.provider ? { provider: query.provider } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { fulfillment: { select: { orderId: true, deliveryAddressSnapshot: true, sellerOrganization: { select: { name: true } } } } },
      }),
      this.prisma.shipment.count({ where }),
    ]);
    return {
      items: rows.map((s) => ({
        id: s.id,
        provider: s.provider as unknown as AdminShipmentListItemDto["provider"],
        status: s.status as unknown as AdminShipmentListItemDto["status"],
        trackingCode: s.trackingCode,
        orderId: s.fulfillment.orderId,
        sellerName: s.fulfillment.sellerOrganization.name,
        deliveryCity: ((s.fulfillment.deliveryAddressSnapshot ?? {}) as { city?: string | null }).city ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        staffManaged: MANUAL_PROVIDERS.has(s.provider),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Moves a staff-run shipment forward (never backward) and records it on the member's tracking timeline. */
  @Post("shipments/:id/status")
  @RequireAdminPermission("commerce.manage")
  async staffUpdate(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: StaffShipmentUpdateDto, @Req() request: AdminAuthedRequest) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id } });
    if (!shipment) throw new ValidationApiException({ field: "shipment", reason: "NOT_FOUND" });
    if (!MANUAL_PROVIDERS.has(shipment.provider)) throw new ValidationApiException({ field: "shipment", reason: "COURIER_REPORTS_ITS_OWN_STATUS" });
    if (dto.trackingCode && dto.trackingCode.trim() !== shipment.trackingCode) {
      await this.prisma.shipment.update({ where: { id }, data: { trackingCode: dto.trackingCode.trim() } });
    }
    const occurredAt = new Date();
    await this.shipmentEvents.recordIfNew({
      shipmentId: id,
      provider: shipment.provider,
      providerEventId: `staff:${request.requestId ?? occurredAt.getTime()}:${dto.status}`,
      eventType: "shipment.staff_update",
      providerStatus: dto.status.toLowerCase(),
      canonicalStatus: dto.status,
      occurredAt,
    });
    // Staff often skip steps (a Post parcel goes from "requested" straight to "in transit" at the post office). The
    // order's fulfillment only moves one step at a time, so walk every step in between, in order.
    const order: ShipmentStatus[] = [ShipmentStatus.CREATED, ShipmentStatus.REQUESTED, ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED];
    const from = order.indexOf(shipment.status);
    const to = order.indexOf(dto.status);
    const steps = dto.status === ShipmentStatus.FAILED || from < 0 || to <= from ? [dto.status] : order.slice(from + 1, to + 1);
    let applied = false;
    for (const step of steps) applied = (await this.orchestrator.applyShipmentStatus(id, step)).applied || applied;
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "shipment.staff_updated",
      entityType: "Shipment",
      entityId: id,
      reason: dto.note?.trim() || undefined,
      beforeSummary: { status: shipment.status, trackingCode: shipment.trackingCode },
      afterSummary: { status: dto.status, applied, trackingCode: dto.trackingCode?.trim() ?? shipment.trackingCode },
      requestId: request.requestId,
    });
    return { applied };
  }
}
