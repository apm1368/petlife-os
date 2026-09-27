import { Injectable } from "@nestjs/common";
import { BookingStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ProviderAccessDeniedException, ServiceHasFutureBookingsException, ValidationApiException } from "../../common/errors/api-exception";
import { toProviderServiceDto } from "../providers/provider-dto.mapper";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import type { UpdateProviderServiceDto } from "./dto/update-provider-service.dto";

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS];

/**
 * Minimal admin surface over the existing ProviderService model (spec
 * sections 24-25) — no full catalog-management workflow, no create/delete.
 * Disabling a service (isActive: false) never cancels its future bookings —
 * BookingsService.createHold already rejects new holds against an inactive
 * service, so that guarantee falls out of existing code with no extra work
 * here; this file only adds a second, narrower guard for locationMode,
 * since changing where a service happens could break an already-confirmed
 * booking's location expectations.
 */
@Injectable()
export class ProviderServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async list(ctx: ResolvedProviderContext) {
    const services = await this.prisma.providerService.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { name: "asc" }, include: { variants: true } });
    return services.map((s) => toProviderServiceDto(s, { includeInactiveVariants: true }));
  }

  private async loadForOrg(ctx: ResolvedProviderContext, id: string) {
    const service = await this.prisma.providerService.findUnique({ where: { id }, include: { variants: true } });
    if (!service) throw new NotFoundApiException("Service");
    if (service.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "CROSS_ORGANIZATION" });
    return service;
  }

  async getById(ctx: ResolvedProviderContext, id: string) {
    return toProviderServiceDto(await this.loadForOrg(ctx, id), { includeInactiveVariants: true });
  }

  async update(ctx: ResolvedProviderContext, id: string, dto: UpdateProviderServiceDto) {
    const existing = await this.loadForOrg(ctx, id);
    const nextPaymentMode = dto.paymentMode ?? existing.paymentMode;
    const nextDeposit = dto.depositAmount === undefined ? existing.depositAmount : dto.depositAmount;
    if (nextPaymentMode === "DEPOSIT" && !nextDeposit) throw new ValidationApiException({ field: "depositAmount", reason: "A deposit amount is required for deposit payment" });
    if ((nextPaymentMode === "FULL_PREPAYMENT" || nextPaymentMode === "DEPOSIT") && (dto.priceAmount === undefined ? existing.priceAmount : dto.priceAmount) === null) {
      throw new ValidationApiException({ field: "priceAmount", reason: "Online payment needs a price" });
    }

    if (dto.locationMode && dto.locationMode !== existing.locationMode) {
      const futureBookingCount = await this.prisma.booking.count({
        where: { providerServiceId: id, bookingStatus: { in: ACTIVE_STATUSES }, startAt: { gte: new Date() } },
      });
      if (futureBookingCount > 0) {
        throw new ServiceHasFutureBookingsException({ serviceId: id, futureBookingCount });
      }
    }

    const service = await this.prisma.providerService.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description === undefined ? undefined : dto.description,
        priceAmount: dto.priceAmount === undefined ? undefined : dto.priceAmount,
        durationMinutes: dto.durationMinutes,
        isActive: dto.isActive,
        supportsDog: dto.supportsDog,
        supportsCat: dto.supportsCat,
        minAgeMonths: dto.minAgeMonths === undefined ? undefined : dto.minAgeMonths,
        maxAgeMonths: dto.maxAgeMonths === undefined ? undefined : dto.maxAgeMonths,
        requiresCareProfile: dto.requiresCareProfile,
        requiresHealthBasics: dto.requiresHealthBasics,
        locationMode: dto.locationMode,
        bookingMode: dto.bookingMode,
        paymentMode: dto.paymentMode,
        depositAmount: dto.depositAmount === undefined ? undefined : dto.depositAmount,
        cancellationPolicy: dto.cancellationPolicy === undefined ? undefined : dto.cancellationPolicy,
        freeCancellationHours: dto.freeCancellationHours,
        lateCancellationRefundPercent: dto.lateCancellationRefundPercent,
        preparationNotes: dto.preparationNotes === undefined ? undefined : dto.preparationNotes,
        maxPetsPerBooking: dto.maxPetsPerBooking,
        requiredResourceType: dto.requiredResourceType === undefined ? undefined : dto.requiredResourceType,
        requestTtlHours: dto.requestTtlHours,
      },
      include: { variants: true },
    });

    await this.events.publish(
      "ProviderServiceUpdated",
      { serviceId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderService", aggregateId: id },
    );

    return toProviderServiceDto(service, { includeInactiveVariants: true });
  }
}
