import { Injectable } from "@nestjs/common";
import { BookingStatus, Prisma } from "@prisma/client";
import type { ProviderOverviewDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toProviderLocationDto } from "../providers/provider-dto.mapper";
import { ProviderAvailabilityService } from "./provider-availability.service";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { toProviderBookingSummaryDto, type ProviderBookingRow } from "./provider-os-dto.mapper";

const BOOKING_ROW_INCLUDE = {
  pet: true,
  user: true,
  providerLocation: true,
  providerService: true,
} satisfies Prisma.BookingInclude;

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS];

/**
 * "What needs my attention today?" (spec section 5) — deliberately no
 * vanity analytics (no lifetime booking counts, no revenue). "Today" uses
 * plain UTC calendar-day boundaries rather than the location's own
 * timezone — see README Known limitations, same simplification precedent
 * as the rest of this phase's date/time handling.
 */
@Injectable()
export class ProviderOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ProviderAvailabilityService,
  ) {}

  async getOverview(ctx: ResolvedProviderContext): Promise<ProviderOverviewDto> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [primaryLocation, todaysBookingRows, nextBookingRows, pendingConfirmationCount, cancellationsRequiringAttentionCount, upcomingCount, availabilityIssueCount] = await Promise.all([
      this.prisma.providerLocation.findFirst({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { createdAt: "asc" } }),
      this.prisma.booking.findMany({
        where: { providerOrganizationId: ctx.organizationId, startAt: { gte: todayStart, lt: todayEnd }, bookingStatus: { in: ACTIVE_STATUSES } },
        include: BOOKING_ROW_INCLUDE,
        orderBy: { startAt: "asc" },
      }),
      this.prisma.booking.findMany({
        where: { providerOrganizationId: ctx.organizationId, startAt: { gte: now }, bookingStatus: { in: ACTIVE_STATUSES } },
        include: BOOKING_ROW_INCLUDE,
        orderBy: { startAt: "asc" },
        take: 1,
      }),
      this.prisma.booking.count({ where: { providerOrganizationId: ctx.organizationId, bookingStatus: BookingStatus.PENDING_CONFIRMATION } }),
      this.prisma.booking.count({
        where: { providerOrganizationId: ctx.organizationId, bookingStatus: BookingStatus.CANCELLED_BY_USER, cancelledAt: { gte: oneDayAgo } },
      }),
      this.prisma.booking.count({ where: { providerOrganizationId: ctx.organizationId, startAt: { gte: now }, bookingStatus: { in: ACTIVE_STATUSES } } }),
      this.availability.countUnresolvedConflicts(ctx),
    ]);

    return {
      organization: { id: ctx.organizationId, name: ctx.organizationName, verificationStatus: ctx.verificationStatus as unknown as ProviderOverviewDto["organization"]["verificationStatus"] },
      location: primaryLocation ? toProviderLocationDto(primaryLocation) : null,
      providerUser: { id: ctx.providerUserId, role: ctx.role as unknown as ProviderOverviewDto["providerUser"]["role"], displayTitle: ctx.displayTitle },
      todaysBookings: todaysBookingRows.map((b) => toProviderBookingSummaryDto(b as ProviderBookingRow)),
      nextBooking: nextBookingRows[0] ? toProviderBookingSummaryDto(nextBookingRows[0] as ProviderBookingRow) : null,
      pendingConfirmationCount,
      cancellationsRequiringAttentionCount,
      availabilityIssueCount,
      actionCounts: {
        today: todaysBookingRows.length,
        upcoming: upcomingCount,
        pendingConfirmation: pendingConfirmationCount,
      },
    };
  }
}
