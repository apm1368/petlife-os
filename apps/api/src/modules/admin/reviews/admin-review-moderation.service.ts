import { Injectable } from "@nestjs/common";
import {
  AdminVertical,
  Prisma,
  ProductReviewStatus,
  ProviderReviewStatus,
  TravelReviewStatus,
} from "@prisma/client";
import type {
  AdminReviewModerationListDto,
  AdminReviewModerationRowDto,
  AdminReviewVertical,
} from "@petlife/types";
import {
  AdminAccessDeniedException,
  NotFoundApiException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import {
  resolvePagination,
  toPaginatedDto,
  type PaginationQueryDto,
} from "../../../common/pagination/pagination.dto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { roleHasPermission, type AdminPermission } from "../auth/admin-permissions";
import { allowedProviderTypes, canReachVertical } from "../auth/admin-verticals";

type Query = PaginationQueryDto & { vertical: AdminReviewVertical; status?: string; q?: string };

@Injectable()
export class AdminReviewModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private permission(admin: ResolvedAdminContext, vertical: AdminReviewVertical, manage: boolean): void {
    const permission: AdminPermission =
      vertical === "SERVICE"
        ? manage
          ? "services.manage"
          : "services.view"
        : vertical === "PRODUCT"
          ? manage
            ? "commerce.manage"
            : "commerce.view"
          : manage
            ? "travel.manage"
            : "travel.view";
    if (!roleHasPermission(admin.role, permission))
      throw new AdminAccessDeniedException({ permission, vertical });
    if (vertical === "TRAVEL" && !canReachVertical(admin, AdminVertical.ACCOMMODATION))
      throw new AdminAccessDeniedException({ reason: "OUT_OF_VERTICAL_SCOPE", vertical });
  }

  private labels(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 10);
  }

  private transition(status: string, decision: "APPROVED" | "REJECTED"): void {
    const allowed = decision === "APPROVED" ? ["PENDING", "REJECTED"] : ["PENDING", "APPROVED"];
    if (!allowed.includes(status))
      throw new ValidationApiException({
        field: "decision",
        reason: status === decision ? "UNCHANGED" : "INVALID_REVIEW_TRANSITION",
        status,
        decision,
      });
  }

  async list(admin: ResolvedAdminContext, query: Query): Promise<AdminReviewModerationListDto> {
    this.permission(admin, query.vertical, false);
    const { page, pageSize, skip, take } = resolvePagination(query);
    const q = query.q?.trim();
    const status = query.status ?? "PENDING";
    if (query.vertical === "SERVICE") {
      const types = allowedProviderTypes(admin);
      const where: Prisma.ProviderReviewWhereInput = {
        status: status as ProviderReviewStatus,
        ...(types === null ? {} : { providerOrganization: { type: { in: types } } }),
        ...(q
          ? {
              OR: [
                { body: { contains: q, mode: "insensitive" } },
                { user: { displayName: { contains: q, mode: "insensitive" } } },
                { providerOrganization: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        this.prisma.providerReview.findMany({
          where,
          include: {
            user: { select: { displayName: true } },
            providerOrganization: { select: { name: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take,
        }),
        this.prisma.providerReview.count({ where }),
      ]);
      return toPaginatedDto(
        rows.map((row) =>
          this.row(
            row,
            "SERVICE",
            row.providerOrganizationId,
            row.providerOrganization.name,
            row.rating,
            row.user.displayName,
          ),
        ),
        total,
        page,
        pageSize,
      );
    }
    if (query.vertical === "PRODUCT") {
      const where: Prisma.ProductReviewWhereInput = {
        status: status as ProductReviewStatus,
        ...(q
          ? {
              OR: [
                { body: { contains: q, mode: "insensitive" } },
                { user: { displayName: { contains: q, mode: "insensitive" } } },
                { product: { title: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        this.prisma.productReview.findMany({
          where,
          include: { user: { select: { displayName: true } }, product: { select: { title: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take,
        }),
        this.prisma.productReview.count({ where }),
      ]);
      return toPaginatedDto(
        rows.map((row) =>
          this.row(row, "PRODUCT", row.productId, row.product.title, row.rating, row.user.displayName),
        ),
        total,
        page,
        pageSize,
      );
    }
    const matchingAuthorIds = q
      ? (
          await this.prisma.user.findMany({
            where: { displayName: { contains: q, mode: "insensitive" } },
            select: { id: true },
          })
        ).map((user) => user.id)
      : [];
    const where: Prisma.TravelReviewWhereInput = {
      status: status as TravelReviewStatus,
      ...(q
        ? {
            OR: [
              { body: { contains: q, mode: "insensitive" } },
              { listing: { title: { contains: q, mode: "insensitive" } } },
              { userId: { in: matchingAuthorIds } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelReview.findMany({
        where,
        include: { listing: { select: { title: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      this.prisma.travelReview.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return toPaginatedDto(
      rows.map((row) =>
        this.row(row, "TRAVEL", row.listingId, row.listing.title, row.overall, names.get(row.userId) ?? "—"),
      ),
      total,
      page,
      pageSize,
    );
  }

  private row(
    row: {
      id: string;
      status: string;
      body: string | null;
      moderationLabels: string[];
      hiddenReason: string | null;
      createdAt: Date;
      moderatedAt: Date | null;
    },
    vertical: AdminReviewVertical,
    targetId: string,
    targetName: string,
    rating: number,
    authorName: string,
  ): AdminReviewModerationRowDto {
    return {
      id: row.id,
      vertical,
      status: row.status as AdminReviewModerationRowDto["status"],
      rating,
      body: row.body,
      authorName,
      target: { id: targetId, name: targetName },
      labels: row.moderationLabels,
      moderationReason: row.hiddenReason,
      createdAt: row.createdAt.toISOString(),
      moderatedAt: row.moderatedAt?.toISOString() ?? null,
    };
  }

  async decide(
    admin: ResolvedAdminContext,
    vertical: AdminReviewVertical,
    id: string,
    decision: "APPROVED" | "REJECTED",
    reason: string | undefined,
    labels: string[],
  ): Promise<AdminReviewModerationRowDto> {
    if (!["SERVICE", "PRODUCT", "TRAVEL"].includes(vertical))
      throw new ValidationApiException({ field: "vertical", reason: "INVALID" });
    this.permission(admin, vertical, true);
    if (decision === "REJECTED" && !reason?.trim())
      throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    const now = new Date(),
      cleanLabels = this.labels(labels),
      note = reason?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      if (vertical === "SERVICE") {
        const existing = await tx.providerReview.findUnique({
          where: { id },
          include: {
            user: { select: { displayName: true } },
            providerOrganization: { select: { name: true, type: true } },
          },
        });
        if (!existing) throw new NotFoundApiException("ProviderReview");
        const types = allowedProviderTypes(admin);
        if (types !== null && !types.includes(existing.providerOrganization.type))
          throw new AdminAccessDeniedException({ reason: "OUT_OF_VERTICAL_SCOPE", vertical });
        this.transition(existing.status, decision);
        const changed = await tx.providerReview.updateMany({
          where: { id, status: existing.status },
          data: {
            status: decision as ProviderReviewStatus,
            hiddenReason: note,
            moderationLabels: cleanLabels,
            moderatedAt: now,
            moderatedByAdminId: admin.adminUserId,
          },
        });
        if (changed.count !== 1)
          throw new ValidationApiException({ field: "decision", reason: "STALE_REVIEW_STATE" });
        const updated = await tx.providerReview.findUniqueOrThrow({ where: { id } });
        await this.audit.record({
          adminUserId: admin.adminUserId,
          action: decision === "APPROVED" ? "review.approved" : "review.rejected",
          entityType: "ProviderReview",
          entityId: id,
          reason: note ?? undefined,
          beforeSummary: { status: existing.status },
          afterSummary: { status: decision, labels: cleanLabels },
          tx,
        });
        return this.row(
          updated,
          vertical,
          existing.providerOrganizationId,
          existing.providerOrganization.name,
          existing.rating,
          existing.user.displayName,
        );
      }
      if (vertical === "PRODUCT") {
        const existing = await tx.productReview.findUnique({
          where: { id },
          include: { user: { select: { displayName: true } }, product: { select: { title: true } } },
        });
        if (!existing) throw new NotFoundApiException("ProductReview");
        this.transition(existing.status, decision);
        const changed = await tx.productReview.updateMany({
          where: { id, status: existing.status },
          data: {
            status: decision as ProductReviewStatus,
            hiddenReason: note,
            moderationLabels: cleanLabels,
            moderatedAt: now,
            moderatedByAdminId: admin.adminUserId,
          },
        });
        if (changed.count !== 1)
          throw new ValidationApiException({ field: "decision", reason: "STALE_REVIEW_STATE" });
        const updated = await tx.productReview.findUniqueOrThrow({ where: { id } });
        await this.audit.record({
          adminUserId: admin.adminUserId,
          action: decision === "APPROVED" ? "review.approved" : "review.rejected",
          entityType: "ProductReview",
          entityId: id,
          reason: note ?? undefined,
          beforeSummary: { status: existing.status },
          afterSummary: { status: decision, labels: cleanLabels },
          tx,
        });
        return this.row(
          updated,
          vertical,
          existing.productId,
          existing.product.title,
          existing.rating,
          existing.user.displayName,
        );
      }
      const existing = await tx.travelReview.findUnique({
        where: { id },
        include: { listing: { select: { title: true } } },
      });
      if (!existing) throw new NotFoundApiException("TravelReview");
      this.transition(existing.status, decision);
      const user = await tx.user.findUnique({
        where: { id: existing.userId },
        select: { displayName: true },
      });
      const changed = await tx.travelReview.updateMany({
        where: { id, status: existing.status },
        data: {
          status: decision as TravelReviewStatus,
          hiddenReason: note,
          moderationLabels: cleanLabels,
          moderatedAt: now,
          moderatedByAdminId: admin.adminUserId,
        },
      });
      if (changed.count !== 1)
        throw new ValidationApiException({ field: "decision", reason: "STALE_REVIEW_STATE" });
      const updated = await tx.travelReview.findUniqueOrThrow({ where: { id } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: decision === "APPROVED" ? "review.approved" : "review.rejected",
        entityType: "TravelReview",
        entityId: id,
        reason: note ?? undefined,
        beforeSummary: { status: existing.status },
        afterSummary: { status: decision, labels: cleanLabels },
        tx,
      });
      return this.row(
        updated,
        vertical,
        existing.listingId,
        existing.listing.title,
        existing.overall,
        user?.displayName ?? "—",
      );
    });
  }
}
