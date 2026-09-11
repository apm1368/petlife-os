import { Injectable } from "@nestjs/common";
import { Prisma, SupportNeedStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { AdminAuditAction } from "../audit/admin-audit-action";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { InvalidSupportNeedTransitionException, SupportNeedListingNotFoundException } from "../../../common/errors/api-exception";
import { toSupportNeedListingDto } from "../../animal-support/support-need-mapper";
import type { ListAdminSupportNeedListingsQueryDto, ReviewSupportNeedListingDto } from "../../animal-support/dto/support-need.dto";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const LISTING_INCLUDE = {
  organization: { select: { name: true, verificationStatus: true, isPubliclyListed: true } },
} satisfies Prisma.SupportNeedListingInclude;

/**
 * The moderation half of the classifieds board. Kept in the admin module —
 * and importing only the shared mapper, never SupportNeedService — so the
 * public/publisher half and the moderating half stay independent, the same
 * layering CommunityModerationService established in Handoff 18.
 *
 * Every decision an admin makes here is audited, and the only statuses an
 * admin may set are the moderation outcomes below: an admin cannot, for
 * example, mark someone else's need FULFILLED.
 */
const ADMIN_SETTABLE: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.REJECTED, SupportNeedStatus.REMOVED, SupportNeedStatus.EXPIRED];

/** Explicit map rather than a derived template literal, so every audited action is a checked member of the AdminAuditAction union. */
const MODERATION_AUDIT_ACTION = {
  [SupportNeedStatus.PUBLISHED]: "support_need_listing.published",
  [SupportNeedStatus.REJECTED]: "support_need_listing.rejected",
  [SupportNeedStatus.REMOVED]: "support_need_listing.removed",
  [SupportNeedStatus.EXPIRED]: "support_need_listing.expired",
} as const satisfies Partial<Record<SupportNeedStatus, AdminAuditAction>>;

/** Reviewable inbound states: what a moderator is allowed to act on. A CLOSED listing is the publisher's own final word and is left alone. */
const REVIEWABLE_FROM: Record<SupportNeedStatus, SupportNeedStatus[]> = {
  [SupportNeedStatus.DRAFT]: [SupportNeedStatus.REMOVED],
  [SupportNeedStatus.PENDING_REVIEW]: [SupportNeedStatus.PUBLISHED, SupportNeedStatus.REJECTED, SupportNeedStatus.REMOVED],
  [SupportNeedStatus.PUBLISHED]: [SupportNeedStatus.REMOVED, SupportNeedStatus.EXPIRED],
  [SupportNeedStatus.FULFILLED]: [SupportNeedStatus.REMOVED],
  [SupportNeedStatus.REJECTED]: [SupportNeedStatus.PUBLISHED, SupportNeedStatus.REMOVED],
  [SupportNeedStatus.EXPIRED]: [SupportNeedStatus.PUBLISHED, SupportNeedStatus.REMOVED],
  [SupportNeedStatus.REMOVED]: [SupportNeedStatus.PUBLISHED],
  [SupportNeedStatus.CLOSED]: [],
};

@Injectable()
export class SupportNeedModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /** The moderation queue. Unlike the public list, this sees every status. */
  async list(query: ListAdminSupportNeedListingsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportNeedListingWhereInput = {
      status: query.status,
      category: query.category,
      province: query.province,
      city: query.city,
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportNeedListing.findMany({ where, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportNeedListing.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((row) => toSupportNeedListingDto(row, true)),
      total,
      page,
      pageSize,
    );
  }

  async get(listingId: string) {
    const row = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE });
    if (!row) throw new SupportNeedListingNotFoundException({ listingId });
    return toSupportNeedListingDto(row, true);
  }

  async review(admin: ResolvedAdminContext, listingId: string, dto: ReviewSupportNeedListingDto) {
    const existing = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId } });
    if (!existing) throw new SupportNeedListingNotFoundException({ listingId });
    if (!ADMIN_SETTABLE.includes(dto.status) || !REVIEWABLE_FROM[existing.status].includes(dto.status)) {
      throw new InvalidSupportNeedTransitionException({ listingId, from: existing.status, to: dto.status });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportNeedListing.update({
        where: { id: listingId },
        data: {
          status: dto.status,
          reviewNote: dto.reviewNote ?? null,
          reviewedByAdminId: admin.adminUserId,
          // Stamped on first publication only, so re-publishing a removed listing keeps its original public age.
          publishedAt: dto.status === SupportNeedStatus.PUBLISHED && existing.publishedAt === null ? new Date() : undefined,
        },
        include: LISTING_INCLUDE,
      });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: MODERATION_AUDIT_ACTION[dto.status as keyof typeof MODERATION_AUDIT_ACTION],
        entityType: "SupportNeedListing",
        entityId: listingId,
        beforeSummary: { status: existing.status },
        afterSummary: { status: dto.status },
        reason: dto.reviewNote,
        tx,
      });
      await this.events.publish(
        "SupportNeedListingModerated",
        { listingId, from: existing.status, to: dto.status, adminUserId: admin.adminUserId },
        { tx, aggregateType: "SupportNeedListing", aggregateId: listingId },
      );
      return updated;
    });
    return toSupportNeedListingDto(row, true);
  }
}
