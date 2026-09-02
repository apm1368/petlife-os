import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  ActivityTimelineEntryDto,
  AdminCustomerListItemDto,
  AdminOrderSummaryDto,
  AdminPiiRevealDto,
  AdminSearchResultDto,
  Customer360Dto,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminCustomerNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { toNotificationDto } from "../../notifications/notifications.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { toSupportCaseSummaryDto } from "../support/support-case.mapper";
import { toDisputeDto } from "../dispute/dispute.mapper";

const RECENT_LIMIT = 10;

function toListItem(user: { id: string; displayName: string; email: string | null; phone: string | null; createdAt: Date }): AdminCustomerListItemDto {
  return {
    id: user.id,
    displayName: user.displayName,
    emailMasked: user.email ? maskEmail(user.email) : null,
    phoneMasked: user.phone ? maskPhone(user.phone) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * The single "understand this household" read path (spec: "Customer ->
 * Household -> Pet -> Activity -> Transactions -> Support issue -> Action ->
 * Resolution -> Audit trail, avoid disconnected tables"). The activity
 * timeline is composed in application code from several existing tables'
 * own queries — mirrors Handoff 09's own "Unified Seller Orders view"
 * precedent — rather than a new event-warehouse table or a query against
 * the internal DomainEvent outbox (which has no direct userId column).
 *
 * Support-case and dispute summaries are mapped inline here today; once
 * SupportCaseService/DisputeService exist (Handoff 11 stages 7-8) this
 * should import their own toDto helpers instead of duplicating the shape,
 * the same way Communications History already reuses
 * notifications.service.ts's toNotificationDto rather than a second mapper.
 */
@Injectable()
export class AdminCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /** Postgres `contains`/insensitive-mode matching only (spec: "no Elasticsearch") — matches displayName, email, or phone. */
  async search(q: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.user.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toListItem), total, page, pageSize);
  }

  async globalSearch(q: string): Promise<AdminSearchResultDto> {
    if (!q) return { customers: [], orders: [], supportCases: [] };
    // Order.id is a Postgres UUID column — no partial/prefix match is
    // possible there, so an order only ever matches on an exact id.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    const [users, orders, cases] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] },
        take: 10,
      }),
      isUuid ? this.prisma.order.findMany({ where: { id: q }, take: 10 }) : Promise.resolve([]),
      this.prisma.supportCase.findMany({
        where: { OR: [{ caseNumber: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] },
        include: { assignedAdmin: { include: { user: true } }, requesterUser: true },
        take: 10,
      }),
    ]);
    return {
      customers: users.map(toListItem),
      orders: orders.map(toOrderSummary),
      supportCases: cases.map(toSupportCaseSummaryDto),
    };
  }

  async getCustomer360(userId: string): Promise<Customer360Dto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AdminCustomerNotFoundException({ userId });

    const [households, orders, bookings, supportCases, disputes, internalNotes, notifications] = await Promise.all([
      this.prisma.household.findMany({
        where: { members: { some: { userId } } },
        include: { members: true, pets: true },
      }),
      this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: RECENT_LIMIT }),
      this.prisma.booking.findMany({ where: { userId }, orderBy: { startAt: "desc" }, take: RECENT_LIMIT }),
      this.prisma.supportCase.findMany({
        where: { requesterUserId: userId },
        include: { assignedAdmin: { include: { user: true } }, requesterUser: true },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
      this.prisma.dispute.findMany({
        where: { raisedByUserId: userId },
        include: {
          assignedAdmin: { include: { user: true } },
          evidence: { include: { actorUser: true, actorAdmin: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      }),
      this.prisma.internalNote.findMany({
        where: { entityType: "USER", entityId: userId },
        include: { authorAdmin: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.findMany({ where: { userId }, include: { deliveries: true }, orderBy: { createdAt: "desc" }, take: RECENT_LIMIT }),
    ]);

    const householdDtos = households.map((h) => ({
      id: h.id,
      name: h.name,
      city: h.city,
      memberCount: h.members.length,
      pets: h.pets.map((p) => ({ id: p.id, name: p.name, species: p.species as never, lifecycleStatus: p.lifecycleStatus as never })),
    }));

    const orderDtos = orders.map(toOrderSummary);
    const bookingDtos = bookings.map((b) => ({ id: b.id, category: b.category, bookingStatus: b.bookingStatus, startAt: b.startAt.toISOString(), petId: b.petId }));
    const supportCaseDtos = supportCases.map(toSupportCaseSummaryDto);
    const disputeDtos = disputes.map(toDisputeDto);
    const noteDtos = internalNotes.map((n) => ({
      id: n.id,
      entityType: n.entityType as never,
      entityId: n.entityId,
      author: { id: n.authorAdmin.id, displayName: n.authorAdmin.user.displayName, role: n.authorAdmin.role as never },
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
    }));
    const notificationDtos = notifications.map(toNotificationDto);

    const timeline: ActivityTimelineEntryDto[] = [
      ...orderDtos.map((o) => ({ type: "order" as const, id: o.id, summary: `Order ${o.status}`, occurredAt: o.createdAt })),
      ...bookingDtos.map((b) => ({ type: "booking" as const, id: b.id, summary: `Booking ${b.bookingStatus}`, occurredAt: b.startAt })),
      ...supportCaseDtos.map((c) => ({ type: "support_case" as const, id: c.id, summary: `Support case ${c.caseNumber}: ${c.status}`, occurredAt: c.createdAt })),
      ...disputeDtos.map((d) => ({ type: "dispute" as const, id: d.id, summary: `Dispute ${d.status}`, occurredAt: d.createdAt })),
      ...notificationDtos.map((n) => ({ type: "notification" as const, id: n.id, summary: n.title, occurredAt: n.createdAt })),
    ].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    return {
      user: toListItem(user),
      households: householdDtos,
      recentOrders: orderDtos,
      recentBookings: bookingDtos,
      supportCases: supportCaseDtos,
      disputes: disputeDtos,
      internalNotes: noteDtos,
      communications: notificationDtos,
      activityTimeline: timeline,
    };
  }

  /** Requires `customer.pii.reveal` (checked by the controller's @RequireAdminPermission) — every reveal is audited (spec: "PII masking by default, with audited reveal"), never silent. */
  async revealField(admin: ResolvedAdminContext, userId: string, field: "email" | "phone", reason: string, requestId?: string): Promise<AdminPiiRevealDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AdminCustomerNotFoundException({ userId });
    const value = field === "email" ? user.email : user.phone;

    await this.auditLog.record({
      adminUserId: admin.adminUserId,
      action: "pii.revealed",
      entityType: "USER",
      entityId: userId,
      reason,
      afterSummary: { field },
      requestId,
    });

    return { field, value: value ?? "" };
  }
}

function toOrderSummary(order: { id: string; status: string; totalAmount: number; currency: string; createdAt: Date }): AdminOrderSummaryDto {
  return { id: order.id, status: order.status as never, totalAmount: order.totalAmount, currency: order.currency, createdAt: order.createdAt.toISOString() };
}
