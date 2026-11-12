import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, NotificationCategory, NotificationPriority, type CardTransferDestination } from "@prisma/client";
import { createHash } from "node:crypto";
import type { AdminCardTransferDestinationDto, AdminCardTransferDestinationOverviewDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { adminCan } from "../auth/admin-permissions";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";
import { CardTransferDestinationService } from "../../commerce/payments/card-transfer-destination.service";
import { maskCardNumber, maskSheba, validateDestination, type DestinationInput } from "../../commerce/payments/card-transfer-destination.policy";

const masked = (row: Pick<CardTransferDestination, "cardNumber" | "sheba" | "holderName" | "bankName">) => ({
  cardNumberMasked: maskCardNumber(row.cardNumber),
  shebaMasked: maskSheba(row.sheba),
  holderName: row.holderName,
  bankName: row.bankName,
});

/**
 * The owner's company card-to-card account. Changing it is the most fraud-sensitive setting in the back office (a
 * swapped card diverts every member payment), so: SUPER_ADMIN with settings.manage only, a reason every time,
 * append-only history, a masked audit row, and every SUPER_ADMIN notified in-app and by email.
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

  async overview(admin: ResolvedAdminContext): Promise<AdminCardTransferDestinationOverviewDto> {
    const rows = await this.prisma.cardTransferDestination.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    const adminIds = [...new Set(rows.flatMap((r) => [r.createdByAdminId, r.closedByAdminId]).filter((x): x is string => !!x))];
    const admins = await this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, user: { select: { displayName: true } } } });
    const nameOf = new Map(admins.map((a) => [a.id, a.user.displayName]));
    const active = rows.find((r) => r.active) ?? null;
    const env = rows.length ? null : this.destinations.envAccount();
    const history: AdminCardTransferDestinationDto[] = rows.map((r) => ({
      id: r.id,
      ...masked(r),
      active: r.active,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      createdBy: nameOf.get(r.createdByAdminId) ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
      closedBy: r.closedByAdminId ? nameOf.get(r.closedByAdminId) ?? null : null,
      closeReason: r.closeReason,
    }));
    return {
      source: active ? "ADMIN" : env ? "ENV" : "NONE",
      current: active ? masked(active) : env ? { cardNumberMasked: env.cardNumberMasked, shebaMasked: null, holderName: env.holderName, bankName: null } : null,
      canEdit: this.canEdit(admin),
      history,
    };
  }

  async change(admin: ResolvedAdminContext, input: DestinationInput & { reason: string }, requestId?: string) {
    this.assertCanEdit(admin);
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 10) throw new ValidationApiException({ field: "reason", reason: "REASON_TOO_SHORT", min: 10 });
    const checked = validateDestination(input);
    if (!checked.ok) throw new ValidationApiException({ field: "destination", reason: checked.problem });
    const value = checked.value;
    const created = await this.prisma.$transaction(async (tx) => {
      // One change at a time, so there is never more than one active account.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('card_transfer_destination'))`;
      const previous = await tx.cardTransferDestination.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
      const now = new Date();
      await tx.cardTransferDestination.updateMany({ where: { active: true }, data: { active: false, closedAt: now, closedByAdminId: admin.adminUserId, closeReason: reason } });
      const row = await tx.cardTransferDestination.create({ data: { ...value, active: true, reason, createdByAdminId: admin.adminUserId } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "card_transfer_destination.changed",
        entityType: "CardTransferDestination",
        entityId: row.id,
        reason,
        beforeSummary: previous ? { id: previous.id, ...masked(previous) } : { source: this.destinations.envAccount() ? "ENV" : "NONE" },
        afterSummary: { id: row.id, ...masked(row) },
        requestId,
        tx,
      });
      return row;
    });
    await this.notifySuperAdmins(admin, "admin.card_destination_changed", created.id, {
      account: maskCardNumber(created.cardNumber) ?? maskSheba(created.sheba) ?? "—",
      holder: created.holderName,
      reason,
    });
    return this.overview(admin);
  }

  async deactivate(admin: ResolvedAdminContext, reasonRaw: string, requestId?: string) {
    this.assertCanEdit(admin);
    const reason = reasonRaw?.trim() ?? "";
    if (reason.length < 10) throw new ValidationApiException({ field: "reason", reason: "REASON_TOO_SHORT", min: 10 });
    const closed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('card_transfer_destination'))`;
      const current = await tx.cardTransferDestination.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
      if (!current) throw new ValidationApiException({ field: "destination", reason: "NOTHING_ACTIVE" });
      const row = await tx.cardTransferDestination.update({ where: { id: current.id }, data: { active: false, closedAt: new Date(), closedByAdminId: admin.adminUserId, closeReason: reason } });
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

/** A deterministic UUID-shaped id for a non-UUID change key (deactivation), so retries dedupe. */
function uuidFrom(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
