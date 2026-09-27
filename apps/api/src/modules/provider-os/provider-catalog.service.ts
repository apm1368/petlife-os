import { Injectable } from "@nestjs/common";
import { BookingStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ProviderAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { toProviderServiceVariantDto } from "../providers/provider-dto.mapper";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import type { CreateResourceDto, CreateServiceVariantDto, UpdateResourceDto, UpdateServiceVariantDto, UpdateStaffProfileDto } from "./dto/provider-catalog.dto";

/**
 * Provider-owned catalog operations: service variants, bookable resources, which staff deliver
 * which service, and staff public profiles. Every lookup is scoped to the caller's organization,
 * so a forged id from another provider resolves to 404/403 rather than a cross-tenant write.
 */
@Injectable()
export class ProviderCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownService(ctx: ResolvedProviderContext, serviceId: string) {
    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundApiException("Service");
    if (service.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "CROSS_ORGANIZATION" });
    return service;
  }

  async createVariant(ctx: ResolvedProviderContext, serviceId: string, dto: CreateServiceVariantDto) {
    await this.ownService(ctx, serviceId);
    const row = await this.prisma.providerServiceVariant.create({ data: { serviceId, name: dto.name.trim(), description: dto.description?.trim() || null, priceAmount: dto.priceAmount ?? null, durationMinutes: dto.durationMinutes, sortOrder: dto.sortOrder ?? 0 } });
    return toProviderServiceVariantDto(row);
  }

  /** Price/duration edits never touch confirmed bookings — those carry their own snapshot. */
  async updateVariant(ctx: ResolvedProviderContext, serviceId: string, variantId: string, dto: UpdateServiceVariantDto) {
    await this.ownService(ctx, serviceId);
    const updated = await this.prisma.providerServiceVariant.updateMany({
      where: { id: variantId, serviceId },
      data: { name: dto.name?.trim(), description: dto.description === undefined ? undefined : dto.description, priceAmount: dto.priceAmount === undefined ? undefined : dto.priceAmount, durationMinutes: dto.durationMinutes, sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
    if (updated.count !== 1) throw new NotFoundApiException("Service variant");
    return toProviderServiceVariantDto(await this.prisma.providerServiceVariant.findUniqueOrThrow({ where: { id: variantId } }));
  }

  async listResources(ctx: ResolvedProviderContext) {
    const rows = await this.prisma.providerResource.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: [{ locationId: "asc" }, { name: "asc" }] });
    return rows.map((r) => ({ id: r.id, locationId: r.locationId, name: r.name, type: r.type, isActive: r.isActive }));
  }

  async createResource(ctx: ResolvedProviderContext, dto: CreateResourceDto) {
    const location = await this.prisma.providerLocation.findUnique({ where: { id: dto.locationId } });
    if (!location || location.providerOrganizationId !== ctx.organizationId) throw new NotFoundApiException("Location");
    const r = await this.prisma.providerResource.create({ data: { providerOrganizationId: ctx.organizationId, locationId: dto.locationId, name: dto.name.trim(), type: dto.type } });
    return { id: r.id, locationId: r.locationId, name: r.name, type: r.type, isActive: r.isActive };
  }

  async updateResource(ctx: ResolvedProviderContext, id: string, dto: UpdateResourceDto) {
    if (dto.isActive === false) {
      const upcoming = await this.prisma.booking.count({ where: { resourceId: id, startAt: { gte: new Date() }, bookingStatus: { in: [BookingStatus.REQUESTED, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED] } } });
      if (upcoming > 0) throw new ValidationApiException({ field: "isActive", reason: `${upcoming} upcoming booking(s) use this resource; reschedule them first` });
    }
    const updated = await this.prisma.providerResource.updateMany({ where: { id, providerOrganizationId: ctx.organizationId }, data: { name: dto.name?.trim(), isActive: dto.isActive } });
    if (updated.count !== 1) throw new NotFoundApiException("Resource");
    const r = await this.prisma.providerResource.findUniqueOrThrow({ where: { id } });
    return { id: r.id, locationId: r.locationId, name: r.name, type: r.type, isActive: r.isActive };
  }

  async listStaff(ctx: ResolvedProviderContext) {
    const rows = await this.prisma.providerUser.findMany({
      where: { providerOrganizationId: ctx.organizationId },
      include: { user: { select: { displayName: true } }, qualifiedServices: { select: { serviceId: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((m) => ({ providerUserId: m.id, displayName: m.user.displayName, role: m.role, displayTitle: m.displayTitle, publicBio: m.publicBio, isBookable: m.isBookable, serviceIds: m.qualifiedServices.map((q) => q.serviceId) }));
  }

  async setStaffServices(ctx: ResolvedProviderContext, providerUserId: string, serviceIds: string[]) {
    const member = await this.prisma.providerUser.findUnique({ where: { id: providerUserId } });
    if (!member || member.providerOrganizationId !== ctx.organizationId) throw new NotFoundApiException("Team member");
    const owned = await this.prisma.providerService.count({ where: { id: { in: serviceIds }, providerOrganizationId: ctx.organizationId } });
    if (owned !== new Set(serviceIds).size) throw new NotFoundApiException("Service");
    await this.prisma.$transaction([
      this.prisma.providerUserService.deleteMany({ where: { providerUserId } }),
      this.prisma.providerUserService.createMany({ data: [...new Set(serviceIds)].map((serviceId) => ({ providerUserId, serviceId })) }),
    ]);
    return (await this.listStaff(ctx)).find((m) => m.providerUserId === providerUserId);
  }

  async updateStaffProfile(ctx: ResolvedProviderContext, providerUserId: string, dto: UpdateStaffProfileDto) {
    const updated = await this.prisma.providerUser.updateMany({ where: { id: providerUserId, providerOrganizationId: ctx.organizationId }, data: { publicBio: dto.publicBio === undefined ? undefined : dto.publicBio, isBookable: dto.isBookable, displayTitle: dto.displayTitle === undefined ? undefined : dto.displayTitle } });
    if (updated.count !== 1) throw new NotFoundApiException("Team member");
    return (await this.listStaff(ctx)).find((m) => m.providerUserId === providerUserId);
  }

  /** Real metrics for the organization over a period; revenue counts only snapshotted prices of completed bookings. */
  async analytics(ctx: ResolvedProviderContext, days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const where = { providerOrganizationId: ctx.organizationId, startAt: { gte: since, lte: new Date() } };
    const [byStatus, completedRows, byService, reviews, repeat] = await Promise.all([
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where, _count: { _all: true } }),
      this.prisma.booking.findMany({ where: { ...where, bookingStatus: BookingStatus.COMPLETED }, select: { priceAmount: true, currency: true } }),
      this.prisma.booking.groupBy({ by: ["providerServiceId"], where: { ...where, bookingStatus: BookingStatus.COMPLETED }, _count: { _all: true }, orderBy: { _count: { providerServiceId: "desc" } }, take: 5 }),
      this.prisma.providerReview.aggregate({ where: { providerOrganizationId: ctx.organizationId, status: "PUBLISHED" }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ["householdId"], where: { ...where, bookingStatus: BookingStatus.COMPLETED }, _count: { _all: true } }),
    ]);
    const count = (s: BookingStatus) => byStatus.find((r) => r.bookingStatus === s)?._count._all ?? 0;
    const serviceNames = await this.prisma.providerService.findMany({ where: { id: { in: byService.map((r) => r.providerServiceId) } }, select: { id: true, name: true } });
    const total = byStatus.reduce((sum, r) => sum + r._count._all, 0);
    return {
      periodDays: days,
      totalBookings: total,
      completed: count(BookingStatus.COMPLETED),
      cancelled: count(BookingStatus.CANCELLED_BY_USER) + count(BookingStatus.CANCELLED_BY_PROVIDER),
      noShow: count(BookingStatus.NO_SHOW),
      completionRate: total ? Math.round((count(BookingStatus.COMPLETED) / total) * 100) : null,
      revenue: completedRows.reduce((sum, r) => sum + (r.priceAmount === null ? 0 : Number(r.priceAmount)), 0),
      revenueCurrency: completedRows.find((r) => r.currency)?.currency ?? null,
      reviewAverage: reviews._avg.rating === null ? null : Math.round(reviews._avg.rating * 10) / 10,
      reviewCount: reviews._count._all,
      repeatClients: repeat.filter((r) => r._count._all > 1).length,
      topServices: byService.map((r) => ({ serviceId: r.providerServiceId, name: serviceNames.find((s) => s.id === r.providerServiceId)?.name ?? "", completed: r._count._all })),
    };
  }
}
