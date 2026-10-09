import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccountDeletionState, PrivacyRequestStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import type { AppEnv } from "../../config/env";
import { devSimulationAllowed } from "../../common/dev/dev-simulation";

/** Admin-driven deletion transitions. COMPLETED is never reachable here: execution stays disabled (no approved policy). */
const ADMIN_TRANSITIONS: Partial<Record<AccountDeletionState, AccountDeletionState[]>> = {
  REQUESTED: [AccountDeletionState.PENDING_RETENTION],
  PENDING_RETENTION: [AccountDeletionState.READY_FOR_EXECUTION],
};

/**
 * G19 governance: the account deletion state machine (REQUESTED → PENDING_RETENTION → READY_FOR_EXECUTION →
 * COMPLETED, CANCELLED by the member before execution) and the real-user release gate. Nothing here deletes data.
 */
@Injectable()
export class PrivacyGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async listDeletionRequests(state?: AccountDeletionState) {
    const rows = await this.prisma.accountDeletionRequest.findMany({ where: state ? { state } : {}, orderBy: { requestedAt: "desc" }, take: 200, include: { user: { select: { displayName: true } } } });
    return rows.map((r) => ({ id: r.id, userId: r.userId, displayName: r.user.displayName, state: r.state, status: r.status, requestedAt: r.requestedAt.toISOString(), stateChangedAt: r.stateChangedAt.toISOString(), stateNote: r.stateNote, impactSnapshot: r.impactSnapshot }));
  }

  async transition(admin: ResolvedAdminContext, requestId: string, to: AccountDeletionState, note?: string) {
    const row = await this.prisma.accountDeletionRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundApiException("AccountDeletionRequest");
    if (to === AccountDeletionState.COMPLETED) throw new ValidationApiException({ field: "to", reason: "EXECUTION_DISABLED" });
    if (!(ADMIN_TRANSITIONS[row.state] ?? []).includes(to)) throw new ValidationApiException({ field: "to", reason: "INVALID_TRANSITION", from: row.state, to });
    if (to === AccountDeletionState.READY_FOR_EXECUTION && !this.config.get("RETENTION_POLICY_APPROVED", { infer: true })) {
      throw new ValidationApiException({ field: "to", reason: "RETENTION_POLICY_NOT_APPROVED" });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const done = await tx.accountDeletionRequest.updateMany({ where: { id: requestId, state: row.state }, data: { state: to, stateChangedAt: new Date(), stateNote: note ?? null, status: PrivacyRequestStatus.PENDING } });
      if (!done.count) throw new ValidationApiException({ field: "to", reason: "CHANGED_CONCURRENTLY" });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "account_deletion.state_changed", entityType: "AccountDeletionRequest", entityId: requestId, beforeSummary: { state: row.state }, afterSummary: { state: to }, reason: note, tx });
      await this.events.publish("AccountDeletionStateChanged", { userId: row.userId, requestId, from: row.state, to }, { tx, aggregateType: "User", aggregateId: row.userId });
      return tx.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    });
    return { id: updated.id, state: updated.state, stateChangedAt: updated.stateChangedAt.toISOString(), stateNote: updated.stateNote };
  }

  /** Real-user release gate, computed from the running configuration (read-only; never changes the server). */
  releaseGate() {
    const get = <K extends keyof AppEnv>(k: K) => this.config.get(k, { infer: true });
    const production = get("NODE_ENV") === "production";
    const tls = String(get("WEB_APP_ORIGIN")).split(",").every((o) => o.trim().startsWith("https://"));
    const items = [
      { key: "NODE_ENV_PRODUCTION", ready: production },
      { key: "TLS_ENABLED", ready: tls },
      { key: "SECURE_COOKIES", ready: production && tls },
      { key: "REAL_OTP_PROVIDER", ready: get("OTP_PROVIDER") !== "dev" },
      { key: "REAL_MESSAGING", ready: get("MESSAGING_SANDBOX_MODE") === "production" },
      { key: "PAYMENT_PRODUCTION_DECISION", ready: get("PAYMENT_SANDBOX_MODE") === "production" },
      { key: "RETENTION_POLICY_APPROVED", ready: get("RETENTION_POLICY_APPROVED") === true },
      { key: "DEV_SIMULATION_DISABLED", ready: !devSimulationAllowed(this.config) && get("DEV_SIMULATION_ENABLED") !== true },
    ];
    return { readyForRealUsers: items.every((i) => i.ready), items };
  }
}
