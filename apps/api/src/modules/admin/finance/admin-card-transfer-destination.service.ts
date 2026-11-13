import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  AdminMembershipStatus,
  AdminRole,
  CardTransferDestinationStatus,
  NotificationCategory,
  NotificationPriority,
  type CardTransferDestination,
  type Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";
import type { AdminCardTransferDestinationDto, AdminCardTransferDestinationOverviewDto, AdminCardTransferDestinationPendingDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  ApiException,
  CardDestinationChangeAlreadyPendingException,
  CardDestinationChangeExpiredException,
  CardDestinationChangeNotFoundException,
  CardDestinationChangeNotPendingException,
  CardDestinationSelfApprovalException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { adminCan } from "../auth/admin-permissions";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";
import { CardTransferDestinationService, EVER_ACTIVE_STATUSES } from "../../commerce/payments/card-transfer-destination.service";
import { maskCardNumber, maskSheba, validateDestination, type DestinationInput } from "../../commerce/payments/card-transfer-destination.policy";

/** BO-14: how long a proposed account may wait for a second super admin before it expires. */
export const CARD_DESTINATION_APPROVAL_WINDOW_HOURS = 48;
const APPROVAL_WINDOW_MS = CARD_DESTINATION_APPROVAL_WINDOW_HOURS * 3_600_000;

const { PENDING, ACTIVE, CLOSED, REJECTED, EXPIRED } = CardTransferDestinationStatus;

type Client = Prisma.TransactionClient | PrismaService;

const masked = (row: Pick<CardTransferDestination, "cardNumber" | "sheba" | "holderName" | "bankName">) => ({
  cardNumberMasked: maskCardNumber(row.cardNumber),
  shebaMasked: maskSheba(row.sheba),
  holderName: row.holderName,
  bankName: row.bankName,
});

const accountLabel = (row: Pick<CardTransferDestination, "cardNumber" | "sheba">) => maskCardNumber(row.cardNumber) ?? maskSheba(row.sheba) ?? "—";

/** A PENDING proposal past its approval window is EXPIRED, whether or not a write has recorded that yet. */
const effectiveStatus = (row: Pick<CardTransferDestination, "status" | "expiresAt">, now: Date): CardTransferDestinationStatus =>
  row.status === PENDING && (!row.expiresAt || row.expiresAt <= now) ? EXPIRED : row.status;

/**
 * The owner's company card-to-card account. Changing it is the most fraud-sensitive setting in the back office (a
 * swapped card diverts every member payment), so: SUPER_ADMIN with settings.manage only, a reason every time,
 * append-only history, a masked audit row, and every SUPER_ADMIN notified in-app and by email.
 *
 * BO-14 two-person control: a change is only a PENDING proposal (members keep paying into the active account) until a
 * different SUPER_ADMIN approves it within the approval window; any of them may reject it, and its proposer may
 * withdraw it. One proposal waits at a time: another is refused until that one is decided or expires. Switching the
 * account off stays immediate, as the kill switch.
 */
@Injectable()
export class AdminCardTransferDestinationService {
  private readonly logger = new Logger(AdminCardTransferDestinationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly destinations: CardTransferDestinationService,
  ) {}

  canEdit(admin: ResolvedAdminContext): boolean {
    return admin.role === AdminRole.SUPER_ADMIN && adminCan(admin, "settings.manage");
  }

  private assertCanEdit(admin: ResolvedAdminContext) {
    if (!this.canEdit(admin)) throw new ApiException("ADMIN_FORBIDDEN", "Only a super admin with settings.manage may change the card-to-card account.", HttpStatus.FORBIDDEN, { reason: "SUPER_ADMIN_WITH_SETTINGS_MANAGE_REQUIRED" });
  }

  private requireReason(raw: string | undefined): string {
    const reason = raw?.trim() ?? "";
    if (reason.length < 10) throw new ValidationApiException({ field: "reason", reason: "REASON_TOO_SHORT", min: 10 });
    return reason;
  }

  /** One change at a time, so there is never more than one active account or one waiting proposal. */
  private async lock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('card_transfer_destination'))`;
  }

  /** Records proposals that ran out of time as EXPIRED (under the lock), so they can neither be approved nor block a new one. */
  private async expireStale(tx: Prisma.TransactionClient, now: Date) {
    await tx.cardTransferDestination.updateMany({ where: { status: PENDING, OR: [{ expiresAt: null }, { expiresAt: { lte: now } }] }, data: { status: EXPIRED } });
  }

  private async everActive(client: Client = this.prisma): Promise<boolean> {
    return (await client.cardTransferDestination.count({ where: { status: { in: EVER_ACTIVE_STATUSES } } })) > 0;
  }

  /** What members were paying into when no admin account was active: the env account only if none ever was. */
  private async fallbackSource(client: Client): Promise<"ENV" | "NONE"> {
    return !(await this.everActive(client)) && this.destinations.envAccount() ? "ENV" : "NONE";
  }

  async overview(admin: ResolvedAdminContext): Promise<AdminCardTransferDestinationOverviewDto> {
    const now = new Date();
    const [rows, active, waiting, everActive] = await Promise.all([
      this.prisma.cardTransferDestination.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.cardTransferDestination.findFirst({ where: { active: true, status: ACTIVE }, orderBy: { createdAt: "desc" } }),
      this.prisma.cardTransferDestination.findFirst({ where: { status: PENDING }, orderBy: { createdAt: "desc" } }),
      this.everActive(),
    ]);
    const pending = waiting && effectiveStatus(waiting, now) === PENDING ? waiting : null;
    const adminIds = [
      ...new Set(
        [...rows, ...(pending ? [pending] : [])].flatMap((r) => [r.createdByAdminId, r.approvedByAdminId, r.closedByAdminId]).filter((x): x is string => !!x),
      ),
    ];
    const admins = await this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, user: { select: { displayName: true } } } });
    const nameOf = new Map(admins.map((a) => [a.id, a.user.displayName]));
    const env = everActive ? null : this.destinations.envAccount();
    const history: AdminCardTransferDestinationDto[] = rows.map((r) => ({
      id: r.id,
      ...masked(r),
      active: r.active,
      status: effectiveStatus(r, now),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      createdBy: nameOf.get(r.createdByAdminId) ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedBy: r.approvedByAdminId ? nameOf.get(r.approvedByAdminId) ?? null : null,
      closedAt: r.closedAt?.toISOString() ?? null,
      closedBy: r.closedByAdminId ? nameOf.get(r.closedByAdminId) ?? null : null,
      closeReason: r.closeReason,
    }));
    const canEdit = this.canEdit(admin);
    const requestedByMe = !!pending && pending.createdByAdminId === admin.adminUserId;
    const pendingDto: AdminCardTransferDestinationPendingDto | null = pending
      ? {
          id: pending.id,
          ...masked(pending),
          reason: pending.reason,
          requestedBy: nameOf.get(pending.createdByAdminId) ?? null,
          requestedAt: pending.createdAt.toISOString(),
          expiresAt: (pending.expiresAt ?? now).toISOString(),
          requestedByMe,
          canApprove: canEdit && !requestedByMe,
          canReject: canEdit,
        }
      : null;
    return {
      source: active ? "ADMIN" : env ? "ENV" : "NONE",
      current: active ? masked(active) : env ? { cardNumberMasked: env.cardNumberMasked, shebaMasked: null, holderName: env.holderName, bankName: null } : null,
      canEdit,
      pending: pendingDto,
      approvalWindowHours: CARD_DESTINATION_APPROVAL_WINDOW_HOURS,
      history,
    };
  }

  /**
   * Proposes a new account. Nothing changes for members: the row is PENDING (never `active`) until a second super
   * admin approves it. Refused (409) while another proposal is still waiting.
   */
  async change(admin: ResolvedAdminContext, input: DestinationInput & { reason: string }, requestId?: string) {
    this.assertCanEdit(admin);
    const reason = this.requireReason(input.reason);
    const checked = validateDestination(input);
    if (!checked.ok) throw new ValidationApiException({ field: "destination", reason: checked.problem });
    const value = checked.value;
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const now = new Date();
      await this.expireStale(tx, now);
      const waiting = await tx.cardTransferDestination.findFirst({ where: { status: PENDING } });
      if (waiting) throw new CardDestinationChangeAlreadyPendingException({ pendingId: waiting.id, expiresAt: waiting.expiresAt?.toISOString() ?? null });
      const current = await tx.cardTransferDestination.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
      const before = current ? { id: current.id, ...masked(current) } : { source: await this.fallbackSource(tx) };
      const row = await tx.cardTransferDestination.create({
        data: { ...value, active: false, status: PENDING, reason, createdByAdminId: admin.adminUserId, expiresAt: new Date(now.getTime() + APPROVAL_WINDOW_MS) },
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "card_transfer_destination.change_requested",
        entityType: "CardTransferDestination",
        entityId: row.id,
        reason,
        beforeSummary: before,
        afterSummary: { id: row.id, ...masked(row), status: PENDING, expiresAt: row.expiresAt?.toISOString() ?? null },
        requestId,
        tx,
      });
      return row;
    });
    await this.notifySuperAdmins(admin, "admin.card_destination_change_requested", created.id, {
      account: accountLabel(created),
      holder: created.holderName,
      reason,
      hours: String(CARD_DESTINATION_APPROVAL_WINDOW_HOURS),
    });
    return this.overview(admin);
  }

  /**
   * A different super admin approves a waiting proposal: under the same lock, the previous account is closed and the
   * proposal becomes the active one in one transaction. The conditional claim (still PENDING, not expired, not the
   * proposer's) means concurrent approvals activate it once; the others get 409.
   */
  async approve(admin: ResolvedAdminContext, id: string, requestId?: string) {
    this.assertCanEdit(admin);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const now = new Date();
      await this.expireStale(tx, now);
      const proposal = await tx.cardTransferDestination.findUnique({ where: { id } });
      if (!proposal) throw new CardDestinationChangeNotFoundException({ id });
      // Keep the expiry just recorded (the transaction commits), then refuse outside it.
      if (proposal.status === EXPIRED) return { expired: true } as const;
      if (proposal.status !== PENDING) throw new CardDestinationChangeNotPendingException({ id, status: proposal.status });
      // Two-person control, as for refund approvals: never by the proposer, whoever they are.
      if (proposal.createdByAdminId === admin.adminUserId) throw new CardDestinationSelfApprovalException({ id });

      const previous = await tx.cardTransferDestination.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
      const before = previous ? { id: previous.id, ...masked(previous) } : { source: await this.fallbackSource(tx) };
      // Close the live account first: only one row may be active at a time.
      await tx.cardTransferDestination.updateMany({
        where: { active: true },
        data: { active: false, status: CLOSED, closedAt: now, closedByAdminId: admin.adminUserId, closeReason: proposal.reason },
      });
      const claimed = await tx.cardTransferDestination.updateMany({
        where: { id, status: PENDING, expiresAt: { gt: now }, createdByAdminId: { not: admin.adminUserId } },
        data: { status: ACTIVE, active: true, approvedByAdminId: admin.adminUserId, approvedAt: now },
      });
      if (claimed.count !== 1) throw new CardDestinationChangeNotPendingException({ id });
      const row = await tx.cardTransferDestination.findUniqueOrThrow({ where: { id } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "card_transfer_destination.approved",
        entityType: "CardTransferDestination",
        entityId: row.id,
        reason: row.reason,
        beforeSummary: before,
        afterSummary: { id: row.id, ...masked(row), status: ACTIVE, requestedByAdminId: row.createdByAdminId },
        requestId,
        tx,
      });
      return { expired: false, row } as const;
    });
    if (outcome.expired) throw new CardDestinationChangeExpiredException({ id });
    const { row } = outcome;
    const requester = await this.prisma.adminUser.findUnique({ where: { id: row.createdByAdminId }, select: { user: { select: { displayName: true } } } });
    await this.notifySuperAdmins(admin, "admin.card_destination_approved", `${row.id}:approved`, {
      account: accountLabel(row),
      holder: row.holderName,
      requester: requester?.user.displayName ?? "—",
      reason: row.reason,
    });
    return this.overview(admin);
  }

  /** Any super admin rejects a waiting proposal, or its proposer withdraws it: a reason, an audit row, nothing else changes. */
  async reject(admin: ResolvedAdminContext, id: string, reasonRaw: string, requestId?: string) {
    this.assertCanEdit(admin);
    const reason = this.requireReason(reasonRaw);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const now = new Date();
      await this.expireStale(tx, now);
      const proposal = await tx.cardTransferDestination.findUnique({ where: { id } });
      if (!proposal) throw new CardDestinationChangeNotFoundException({ id });
      if (proposal.status === EXPIRED) return { expired: true } as const;
      if (proposal.status !== PENDING) throw new CardDestinationChangeNotPendingException({ id, status: proposal.status });
      const withdrawn = proposal.createdByAdminId === admin.adminUserId;
      const claimed = await tx.cardTransferDestination.updateMany({
        where: { id, status: PENDING },
        data: { status: REJECTED, closedAt: now, closedByAdminId: admin.adminUserId, closeReason: reason },
      });
      if (claimed.count !== 1) throw new CardDestinationChangeNotPendingException({ id });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "card_transfer_destination.rejected",
        entityType: "CardTransferDestination",
        entityId: proposal.id,
        reason,
        beforeSummary: { id: proposal.id, ...masked(proposal), status: PENDING },
        afterSummary: { id: proposal.id, status: REJECTED, withdrawnByRequester: withdrawn },
        requestId,
        tx,
      });
      return { expired: false, proposal } as const;
    });
    if (outcome.expired) throw new CardDestinationChangeExpiredException({ id });
    await this.notifySuperAdmins(admin, "admin.card_destination_change_rejected", `${outcome.proposal.id}:rejected`, { account: accountLabel(outcome.proposal), reason });
    return this.overview(admin);
  }

  /** The kill switch: immediate, by one super admin, no second approval. A waiting proposal is left to its own decision. */
  async deactivate(admin: ResolvedAdminContext, reasonRaw: string, requestId?: string) {
    this.assertCanEdit(admin);
    const reason = this.requireReason(reasonRaw);
    const closed = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const current = await tx.cardTransferDestination.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
      if (!current) throw new ValidationApiException({ field: "destination", reason: "NOTHING_ACTIVE" });
      const row = await tx.cardTransferDestination.update({ where: { id: current.id }, data: { active: false, status: CLOSED, closedAt: new Date(), closedByAdminId: admin.adminUserId, closeReason: reason } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "card_transfer_destination.deactivated", entityType: "CardTransferDestination", entityId: row.id, reason, beforeSummary: { id: row.id, ...masked(row), active: true }, afterSummary: { id: row.id, active: false }, requestId, tx });
      return row;
    });
    await this.notifySuperAdmins(admin, "admin.card_destination_disabled", `${closed.id}:closed`, { reason });
    return this.overview(admin);
  }

  /** In-app + email (SECURITY category) to every active SUPER_ADMIN, the actor included; one per change. */
  private async notifySuperAdmins(actor: ResolvedAdminContext, type: string, changeKey: string, params: Record<string, string>) {
    const [supers, actorUser] = await Promise.all([
      this.prisma.adminUser.findMany({ where: { role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE }, select: { userId: true } }),
      this.prisma.adminUser.findUnique({ where: { id: actor.adminUserId }, select: { user: { select: { displayName: true } } } }),
    ]);
    // The orchestrator dedupes on (domainEventId, type, user): a stable id per change makes a retried call harmless.
    const domainEventId = /^[0-9a-f-]{36}$/i.test(changeKey) ? changeKey : uuidFrom(changeKey);
    for (const { userId } of supers) {
      try {
        await this.notifications.notify({
          userId,
          type,
          category: NotificationCategory.SECURITY,
          priority: NotificationPriority.HIGH,
          templateParams: { actor: actorUser?.user.displayName ?? "—", ...params },
          deepLink: "/admin/wallets/card-account",
          entityType: "CardTransferDestination",
          domainEventId,
          attemptSms: false,
        });
      } catch (error) {
        this.logger.error(`Card destination notice to ${userId} failed`, error instanceof Error ? error.stack : undefined);
      }
    }
  }
}

/** A deterministic UUID-shaped id for a non-UUID change key (approval, rejection, deactivation), so retries dedupe. */
function uuidFrom(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
