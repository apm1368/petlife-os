import { Injectable } from "@nestjs/common";
import { Prisma, TravelListingStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { InvalidTravelListingTransitionException, TravelListingNotFoundException } from "../../../common/errors/api-exception";
import { LISTING_INCLUDE, toTravelListingDto } from "../../travel-marketplace/travel-marketplace-mapper";
import type { ListAdminTravelListingsQueryDto, ModerateTravelListingDto, SetTravelListingVerificationDto } from "../../travel-marketplace/dto/travel-marketplace.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { AdminAuditAction } from "../audit/admin-audit-action";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const ADMIN_TRANSITIONS: Record<TravelListingStatus, TravelListingStatus[]> = {
  [TravelListingStatus.DRAFT]: [TravelListingStatus.ARCHIVED],
  [TravelListingStatus.PENDING_REVIEW]: [TravelListingStatus.PUBLISHED, TravelListingStatus.SUSPENDED, TravelListingStatus.ARCHIVED],
  [TravelListingStatus.PUBLISHED]: [TravelListingStatus.SUSPENDED, TravelListingStatus.ARCHIVED],
  [TravelListingStatus.SUSPENDED]: [TravelListingStatus.PUBLISHED, TravelListingStatus.ARCHIVED],
  [TravelListingStatus.ARCHIVED]: [],
};

const AUDIT_ACTION: Record<TravelListingStatus, AdminAuditAction> = {
  [TravelListingStatus.DRAFT]: "travel_listing.archived",
  [TravelListingStatus.PENDING_REVIEW]: "travel_listing.archived",
  [TravelListingStatus.PUBLISHED]: "travel_listing.published",
  [TravelListingStatus.SUSPENDED]: "travel_listing.suspended",
  [TravelListingStatus.ARCHIVED]: "travel_listing.archived",
};

/**
 * Admin moderation operates directly on the existing TravelListing model.
 * There is intentionally no second travel-admin table: every decision and
 * reason is persisted through the shared immutable admin audit log.
 */
@Injectable()
export class AdminTravelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(query: ListAdminTravelListingsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TravelListingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.city ? { city: { equals: query.city, mode: "insensitive" } } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelListing.findMany({ where, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.travelListing.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toTravelListingDto), total, page, pageSize);
  }

  async get(listingId: string) {
    const row = await this.prisma.travelListing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE });
    if (!row) throw new TravelListingNotFoundException({ listingId });
    return toTravelListingDto(row);
  }

  async moderate(admin: ResolvedAdminContext, listingId: string, dto: ModerateTravelListingDto) {
    const existing = await this.prisma.travelListing.findUnique({ where: { id: listingId } });
    if (!existing) throw new TravelListingNotFoundException({ listingId });
    if (!ADMIN_TRANSITIONS[existing.status].includes(dto.status)) {
      throw new InvalidTravelListingTransitionException({ listingId, from: existing.status, to: dto.status, actor: "ADMIN" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.travelListing.update({
        where: { id: listingId },
        data: { status: dto.status, isPubliclyListed: dto.status === TravelListingStatus.PUBLISHED },
        include: LISTING_INCLUDE,
      });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: AUDIT_ACTION[dto.status],
        entityType: "TravelListing",
        entityId: listingId,
        reason: dto.reason,
        beforeSummary: { status: existing.status, isPubliclyListed: existing.isPubliclyListed },
        afterSummary: { status: updated.status, isPubliclyListed: updated.isPubliclyListed },
        tx,
      });
      await this.events.publish("TravelListingModerated", { listingId, from: existing.status, to: dto.status, adminUserId: admin.adminUserId }, { tx, aggregateType: "TravelListing", aggregateId: listingId });
      return updated;
    });
    return toTravelListingDto(row);
  }

  async setVerification(admin: ResolvedAdminContext, listingId: string, dto: SetTravelListingVerificationDto) {
    const existing = await this.prisma.travelListing.findUnique({ where: { id: listingId } });
    if (!existing) throw new TravelListingNotFoundException({ listingId });
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.travelListing.update({ where: { id: listingId }, data: { isVerified: dto.isVerified }, include: LISTING_INCLUDE });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "travel_listing.verification_changed",
        entityType: "TravelListing",
        entityId: listingId,
        reason: dto.reason,
        beforeSummary: { isVerified: existing.isVerified },
        afterSummary: { isVerified: updated.isVerified },
        tx,
      });
      return updated;
    });
    return toTravelListingDto(row);
  }
}
