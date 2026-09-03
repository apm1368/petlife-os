import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, InternalNoteEntityType, Prisma, SupportCaseCategory, SupportCaseStatus, SupportMessageAuthorType, SupportMessageVisibility } from "@prisma/client";
import type { PaginatedDto, SupportCaseContextDto, SupportCaseDetailDto, SupportCaseSummaryDto, SupportCaseUserDetailDto, SupportCaseUserSummaryDto, SupportMessageDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  AdminAccessDeniedException,
  InvalidSupportCaseReopenException,
  InvalidSupportCaseTransitionException,
  SupportCaseInvalidReferenceException,
  SupportCaseNotFoundException,
} from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { PetAccessService } from "../../pet-access/pet-access.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { InternalNoteService } from "../notes/internal-note.service";
import { SUPPORT_CASE_TRANSITIONS } from "./support-case-transitions";
import { toSupportCaseDetailDto, toSupportCaseSummaryDto, toSupportCaseUserDetailDto, toSupportCaseUserSummaryDto, toSupportMessageDto } from "./support-case.mapper";
import type { CreateSupportCaseDto } from "./dto/support-case.dto";

const CASE_INCLUDE = { assignedAdmin: { include: { user: true } }, requesterUser: true } as const;

export interface ListSupportCasesFilter {
  status?: SupportCaseStatus;
  assignedAdminId?: string;
  category?: SupportCaseCategory;
  /** Case-insensitive substring match against subject or caseNumber. */
  search?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

/** Only entity kinds a consumer can currently link their own case to — the two contextual entry points the spec requires (Order Detail, Booking Detail). */
export const USER_LINKABLE_RELATED_ENTITY_TYPES = ["ORDER", "BOOKING"] as const;
export type UserLinkableRelatedEntityType = (typeof USER_LINKABLE_RELATED_ENTITY_TYPES)[number];

export interface CreateSupportCaseAsUserInput {
  householdId?: string;
  petId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  subject: string;
  description: string;
  category: SupportCaseCategory;
}

/**
 * Owns the SupportCase lifecycle end to end (spec: "create -> assign ->
 * note -> reply -> resolve -> audit"). Every status change goes through
 * `transition()`, which locks the row (`SELECT ... FOR UPDATE`) before
 * validating against SUPPORT_CASE_TRANSITIONS — mirrors
 * InventoryReservationService's own row-locking precedent (Handoff 06) —
 * so two admins racing to change the same case's status can never both
 * apply an invalid transition; the second sees the first's committed
 * status and is validated against that, never the stale value it read
 * before locking.
 */
@Injectable()
export class SupportCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notes: InternalNoteService,
    private readonly petAccess: PetAccessService,
  ) {}

  async create(admin: ResolvedAdminContext, dto: CreateSupportCaseDto, requestId?: string): Promise<SupportCaseSummaryDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('support_case_number_seq') AS nextval`;
      // A sequence's nextval() always returns exactly one row — the
      // non-null assertion mirrors the same reasoning as the domainEventId!
      // assertion in notification-orchestrator.service.ts (Handoff 10).
      const caseNumber = `CASE-${rows[0]!.nextval.toString().padStart(6, "0")}`;

      const row = await tx.supportCase.create({
        data: {
          caseNumber,
          requesterUserId: dto.requesterUserId,
          householdId: dto.householdId,
          petId: dto.petId,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          subject: dto.subject,
          description: dto.description,
          category: dto.category,
          priority: dto.priority,
          createdByAdminId: admin.adminUserId,
        },
        include: CASE_INCLUDE,
      });

      await this.events.publish("SupportCaseCreated", { caseId: row.id, caseNumber, requesterUserId: row.requesterUserId }, { tx, aggregateType: "SupportCase", aggregateId: row.id });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "support_case.created", entityType: "SUPPORT_CASE", entityId: row.id, requestId, tx });
      return row;
    });

    return toSupportCaseSummaryDto(created);
  }

  async list(filter: ListSupportCasesFilter, query: PaginationQueryDto): Promise<PaginatedDto<SupportCaseSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportCaseWhereInput = {
      status: filter.status,
      assignedAdminId: filter.assignedAdminId,
      category: filter.category,
      createdAt: filter.createdFrom || filter.createdTo ? { gte: filter.createdFrom, lte: filter.createdTo } : undefined,
      ...(filter.search ? { OR: [{ subject: { contains: filter.search, mode: "insensitive" } }, { caseNumber: { contains: filter.search, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportCase.findMany({ where, include: CASE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportCase.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toSupportCaseSummaryDto), total, page, pageSize);
  }

  async get(caseId: string): Promise<SupportCaseDetailDto> {
    const row = await this.prisma.supportCase.findUnique({ where: { id: caseId }, include: { ...CASE_INCLUDE, createdByAdmin: { include: { user: true } } } });
    if (!row) throw new SupportCaseNotFoundException({ caseId });
    const [messages, internalNotes] = await Promise.all([
      this.prisma.supportMessage.findMany({ where: { caseId }, include: { authorUser: true, authorAdmin: { include: { user: true } } }, orderBy: { createdAt: "asc" } }),
      this.notes.listForEntity(InternalNoteEntityType.SUPPORT_CASE, caseId),
    ]);
    return toSupportCaseDetailDto(row, messages.map(toSupportMessageDto), internalNotes);
  }

  /**
   * Backs the admin ticket-detail context panel (spec: "customer/household/
   * pet/related booking/order/payment/notifications/previous tickets").
   * Notification history is already available via the existing
   * GET /admin/notifications-style customer views, so it is deliberately
   * not duplicated here — this returns the pieces that are genuinely new:
   * resolved household/pet/related-entity summaries, the requester's other
   * cases, and the SLA timestamps/derived durations.
   */
  async getContext(caseId: string): Promise<SupportCaseContextDto> {
    const supportCase = await this.prisma.supportCase.findUnique({ where: { id: caseId } });
    if (!supportCase) throw new SupportCaseNotFoundException({ caseId });

    const [household, pet, previousCases] = await Promise.all([
      supportCase.householdId ? this.prisma.household.findUnique({ where: { id: supportCase.householdId } }) : Promise.resolve(null),
      supportCase.petId ? this.prisma.pet.findUnique({ where: { id: supportCase.petId } }) : Promise.resolve(null),
      this.prisma.supportCase.findMany({
        where: { requesterUserId: supportCase.requesterUserId, id: { not: caseId } },
        include: CASE_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    let relatedEntity: SupportCaseContextDto["relatedEntity"] = null;
    if (supportCase.relatedEntityType === "ORDER" && supportCase.relatedEntityId) {
      const order = await this.prisma.order.findUnique({ where: { id: supportCase.relatedEntityId } });
      if (order) relatedEntity = { type: "ORDER", id: order.id, summary: `Order — ${order.status} — ${order.totalAmount.toLocaleString()} ${order.currency}` };
    } else if (supportCase.relatedEntityType === "BOOKING" && supportCase.relatedEntityId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: supportCase.relatedEntityId } });
      if (booking) relatedEntity = { type: "BOOKING", id: booking.id, summary: `${booking.category} booking on ${booking.startAt.toISOString()}` };
    } else if (supportCase.relatedEntityType && supportCase.relatedEntityId) {
      relatedEntity = { type: supportCase.relatedEntityType, id: supportCase.relatedEntityId, summary: supportCase.relatedEntityId };
    }

    return {
      household: household ? { id: household.id, name: household.name ?? "Household" } : null,
      pet: pet ? { id: pet.id, name: pet.name } : null,
      relatedEntity,
      previousCases: previousCases.map(toSupportCaseSummaryDto),
      firstResponseAt: supportCase.firstResponseAt ? supportCase.firstResponseAt.toISOString() : null,
      firstResponseTimeMinutes: supportCase.firstResponseAt ? Math.round((supportCase.firstResponseAt.getTime() - supportCase.createdAt.getTime()) / 60000) : null,
      resolutionTimeMinutes: supportCase.resolvedAt ? Math.round((supportCase.resolvedAt.getTime() - supportCase.createdAt.getTime()) / 60000) : null,
    };
  }

  async assign(admin: ResolvedAdminContext, caseId: string, assigneeAdminId: string, requestId?: string): Promise<SupportCaseSummaryDto> {
    const assignee = await this.prisma.adminUser.findUnique({ where: { id: assigneeAdminId } });
    if (!assignee || assignee.status !== AdminMembershipStatus.ACTIVE) {
      throw new AdminAccessDeniedException({ reason: "ASSIGNEE_NOT_ACTIVE_ADMIN", assigneeAdminId });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!existing) throw new SupportCaseNotFoundException({ caseId });
      // A plain atomic UPDATE already gives a deterministic final state under
      // concurrent assignment (spec: "two admins assigning same case ->
      // deterministic final state") — the last commit wins, and there is no
      // business-validity constraint on *who* may hold the assignment (unlike
      // a status transition, any ACTIVE admin is always a valid assignee).
      const row = await tx.supportCase.update({ where: { id: caseId }, data: { assignedAdminId: assigneeAdminId }, include: CASE_INCLUDE });
      await this.events.publish("SupportCaseAssigned", { caseId, assigneeAdminId, previousAssigneeAdminId: existing.assignedAdminId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "support_case.assigned", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { assigneeAdminId }, requestId, tx });
      return row;
    });

    return toSupportCaseSummaryDto(updated);
  }

  async transition(admin: ResolvedAdminContext, caseId: string, to: SupportCaseStatus, requestId?: string): Promise<SupportCaseSummaryDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "support_cases" WHERE "id" = ${caseId}::uuid FOR UPDATE`;
      if (!locked) throw new SupportCaseNotFoundException({ caseId });

      const current = await tx.supportCase.findUniqueOrThrow({ where: { id: caseId } });
      if (current.status === to) return tx.supportCase.findUniqueOrThrow({ where: { id: caseId }, include: CASE_INCLUDE });

      const allowed = SUPPORT_CASE_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(to)) {
        throw new InvalidSupportCaseTransitionException({ caseId, from: current.status, to });
      }

      const data: Prisma.SupportCaseUpdateInput = { status: to };
      if (to === SupportCaseStatus.RESOLVED && !current.resolvedAt) data.resolvedAt = new Date();
      if (to === SupportCaseStatus.CLOSED && !current.closedAt) data.closedAt = new Date();

      const row = await tx.supportCase.update({ where: { id: caseId }, data, include: CASE_INCLUDE });

      await this.events.publish("SupportCaseStatusChanged", { caseId, from: current.status, to }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      if (to === SupportCaseStatus.RESOLVED) {
        await this.events.publish("SupportCaseResolved", { caseId, caseNumber: row.caseNumber, requesterUserId: row.requesterUserId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      }
      if (to === SupportCaseStatus.CLOSED) {
        await this.events.publish("SupportCaseClosed", { caseId, requesterUserId: row.requesterUserId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      }
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "support_case.status_changed",
        entityType: "SUPPORT_CASE",
        entityId: caseId,
        beforeSummary: { status: current.status },
        afterSummary: { status: to },
        requestId,
        tx,
      });

      return row;
    });

    return toSupportCaseSummaryDto(updated);
  }

  async postMessage(admin: ResolvedAdminContext, caseId: string, body: string, visibility: SupportMessageVisibility, requestId?: string): Promise<SupportMessageDto> {
    const message = await this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!supportCase) throw new SupportCaseNotFoundException({ caseId });

      const created = await tx.supportMessage.create({
        data: { caseId, authorType: SupportMessageAuthorType.ADMIN, authorAdminId: admin.adminUserId, body, visibility },
        include: { authorUser: true, authorAdmin: { include: { user: true } } },
      });

      // SLA foundation fields only — see the schema doc comment on
      // SupportCase. firstResponseAt is gated on PUBLIC because an INTERNAL
      // note is never seen by the requester, so it can't count as "we
      // responded"; lastAdminMessageAt tracks admin activity regardless of
      // visibility.
      const now = new Date();
      await tx.supportCase.update({
        where: { id: caseId },
        data: { lastAdminMessageAt: now, ...(visibility === SupportMessageVisibility.PUBLIC && !supportCase.firstResponseAt ? { firstResponseAt: now } : {}) },
      });

      // Enforced at the query layer everywhere a consumer-facing endpoint
      // could ever read this table (there is none in this handoff) — see
      // SupportMessageVisibility's own doc comment in schema.prisma. The
      // notification fan-out below only ever fires for PUBLIC messages, by
      // construction: an INTERNAL message never reaches NotifyInput at all.
      if (visibility === SupportMessageVisibility.PUBLIC) {
        await this.events.publish(
          "SupportMessagePosted",
          { caseId, caseNumber: supportCase.caseNumber, requesterUserId: supportCase.requesterUserId, visibility, authorType: SupportMessageAuthorType.ADMIN },
          { tx, aggregateType: "SupportCase", aggregateId: caseId },
        );
      }
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "support_message.posted", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { visibility }, requestId, tx });

      return created;
    });

    return toSupportMessageDto(message);
  }

  /**
   * IDOR guard for user-created cases (spec: a case must never falsely
   * claim to reference someone else's household/pet/order/booking).
   * Deliberately throws the same generic SupportCaseInvalidReferenceException
   * for every failure mode rather than a per-entity message, so a client
   * can't use the error to probe which entity IDs exist.
   */
  private async assertUserOwnsReferences(userId: string, input: Pick<CreateSupportCaseAsUserInput, "householdId" | "petId" | "relatedEntityType" | "relatedEntityId">): Promise<void> {
    if (input.householdId) {
      const membership = await this.prisma.householdMember.findFirst({ where: { householdId: input.householdId, userId } });
      if (!membership) throw new SupportCaseInvalidReferenceException({ field: "householdId" });
    }

    if (input.petId) {
      const owns = await this.petAccess.hasActiveAccess(input.petId, userId);
      if (!owns) throw new SupportCaseInvalidReferenceException({ field: "petId" });
    }

    if (input.relatedEntityType || input.relatedEntityId) {
      if (!input.relatedEntityType || !input.relatedEntityId) {
        throw new SupportCaseInvalidReferenceException({ field: "relatedEntity" });
      }

      if (input.relatedEntityType === "ORDER") {
        const order = await this.prisma.order.findUnique({ where: { id: input.relatedEntityId } });
        if (!order || order.userId !== userId) throw new SupportCaseInvalidReferenceException({ field: "relatedEntity" });
      } else if (input.relatedEntityType === "BOOKING") {
        const booking = await this.prisma.booking.findUnique({ where: { id: input.relatedEntityId } });
        if (!booking) throw new SupportCaseInvalidReferenceException({ field: "relatedEntity" });
        const owns = booking.userId === userId || (await this.petAccess.hasActiveAccess(booking.petId, userId));
        if (!owns) throw new SupportCaseInvalidReferenceException({ field: "relatedEntity" });
      } else {
        throw new SupportCaseInvalidReferenceException({ field: "relatedEntityType" });
      }
    }
  }

  /**
   * The consumer-facing create path. Always requesterUserId = the caller
   * (no impersonation), always createdByAdminId = null, and priority is
   * never accepted from the client — the DTO simply has no such field, so
   * there is nothing here to ignore (spec: "do not let normal users
   * arbitrarily mark every ticket URGENT").
   */
  async createAsUser(userId: string, input: CreateSupportCaseAsUserInput): Promise<SupportCaseUserSummaryDto> {
    await this.assertUserOwnsReferences(userId, input);

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('support_case_number_seq') AS nextval`;
      const caseNumber = `CASE-${rows[0]!.nextval.toString().padStart(6, "0")}`;

      const row = await tx.supportCase.create({
        data: {
          caseNumber,
          requesterUserId: userId,
          householdId: input.householdId,
          petId: input.petId,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
          subject: input.subject,
          description: input.description,
          category: input.category,
        },
        include: CASE_INCLUDE,
      });

      await this.events.publish("SupportCaseCreated", { caseId: row.id, caseNumber, requesterUserId: userId }, { tx, aggregateType: "SupportCase", aggregateId: row.id });
      return row;
    });

    return toSupportCaseUserSummaryDto(created);
  }

  async listForUser(userId: string, query: PaginationQueryDto): Promise<PaginatedDto<SupportCaseUserSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportCaseWhereInput = { requesterUserId: userId };
    const [rows, total] = await Promise.all([
      this.prisma.supportCase.findMany({ where, include: CASE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportCase.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toSupportCaseUserSummaryDto), total, page, pageSize);
  }

  async getForUser(userId: string, caseId: string): Promise<SupportCaseUserDetailDto> {
    const row = await this.prisma.supportCase.findUnique({ where: { id: caseId }, include: CASE_INCLUDE });
    // Same 404-for-both shape as OrdersService/BookingsService's own
    // getById(userId, id) — "not found" and "not yours" must be
    // indistinguishable to the caller.
    if (!row || row.requesterUserId !== userId) throw new SupportCaseNotFoundException({ caseId });

    // Only PUBLIC messages are ever fetched for a user-facing read — an
    // INTERNAL row never enters process memory on this path, let alone the
    // response. This is the hard security requirement from the spec,
    // enforced at the query layer, not by filtering after the fact.
    const messages = await this.prisma.supportMessage.findMany({
      where: { caseId, visibility: SupportMessageVisibility.PUBLIC },
      include: { authorUser: true, authorAdmin: { include: { user: true } } },
      orderBy: { createdAt: "asc" },
    });

    return toSupportCaseUserDetailDto(row, messages.map(toSupportMessageDto));
  }

  async postMessageAsUser(userId: string, caseId: string, body: string): Promise<SupportMessageDto> {
    const message = await this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!supportCase || supportCase.requesterUserId !== userId) throw new SupportCaseNotFoundException({ caseId });

      const created = await tx.supportMessage.create({
        data: { caseId, authorType: SupportMessageAuthorType.USER, authorUserId: userId, body, visibility: SupportMessageVisibility.PUBLIC },
        include: { authorUser: true, authorAdmin: { include: { user: true } } },
      });

      await tx.supportCase.update({ where: { id: caseId }, data: { lastUserMessageAt: new Date() } });

      // A user replying while the case is parked in WAITING_ON_USER is
      // exactly the event that state was waiting for — hand it back to the
      // queue automatically rather than leaving it stuck until an admin
      // notices. Any other status is left untouched; this is the one
      // deliberate, narrow exception to "no arbitrary status PATCH", not a
      // general rule.
      if (supportCase.status === SupportCaseStatus.WAITING_ON_USER) {
        await tx.supportCase.update({ where: { id: caseId }, data: { status: SupportCaseStatus.IN_PROGRESS } });
        await this.events.publish(
          "SupportCaseStatusChanged",
          { caseId, from: SupportCaseStatus.WAITING_ON_USER, to: SupportCaseStatus.IN_PROGRESS },
          { tx, aggregateType: "SupportCase", aggregateId: caseId },
        );
      }

      // Published for completeness (e.g. a future admin-side "customer
      // replied" indicator) but never notifies the requester — see the
      // authorType guard in SupportNotificationListener.onMessagePosted: a
      // user should never be notified about their own message.
      await this.events.publish(
        "SupportMessagePosted",
        { caseId, caseNumber: supportCase.caseNumber, requesterUserId: supportCase.requesterUserId, visibility: SupportMessageVisibility.PUBLIC, authorType: SupportMessageAuthorType.USER },
        { tx, aggregateType: "SupportCase", aggregateId: caseId },
      );

      return created;
    });

    return toSupportMessageDto(message);
  }

  /**
   * A narrower, user-triggered sibling of transition() — reachable only
   * from RESOLVED/CLOSED and only targeting OPEN, and only by the case's
   * own requester. Kept out of SUPPORT_CASE_TRANSITIONS deliberately: that
   * map is the admin-facing state machine (its own RESOLVED -> IN_PROGRESS
   * "reopen for internal work" already exists and has different actor
   * semantics), and widening it to include a user-reachable OPEN edge would
   * blur who is allowed to trigger which edge.
   */
  async reopen(userId: string, caseId: string): Promise<SupportCaseUserSummaryDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "support_cases" WHERE "id" = ${caseId}::uuid FOR UPDATE`;
      if (!locked) throw new SupportCaseNotFoundException({ caseId });

      const current = await tx.supportCase.findUniqueOrThrow({ where: { id: caseId } });
      if (current.requesterUserId !== userId) throw new SupportCaseNotFoundException({ caseId });
      if (current.status !== SupportCaseStatus.RESOLVED && current.status !== SupportCaseStatus.CLOSED) {
        throw new InvalidSupportCaseReopenException({ caseId, from: current.status });
      }

      const row = await tx.supportCase.update({ where: { id: caseId }, data: { status: SupportCaseStatus.OPEN }, include: CASE_INCLUDE });

      await this.events.publish("SupportCaseReopened", { caseId, from: current.status, requesterUserId: userId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      await this.events.publish("SupportCaseStatusChanged", { caseId, from: current.status, to: SupportCaseStatus.OPEN }, { tx, aggregateType: "SupportCase", aggregateId: caseId });

      return row;
    });

    return toSupportCaseUserSummaryDto(updated);
  }
}

