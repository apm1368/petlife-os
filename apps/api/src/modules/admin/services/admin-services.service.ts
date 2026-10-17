import { Injectable } from "@nestjs/common";
import { BookingStatus, Prisma, ProviderReviewStatus, WaitlistStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { ProviderReviewsService } from "../../booking/provider-reviews.service";

export interface AdminBookingListQuery {
  status?: BookingStatus;
  providerId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
}

/**
 * Admin counterpart for Services/Booking. Read-mostly by design: admins see the full operational
 * picture (timeline, payment, refunds, support) but there is no status or money PATCH here —
 * refunds go through the finance approval workflow, disputes through the dispute module.
 */
@Injectable()
export class AdminServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly reviews: ProviderReviewsService,
  ) {}

  async listBookings(query: AdminBookingListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const where: Prisma.BookingWhereInput = {
      ...(query.status ? { bookingStatus: query.status } : {}),
      ...(query.providerId ? { providerOrganizationId: query.providerId } : {}),
      ...(query.from || query.to ? { startAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lt: new Date(query.to) } : {}) } } : {}),
      ...(query.q ? { OR: [{ bookingNumber: { contains: query.q, mode: "insensitive" } }, { pet: { name: { contains: query.q, mode: "insensitive" } } }, { providerOrganization: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        include: { pet: { select: { name: true, species: true } }, providerOrganization: { select: { name: true } }, providerService: { select: { name: true } } },
        orderBy: { startAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
    ]);
    return {
      total,
      page,
      items: rows.map((b) => ({
        id: b.id,
        bookingNumber: b.bookingNumber,
        status: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        category: b.category,
        startAt: b.startAt.toISOString(),
        petName: b.pet.name,
        providerName: b.providerOrganization.name,
        serviceName: b.serviceNameSnapshot ?? b.providerService.name,
        priceAmount: b.priceAmount === null ? null : Number(b.priceAmount),
        currency: b.currency,
      })),
    };
  }

  async getBooking(id: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        pet: { select: { id: true, name: true, species: true } },
        user: { select: { id: true, displayName: true, email: true, phone: true } },
        providerOrganization: { select: { id: true, name: true, verificationStatus: true } },
        providerLocation: { select: { name: true, city: true } },
        providerUser: { select: { id: true, displayTitle: true } },
        statusEvents: { orderBy: { createdAt: "asc" } },
        review: true,
        rescheduledTo: { select: { id: true, bookingNumber: true } },
        rescheduledFrom: { select: { id: true, bookingNumber: true } },
        petAccess: { include: { petAccessGrant: { select: { canViewHealth: true, canRecordClinicalData: true, expiresAt: true, revokedAt: true, reason: true } } } },
      },
    });
    if (!b) throw new NotFoundApiException("Booking");
    const [intent, refunds, supportCases, clinicalVisits] = await Promise.all([
      b.paymentIntentId ? this.prisma.paymentIntent.findUnique({ where: { id: b.paymentIntentId }, select: { id: true, amount: true, currency: true, status: true, provider: true } }) : null,
      b.paymentIntentId ? this.prisma.refund.findMany({ where: { paymentIntentId: b.paymentIntentId }, select: { id: true, amount: true, status: true, reason: true, createdAt: true } }) : [],
      this.prisma.supportCase.findMany({ where: { relatedEntityId: b.id }, select: { id: true, caseNumber: true, status: true, subject: true } }),
      this.prisma.clinicalVisit.findMany({ where: { bookingId: b.id }, select: { id: true, status: true } }),
    ]);
    return {
      id: b.id,
      bookingNumber: b.bookingNumber,
      status: b.bookingStatus,
      paymentStatus: b.paymentStatus,
      paymentMode: b.paymentMode,
      bookingMode: b.bookingMode,
      category: b.category,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      timezone: b.timezone,
      serviceName: b.serviceNameSnapshot,
      variantName: b.variantNameSnapshot,
      priceAmount: b.priceAmount === null ? null : Number(b.priceAmount),
      depositAmount: b.depositAmount === null ? null : Number(b.depositAmount),
      discountAmount: Number(b.discountAmount),
      currency: b.currency,
      cancellationPolicy: b.cancellationPolicySnapshot,
      freeCancellationHours: b.freeCancellationHours,
      lateCancellationRefundPercent: b.lateCancellationRefundPercent,
      cancelledReason: b.cancelledReason,
      rejectedReason: b.rejectedReason,
      pet: b.pet,
      // Contact details are masked in admin views; full reveal uses the audited customer PII endpoint.
      customer: { id: b.user.id, displayName: b.user.displayName, email: b.user.email ? maskEmail(b.user.email) : null, phone: b.user.phone ? maskPhone(b.user.phone) : null },
      provider: b.providerOrganization,
      location: b.providerLocation,
      staff: b.providerUser,
      healthAccess: b.petAccess ? { scopePreset: b.petAccess.scopePreset, ...b.petAccess.petAccessGrant, expiresAt: b.petAccess.petAccessGrant.expiresAt?.toISOString() ?? null, revokedAt: b.petAccess.petAccessGrant.revokedAt?.toISOString() ?? null } : null,
      timeline: b.statusEvents.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, actorType: e.actorType, reason: e.reason, createdAt: e.createdAt.toISOString() })),
      payment: intent,
      refunds: refunds.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      supportCases,
      clinicalVisits,
      review: b.review ? { id: b.review.id, rating: b.review.rating, status: b.review.status } : null,
      rescheduledTo: b.rescheduledTo,
      rescheduledFrom: b.rescheduledFrom,
    };
  }

  async listServices(providerId?: string) {
    const rows = await this.prisma.providerService.findMany({
      where: providerId ? { providerOrganizationId: providerId } : {},
      include: { providerOrganization: { select: { name: true } }, variants: true, _count: { select: { bookings: true } } },
      orderBy: [{ providerOrganizationId: "asc" }, { name: "asc" }],
      take: 500,
    });
    return rows.map((s) => ({
      id: s.id,
      providerOrganizationId: s.providerOrganizationId,
      providerName: s.providerOrganization.name,
      name: s.name,
      category: s.category,
      type: s.type,
      isActive: s.isActive,
      bookingMode: s.bookingMode,
      paymentMode: s.paymentMode,
      priceAmount: s.priceAmount === null ? null : Number(s.priceAmount),
      variantCount: s.variants.length,
      bookingCount: s._count.bookings,
    }));
  }

  async setServiceActive(admin: ResolvedAdminContext, serviceId: string, isActive: boolean, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.providerService.findUnique({ where: { id: serviceId } });
      if (!before) throw new NotFoundApiException("Service");
      const after = await tx.providerService.update({ where: { id: serviceId }, data: { isActive } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: isActive ? "provider_service.reactivated" : "provider_service.deactivated",
        entityType: "ProviderService",
        entityId: serviceId,
        reason,
        beforeSummary: { isActive: before.isActive },
        afterSummary: { isActive: after.isActive },
        tx,
      });
      return { id: after.id, isActive: after.isActive };
    });
  }

  async listReviews(status?: ProviderReviewStatus) {
    const rows = await this.prisma.providerReview.findMany({
      where: status ? { status } : {},
      include: { providerOrganization: { select: { name: true } }, booking: { select: { bookingNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({ id: r.id, providerName: r.providerOrganization.name, bookingNumber: r.booking.bookingNumber, rating: r.rating, body: r.body, status: r.status, hiddenReason: r.hiddenReason, providerResponse: r.providerResponse, createdAt: r.createdAt.toISOString() }));
  }

  async hideReview(admin: ResolvedAdminContext, reviewId: string, reason: string) {
    const review = await this.reviews.hide(reviewId, reason, admin.userId);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "provider_review.hidden", entityType: "ProviderReview", entityId: reviewId, reason, afterSummary: { status: "HIDDEN" } });
    return review;
  }

  async listWaitlist(providerId?: string) {
    const rows = await this.prisma.bookingWaitlistEntry.findMany({
      where: { ...(providerId ? { providerOrganizationId: providerId } : {}), status: { in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED] } },
      include: { providerOrganization: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return rows.map((w) => ({ id: w.id, providerName: w.providerOrganization.name, serviceName: w.service.name, windowStart: w.windowStart.toISOString(), windowEnd: w.windowEnd.toISOString(), status: w.status, createdAt: w.createdAt.toISOString() }));
  }

  /** Platform-level service analytics from real rows only. */
  async analytics(days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const [byStatus, byCategory, reviews, waitlistActive] = await Promise.all([
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ["category"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.providerReview.aggregate({ where: { createdAt: { gte: since }, status: ProviderReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.bookingWaitlistEntry.count({ where: { status: WaitlistStatus.ACTIVE } }),
    ]);
    const count = (status: BookingStatus) => byStatus.find((r) => r.bookingStatus === status)?._count._all ?? 0;
    const total = byStatus.reduce((sum, r) => sum + r._count._all, 0);
    const cancelled = count(BookingStatus.CANCELLED_BY_USER) + count(BookingStatus.CANCELLED_BY_PROVIDER);
    return {
      periodDays: days,
      totalBookings: total,
      completed: count(BookingStatus.COMPLETED),
      cancelled,
      noShow: count(BookingStatus.NO_SHOW),
      requested: count(BookingStatus.REQUESTED),
      rejected: count(BookingStatus.REJECTED),
      expired: count(BookingStatus.EXPIRED),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.bookingStatus, r._count._all])),
      byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])),
      reviewAverage: reviews._avg.rating === null ? null : Math.round(reviews._avg.rating * 10) / 10,
      reviewCount: reviews._count._all,
      waitlistActive,
    };
  }
}
