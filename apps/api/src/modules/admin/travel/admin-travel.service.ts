import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, TravelBookingStatus, TravelListingStatus, TravelRequirementRuleStatus, TravelRequirementType, TravelReviewStatus, type PetSpecies } from "@prisma/client";
import type { AdminTravelAnalyticsDto, TravelRequirementRuleDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ApiException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { LISTING_INCLUDE, toTravelListingDto } from "../../travel-marketplace/travel-marketplace-mapper";
import { TravelBookingService } from "../../travel-marketplace/travel-booking.service";
import { isTravelRequirementStale } from "../../travel/travel-staleness.util";

export class TravelModerationException extends ApiException {
  constructor(details?: Record<string, unknown>) {
    super("TRAVEL_MODERATION_NOT_ALLOWED", "This moderation action is not valid for the listing's current status.", HttpStatus.CONFLICT, details);
  }
}

const PAGE = 25;

export function toRuleDto(r: {
  id: string;
  country: string;
  city: string | null;
  requirementType: TravelRequirementType;
  title: string;
  description: string;
  species: PetSpecies[];
  source: string;
  sourceUrl: string | null;
  verifiedAt: Date;
  validUntil: Date | null;
  status: TravelRequirementRuleStatus;
}): TravelRequirementRuleDto {
  return {
    id: r.id,
    country: r.country,
    city: r.city,
    requirementType: r.requirementType as unknown as TravelRequirementRuleDto["requirementType"],
    title: r.title,
    description: r.description,
    species: r.species,
    source: r.source,
    sourceUrl: r.sourceUrl,
    verifiedAt: r.verifiedAt.toISOString(),
    validUntil: r.validUntil?.toISOString() ?? null,
    status: r.status,
    isStale: isTravelRequirementStale(r.verifiedAt, r.validUntil),
  };
}

/**
 * Admin Travel control plane (Batch 5). Moderation and requirement curation
 * are audited; booking inspection is read-only (no arbitrary money moves —
 * refunds happen through the booking's own cancellation terms or the finance
 * refund-approval workflow). Customer data is limited to first name, pet
 * name/species and the booking itself.
 */
@Injectable()
export class AdminTravelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
    private readonly bookings: TravelBookingService,
  ) {}

  // --- Listings ------------------------------------------------------------------

  async listListings(query: { status?: TravelListingStatus; q?: string; page?: number }) {
    const page = query.page ?? 1;
    const where: Prisma.TravelListingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { city: { contains: query.q, mode: "insensitive" } }, { organization: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelListing.findMany({
        where,
        include: { organization: { select: { name: true, verificationStatus: true } }, _count: { select: { units: true, media: true, bookings: true } }, petPolicy: { select: { id: true } } },
        // The review queue first: pending submissions oldest first.
        orderBy: [{ submittedAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE,
        take: PAGE,
      }),
      this.prisma.travelListing.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        city: r.city,
        status: r.status,
        isVerified: r.isVerified,
        isPubliclyListed: r.isPubliclyListed,
        organization: { id: r.organizationId, name: r.organization.name, verificationStatus: r.organization.verificationStatus },
        unitCount: r._count.units,
        mediaCount: r._count.media,
        bookingCount: r._count.bookings,
        hasPetPolicy: Boolean(r.petPolicy),
        submittedAt: r.submittedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize: PAGE,
    };
  }

  async getListing(id: string) {
    const row = await this.prisma.travelListing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!row) throw new NotFoundApiException("Listing", { id });
    const [org, history] = await Promise.all([
      this.prisma.providerOrganization.findUnique({ where: { id: row.organizationId }, select: { id: true, name: true, type: true, verificationStatus: true } }),
      this.prisma.adminAuditLog.findMany({ where: { entityType: "TRAVEL_LISTING", entityId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { action: true, reason: true, createdAt: true } }),
    ]);
    return { listing: toTravelListingDto(row), organization: org, history: history.map((h) => ({ action: h.action, reason: h.reason, createdAt: h.createdAt.toISOString() })) };
  }

  /**
   * APPROVE (pending → published + listed), REQUEST_CORRECTION (pending → draft
   * with a note the provider sees), SUSPEND (published → suspended, unlisted),
   * REINSTATE (suspended → published). Every action is audited.
   */
  async moderate(admin: ResolvedAdminContext, id: string, action: "APPROVE" | "REQUEST_CORRECTION" | "SUSPEND" | "REINSTATE", note: string | undefined, requestId?: string) {
    const row = await this.prisma.travelListing.findUnique({ where: { id }, include: { petPolicy: { select: { id: true } }, _count: { select: { units: true } } } });
    if (!row) throw new NotFoundApiException("Listing", { id });
    const table: Record<string, { from: TravelListingStatus[]; to: TravelListingStatus; data: Prisma.TravelListingUpdateInput }> = {
      APPROVE: { from: [TravelListingStatus.PENDING_REVIEW], to: TravelListingStatus.PUBLISHED, data: { isPubliclyListed: true, moderationNote: null } },
      REQUEST_CORRECTION: { from: [TravelListingStatus.PENDING_REVIEW], to: TravelListingStatus.DRAFT, data: { moderationNote: note ?? null } },
      SUSPEND: { from: [TravelListingStatus.PUBLISHED], to: TravelListingStatus.SUSPENDED, data: { isPubliclyListed: false, moderationNote: note ?? null } },
      REINSTATE: { from: [TravelListingStatus.SUSPENDED], to: TravelListingStatus.PUBLISHED, data: { isPubliclyListed: true, moderationNote: null } },
    };
    const rule = table[action]!;
    if (!rule.from.includes(row.status)) throw new TravelModerationException({ id, from: row.status, action });
    if ((action === "REQUEST_CORRECTION" || action === "SUSPEND") && !note?.trim()) throw new ValidationApiException({ field: "note", reason: "REQUIRED" });
    // A listing without a stated pet policy or any unit is not publishable.
    if (action === "APPROVE" && (!row.petPolicy || row._count.units === 0)) throw new TravelModerationException({ id, reason: !row.petPolicy ? "PET_POLICY_MISSING" : "NO_UNITS" });
    const moved = await this.prisma.travelListing.updateMany({ where: { id, status: row.status }, data: { status: rule.to, reviewedAt: new Date(), reviewedByAdminId: admin.adminUserId, ...(rule.data as Prisma.TravelListingUpdateManyMutationInput) } });
    if (moved.count === 0) throw new TravelModerationException({ id, reason: "CHANGED_CONCURRENTLY" });
    await this.audit.record({ adminUserId: admin.adminUserId, action: `travel_listing.${action.toLowerCase()}` as never, entityType: "TRAVEL_LISTING", entityId: id, reason: note, beforeSummary: { status: row.status }, afterSummary: { status: rule.to }, requestId });
    await this.events.publish("TravelListingStatusChanged", { listingId: id, from: row.status, to: rule.to, organizationId: row.organizationId, note: note ?? null }, { aggregateType: "TravelListing", aggregateId: id });
    return this.getListing(id);
  }

  async setVerified(admin: ResolvedAdminContext, id: string, isVerified: boolean, reason: string, requestId?: string) {
    const row = await this.prisma.travelListing.findUnique({ where: { id }, select: { isVerified: true } });
    if (!row) throw new NotFoundApiException("Listing", { id });
    await this.prisma.travelListing.update({ where: { id }, data: { isVerified } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_listing.verification_changed" as never, entityType: "TRAVEL_LISTING", entityId: id, reason, beforeSummary: { isVerified: row.isVerified }, afterSummary: { isVerified }, requestId });
    return this.getListing(id);
  }

  // --- Bookings ----------------------------------------------------------------------

  async listBookings(query: { status?: TravelBookingStatus; q?: string; page?: number }) {
    const page = query.page ?? 1;
    const where: Prisma.TravelBookingWhereInput = {
      ...(query.status ? { status: query.status } : { status: { not: TravelBookingStatus.MODIFIED } }),
      ...(query.q ? { OR: [{ reference: { contains: query.q.trim().toUpperCase() } }, { listing: { title: { contains: query.q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelBooking.findMany({
        where,
        include: { listing: { select: { title: true, city: true, organization: { select: { name: true } } } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE,
        take: PAGE,
      }),
      this.prisma.travelBooking.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        status: r.status,
        paymentStatus: r.paymentStatus,
        listingTitle: r.listing.title,
        city: r.listing.city,
        providerName: r.listing.organization.name,
        checkIn: r.checkIn.toISOString().slice(0, 10),
        checkOut: r.checkOut.toISOString().slice(0, 10),
        totalAmountIrr: r.totalAmountIrr,
        payNowAmountIrr: r.payNowAmountIrr,
        refundAmountIrr: r.refundAmountIrr,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: PAGE,
    };
  }

  async getBooking(id: string) {
    const row = await this.prisma.travelBooking.findUnique({ where: { id }, select: { listing: { select: { organizationId: true } } } });
    if (!row) throw new NotFoundApiException("Booking", { id });
    const booking = this.bookings.toDto(await this.bookings.loadForOrganization(row.listing.organizationId, id));
    const [traveler, intent, refunds, supportCases] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: booking.bookedByUserId }, select: { displayName: true } }),
      (async () => {
        const b = await this.prisma.travelBooking.findUniqueOrThrow({ where: { id }, select: { paymentIntentId: true } });
        return b.paymentIntentId ? this.prisma.paymentIntent.findUnique({ where: { id: b.paymentIntentId }, select: { id: true, amount: true, status: true, provider: true, checkoutId: true } }) : null;
      })(),
      (async () => {
        const b = await this.prisma.travelBooking.findUniqueOrThrow({ where: { id }, select: { paymentIntentId: true } });
        return b.paymentIntentId ? this.prisma.refund.findMany({ where: { paymentIntentId: b.paymentIntentId }, select: { id: true, amount: true, status: true, reason: true, createdAt: true } }) : [];
      })(),
      this.prisma.supportCase.findMany({ where: { relatedEntityType: "TRAVEL_BOOKING", relatedEntityId: id }, select: { id: true, caseNumber: true, status: true, subject: true } }).catch(() => []),
    ]);
    return {
      booking,
      travelerFirstName: (traveler?.displayName ?? "").trim().split(/\s+/)[0] || "—",
      payment: intent ? { id: intent.id, amount: intent.amount, status: intent.status, provider: intent.provider } : null,
      refunds: refunds.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      supportCases,
    };
  }

  // --- Reviews --------------------------------------------------------------------

  async listReviews(status?: TravelReviewStatus, page = 1) {
    const where: Prisma.TravelReviewWhereInput = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.travelReview.findMany({ where, include: { listing: { select: { title: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
      this.prisma.travelReview.count({ where }),
    ]);
    return { items: rows.map((r) => ({ id: r.id, listingTitle: r.listing.title, overall: r.overall, body: r.body, status: r.status, hiddenReason: r.hiddenReason, providerResponse: r.providerResponse, createdAt: r.createdAt.toISOString() })), total, page, pageSize: PAGE };
  }

  async setReviewVisibility(admin: ResolvedAdminContext, id: string, hidden: boolean, reason: string, requestId?: string) {
    const row = await this.prisma.travelReview.findUnique({ where: { id } });
    if (!row) throw new NotFoundApiException("Review", { id });
    await this.prisma.travelReview.update({ where: { id }, data: hidden ? { status: TravelReviewStatus.HIDDEN, hiddenReason: reason } : { status: TravelReviewStatus.PUBLISHED, hiddenReason: null } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: (hidden ? "travel_review.hidden" : "travel_review.restored") as never, entityType: "TRAVEL_REVIEW", entityId: id, reason, requestId });
    return { id, status: hidden ? "HIDDEN" : "PUBLISHED" };
  }

  // --- Requirement library ----------------------------------------------------------

  async listRules(query: { country?: string; status?: TravelRequirementRuleStatus }) {
    const rows = await this.prisma.travelRequirementRule.findMany({
      where: { ...(query.country ? { country: query.country.toUpperCase() } : {}), ...(query.status ? { status: query.status } : {}) },
      orderBy: [{ country: "asc" }, { requirementType: "asc" }, { id: "asc" }],
      take: 500,
    });
    return rows.map(toRuleDto);
  }

  async upsertRule(
    admin: ResolvedAdminContext,
    id: string | null,
    input: { country: string; city?: string | null; requirementType: TravelRequirementType; title: string; description: string; species?: PetSpecies[]; source: string; sourceUrl?: string | null; verifiedAt: string; validUntil?: string | null; status?: TravelRequirementRuleStatus },
    requestId?: string,
  ) {
    const verifiedAt = new Date(input.verifiedAt);
    if (verifiedAt > new Date()) throw new ValidationApiException({ field: "verifiedAt", reason: "IN_FUTURE" });
    if (input.validUntil && new Date(input.validUntil) <= verifiedAt) throw new ValidationApiException({ field: "validUntil", reason: "MUST_BE_AFTER_VERIFIED_AT" });
    const data = {
      country: input.country.toUpperCase(),
      city: input.city?.trim() || null,
      requirementType: input.requirementType,
      title: input.title.trim(),
      description: input.description.trim(),
      species: input.species ?? [],
      source: input.source.trim(),
      sourceUrl: input.sourceUrl?.trim() || null,
      verifiedAt,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      status: input.status ?? TravelRequirementRuleStatus.ACTIVE,
      updatedByAdminId: admin.adminUserId,
    };
    let row;
    if (id) {
      const existing = await this.prisma.travelRequirementRule.findUnique({ where: { id } });
      if (!existing) throw new NotFoundApiException("Requirement rule", { id });
      row = await this.prisma.travelRequirementRule.update({ where: { id }, data });
    } else {
      row = await this.prisma.travelRequirementRule.create({ data });
    }
    await this.audit.record({ adminUserId: admin.adminUserId, action: (id ? "travel_requirement_rule.updated" : "travel_requirement_rule.created") as never, entityType: "TRAVEL_REQUIREMENT_RULE", entityId: row.id, afterSummary: { country: row.country, requirementType: row.requirementType, status: row.status, source: row.source }, requestId });
    return toRuleDto(row);
  }

  // --- Partners / analytics -----------------------------------------------------------

  async listPartners() {
    const orgs = await this.prisma.providerOrganization.findMany({
      where: { travelListings: { some: {} } },
      select: { id: true, name: true, type: true, verificationStatus: true, _count: { select: { travelListings: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200,
    });
    const bookingCounts = await this.prisma.travelBooking.groupBy({ by: ["listingId"], where: { status: { notIn: [TravelBookingStatus.HELD, TravelBookingStatus.MODIFIED] } }, _count: { _all: true } });
    const listingOrg = await this.prisma.travelListing.findMany({ where: { organizationId: { in: orgs.map((o) => o.id) } }, select: { id: true, organizationId: true } });
    const orgOf = new Map(listingOrg.map((l) => [l.id, l.organizationId]));
    const perOrg = new Map<string, number>();
    for (const b of bookingCounts) {
      const org = orgOf.get(b.listingId);
      if (org) perOrg.set(org, (perOrg.get(org) ?? 0) + b._count._all);
    }
    return orgs.map((o) => ({ id: o.id, name: o.name, type: o.type, verificationStatus: o.verificationStatus, listingCount: o._count.travelListings, bookingCount: perOrg.get(o.id) ?? 0 }));
  }

  /** Real counts only: booked value (terms), paid value (captured online), refunds; no settlement figures are invented. */
  async analytics(days = 30): Promise<AdminTravelAnalyticsDto> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.travelBooking.findMany({
      where: { createdAt: { gte: since }, status: { notIn: [TravelBookingStatus.HELD, TravelBookingStatus.MODIFIED, TravelBookingStatus.DRAFT] } },
      select: { status: true, totalAmountIrr: true, payNowAmountIrr: true, paymentStatus: true, refundAmountIrr: true, nights: true, listing: { select: { city: true, organizationId: true, organization: { select: { name: true } } } } },
    });
    const confirmedStatuses: TravelBookingStatus[] = [TravelBookingStatus.CONFIRMED, TravelBookingStatus.IN_PROGRESS, TravelBookingStatus.COMPLETED];
    const confirmed = rows.filter((r) => confirmedStatuses.includes(r.status));
    const cancelled = rows.filter((r) => r.status === TravelBookingStatus.CANCELLED);
    const paidStatuses = ["PAID", "REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"];
    const reviews = await this.prisma.travelReview.aggregate({ where: { status: TravelReviewStatus.PUBLISHED, createdAt: { gte: since } }, _avg: { overall: true }, _count: { _all: true } });
    const byCity = new Map<string, number>();
    const byOrg = new Map<string, { name: string; bookings: number; value: number }>();
    for (const r of confirmed) {
      byCity.set(r.listing.city, (byCity.get(r.listing.city) ?? 0) + 1);
      const o = byOrg.get(r.listing.organizationId) ?? { name: r.listing.organization.name, bookings: 0, value: 0 };
      o.bookings++;
      o.value += r.totalAmountIrr;
      byOrg.set(r.listing.organizationId, o);
    }
    const decided = confirmed.length + cancelled.length;
    return {
      days,
      bookingCount: rows.length,
      confirmedCount: confirmed.length,
      cancelledCount: cancelled.length,
      bookedValueIrr: confirmed.reduce((s, r) => s + r.totalAmountIrr, 0),
      paidValueIrr: rows.filter((r) => paidStatuses.includes(r.paymentStatus)).reduce((s, r) => s + r.payNowAmountIrr, 0),
      refundedIrr: rows.reduce((s, r) => s + r.refundAmountIrr, 0),
      cancellationRate: decided ? Math.round((cancelled.length / decided) * 1000) / 10 : null,
      averageNights: confirmed.length ? Math.round((confirmed.reduce((s, r) => s + r.nights, 0) / confirmed.length) * 10) / 10 : null,
      averageRating: reviews._avg.overall ? Math.round(reviews._avg.overall * 10) / 10 : null,
      reviewCount: reviews._count._all,
      topDestinations: [...byCity].map(([city, bookings]) => ({ city, bookings })).sort((a, b) => b.bookings - a.bookings).slice(0, 8),
      topProviders: [...byOrg].map(([organizationId, v]) => ({ organizationId, name: v.name, bookings: v.bookings, bookedValueIrr: v.value })).sort((a, b) => b.bookings - a.bookings).slice(0, 8),
      settlementNote: "PAYOUTS_NOT_AUTOMATED",
    };
  }
}
