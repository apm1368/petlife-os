import { Injectable } from "@nestjs/common";
import { BookingStatus, ProviderReviewStatus, type ProviderReview } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import type { CreateProviderReviewDto } from "./dto/review.dto";

export interface ProviderReviewDto {
  id: string;
  bookingId: string;
  providerOrganizationId: string;
  rating: number;
  body: string | null;
  /** First name only — never contact details. */
  authorName: string;
  serviceName: string | null;
  providerResponse: string | null;
  respondedAt: string | null;
  status: ProviderReviewStatus;
  createdAt: string;
}

export interface ProviderRatingSummary {
  average: number | null;
  count: number;
}

type ReviewRow = ProviderReview & { user: { displayName: string | null }; booking: { serviceNameSnapshot: string | null } };

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "—";
}

function toDto(row: ReviewRow): ProviderReviewDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    providerOrganizationId: row.providerOrganizationId,
    rating: row.rating,
    body: row.body,
    authorName: firstName(row.user.displayName),
    serviceName: row.booking.serviceNameSnapshot,
    providerResponse: row.providerResponse,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

const INCLUDE = { user: { select: { displayName: true } }, booking: { select: { serviceNameSnapshot: true } } } as const;

/** Verified reviews: only the booking's own customer, only after COMPLETED, one per booking. */
@Injectable()
export class ProviderReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(userId: string, bookingId: string, dto: CreateProviderReviewDto): Promise<ProviderReviewDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { review: true } });
    if (!booking) throw new NotFoundApiException("Booking");
    if (booking.userId !== userId) throw new PetAccessDeniedException({ bookingId });
    if (booking.bookingStatus !== BookingStatus.COMPLETED) throw new ValidationApiException({ field: "bookingId", reason: "Only completed bookings can be reviewed" });
    if (booking.review) throw new ValidationApiException({ field: "bookingId", reason: "This booking already has a review" });
    const row = await this.prisma.providerReview.create({
      data: { bookingId, providerOrganizationId: booking.providerOrganizationId, userId, rating: dto.rating, body: dto.body?.trim() || null },
      include: INCLUDE,
    });
    await this.events.publish("ProviderReviewCreated", { reviewId: row.id, providerOrganizationId: row.providerOrganizationId, rating: row.rating }, { aggregateType: "ProviderReview", aggregateId: row.id });
    return toDto(row);
  }

  async listPublic(providerOrganizationId: string, take = 20): Promise<ProviderReviewDto[]> {
    const rows = await this.prisma.providerReview.findMany({ where: { providerOrganizationId, status: ProviderReviewStatus.PUBLISHED }, include: INCLUDE, orderBy: { createdAt: "desc" }, take: Math.min(take, 50) });
    return rows.map(toDto);
  }

  async summary(providerOrganizationId: string): Promise<ProviderRatingSummary> {
    const agg = await this.prisma.providerReview.aggregate({ where: { providerOrganizationId, status: ProviderReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { _all: true } });
    return { average: agg._avg.rating === null ? null : Math.round(agg._avg.rating * 10) / 10, count: agg._count._all };
  }

  async summaries(providerOrganizationIds: string[]): Promise<Map<string, ProviderRatingSummary>> {
    if (!providerOrganizationIds.length) return new Map();
    const rows = await this.prisma.providerReview.groupBy({ by: ["providerOrganizationId"], where: { providerOrganizationId: { in: providerOrganizationIds }, status: ProviderReviewStatus.PUBLISHED }, _avg: { rating: true }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.providerOrganizationId, { average: r._avg.rating === null ? null : Math.round(r._avg.rating * 10) / 10, count: r._count._all }]));
  }

  async listForProvider(providerOrganizationId: string): Promise<ProviderReviewDto[]> {
    const rows = await this.prisma.providerReview.findMany({ where: { providerOrganizationId }, include: INCLUDE, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map(toDto);
  }

  async respond(providerOrganizationId: string, reviewId: string, response: string): Promise<ProviderReviewDto> {
    const updated = await this.prisma.providerReview.updateMany({ where: { id: reviewId, providerOrganizationId }, data: { providerResponse: response.trim(), respondedAt: new Date() } });
    if (updated.count !== 1) throw new NotFoundApiException("Review");
    await this.events.publish("ProviderReviewResponded", { reviewId, providerOrganizationId }, { aggregateType: "ProviderReview", aggregateId: reviewId });
    return toDto(await this.prisma.providerReview.findUniqueOrThrow({ where: { id: reviewId }, include: INCLUDE }));
  }

  /** Trust & Safety moderation: hidden, never deleted, reason kept for audit. */
  async hide(reviewId: string, reason: string, adminUserId: string): Promise<ProviderReviewDto> {
    const row = await this.prisma.providerReview.update({ where: { id: reviewId }, data: { status: ProviderReviewStatus.HIDDEN, hiddenReason: reason }, include: INCLUDE }).catch(() => null);
    if (!row) throw new NotFoundApiException("Review");
    await this.events.publish("ProviderReviewHidden", { reviewId, reason, adminUserId }, { aggregateType: "ProviderReview", aggregateId: reviewId });
    return toDto(row);
  }
}
