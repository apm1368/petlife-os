import { Injectable } from "@nestjs/common";
import { AppealStatus, CommunityReportReason, CommunityReportStatus, PlaceReportStatus, TrustCaseSeverity, TrustCaseStatus, type CommunityReport } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { PlatformSettingsService } from "../../platform-settings/platform-settings.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { reportSubject } from "../community/community-moderation.service";

export type QueueKind = "REPORT" | "PLACE_REPORT" | "TRUST_CASE" | "APPEAL";
const SEVERITY_RANK: Record<TrustCaseSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const RANKED: TrustCaseSeverity[] = [TrustCaseSeverity.LOW, TrustCaseSeverity.MEDIUM, TrustCaseSeverity.HIGH, TrustCaseSeverity.CRITICAL];

/** Deterministic report triage: harm to animals or people first, spam last. */
export const REASON_SEVERITY: Record<CommunityReportReason, TrustCaseSeverity> = {
  ANIMAL_WELFARE: TrustCaseSeverity.HIGH, DANGEROUS_CONTENT: TrustCaseSeverity.HIGH, SCAM: TrustCaseSeverity.HIGH, HARASSMENT: TrustCaseSeverity.HIGH, PERSONAL_INFORMATION: TrustCaseSeverity.HIGH,
  ABUSE: TrustCaseSeverity.MEDIUM, INAPPROPRIATE: TrustCaseSeverity.MEDIUM, MISINFORMATION: TrustCaseSeverity.MEDIUM,
  SPAM: TrustCaseSeverity.LOW, OTHER: TrustCaseSeverity.LOW,
};

export interface QueueItem {
  kind: QueueKind;
  /** Stable queue key: REPORT/PLACE_REPORT group all open reports on one target; cases and appeals are single rows. */
  key: string;
  subjectType: string;
  subjectId: string;
  severity: TrustCaseSeverity;
  status: string;
  reasons: string[];
  reportCount: number;
  reporterCount: number;
  itemIds: string[];
  openedAt: string;
  ageHours: number;
  slaHours: number;
  slaDueAt: string;
  slaBreached: boolean;
  assignedAdminId: string | null;
  trustCaseId: string | null;
  deepLink: string;
}

/**
 * ERP-G unified Trust & Safety queue — one prioritized view over user reports (community, chat, provider reviews, animal
 * support, lost pet, organizations), place reports, open trust cases and pending appeals. It is a read model over the
 * existing records (no second moderation system): actions still go through the existing case/report services.
 * Duplicate reports on one target collapse into one item; many distinct reporters raise the severity one level.
 */
@Injectable()
export class TrustQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private slaHours(sev: TrustCaseSeverity) {
    return SEVERITY_RANK[sev] >= SEVERITY_RANK.HIGH ? this.settings.getInt("trust.highSeveritySlaHours") : this.settings.getInt("trust.standardSlaHours");
  }

  private item(base: Omit<QueueItem, "ageHours" | "slaHours" | "slaDueAt" | "slaBreached" | "openedAt"> & { openedAt: Date }, now: number): QueueItem {
    const sla = this.slaHours(base.severity);
    const due = base.openedAt.getTime() + sla * 3600e3;
    return { ...base, openedAt: base.openedAt.toISOString(), ageHours: Math.floor((now - base.openedAt.getTime()) / 3600e3), slaHours: sla, slaDueAt: new Date(due).toISOString(), slaBreached: due < now };
  }

  async collect(now = Date.now()): Promise<QueueItem[]> {
    const [reports, places, cases, appeals] = await Promise.all([
      this.prisma.communityReport.findMany({ where: { status: CommunityReportStatus.OPEN }, orderBy: { createdAt: "asc" }, take: 2000 }),
      this.prisma.placeReport.findMany({ where: { status: PlaceReportStatus.OPEN }, orderBy: { createdAt: "asc" }, take: 1000 }),
      this.prisma.trustCase.findMany({ where: { status: { in: [TrustCaseStatus.OPEN, TrustCaseStatus.UNDER_REVIEW] } }, orderBy: { createdAt: "asc" }, take: 1000 }),
      this.prisma.appeal.findMany({ where: { status: { in: [AppealStatus.SUBMITTED, AppealStatus.UNDER_REVIEW] } }, orderBy: { createdAt: "asc" }, take: 1000, include: { trustAction: { select: { trustCaseId: true, trustCase: { select: { subjectType: true, subjectId: true, severity: true } } } } } }),
    ]);
    const items: QueueItem[] = [];
    const groups = new Map<string, CommunityReport[]>();
    for (const r of reports) {
      const s = reportSubject(r);
      const k = `${s.subjectType}:${s.subjectId}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const [k, rs] of groups) {
      const s = reportSubject(rs[0]!);
      const reporters = new Set(rs.map((r) => r.reporterUserId)).size;
      let sev = rs.map((r) => REASON_SEVERITY[r.reason]).reduce((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a));
      if (reporters >= 3) sev = RANKED[Math.min(3, SEVERITY_RANK[sev] + 1)]!;
      items.push(this.item({ kind: "REPORT", key: `REPORT:${k}`, subjectType: s.subjectType, subjectId: s.subjectId, severity: sev, status: "OPEN", reasons: [...new Set(rs.map((r) => r.reason))], reportCount: rs.length, reporterCount: reporters, itemIds: rs.map((r) => r.id), openedAt: rs[0]!.createdAt, assignedAdminId: rs.find((r) => r.assignedAdminId)?.assignedAdminId ?? null, trustCaseId: null, deepLink: `/admin/community/reports?targetId=${s.subjectId}` }, now));
    }
    const placeGroups = new Map<string, typeof places>();
    for (const p of places) placeGroups.set(p.placeId, [...(placeGroups.get(p.placeId) ?? []), p]);
    for (const [placeId, ps] of placeGroups) {
      const reporters = new Set(ps.map((p) => p.userId)).size;
      const sev = reporters >= 3 ? TrustCaseSeverity.MEDIUM : TrustCaseSeverity.LOW;
      items.push(this.item({ kind: "PLACE_REPORT", key: `PLACE_REPORT:${placeId}`, subjectType: "PLACE", subjectId: placeId, severity: sev, status: "OPEN", reasons: [...new Set(ps.map((p) => p.reason))].slice(0, 10), reportCount: ps.length, reporterCount: reporters, itemIds: ps.map((p) => p.id), openedAt: ps[0]!.createdAt, assignedAdminId: ps.find((p) => p.assignedAdminId)?.assignedAdminId ?? null, trustCaseId: null, deepLink: `/admin/places/${placeId}` }, now));
    }
    for (const c of cases) items.push(this.item({ kind: "TRUST_CASE", key: `TRUST_CASE:${c.id}`, subjectType: c.subjectType, subjectId: c.subjectId, severity: c.severity, status: c.status, reasons: [c.reason.slice(0, 120)], reportCount: 0, reporterCount: 0, itemIds: [c.id], openedAt: c.createdAt, assignedAdminId: c.assignedAdminId, trustCaseId: c.id, deepLink: `/admin/trust/cases/${c.id}` }, now));
    for (const a of appeals) items.push(this.item({ kind: "APPEAL", key: `APPEAL:${a.id}`, subjectType: a.trustAction.trustCase.subjectType, subjectId: a.trustAction.trustCase.subjectId, severity: a.trustAction.trustCase.severity, status: a.status, reasons: [a.reason.slice(0, 120)], reportCount: 0, reporterCount: 0, itemIds: [a.id], openedAt: a.createdAt, assignedAdminId: a.reviewerAdminId, trustCaseId: a.trustAction.trustCaseId, deepLink: `/admin/trust/cases/${a.trustAction.trustCaseId}` }, now));
    // Breached first, then severity, then oldest.
    return items.sort((x, y) => Number(y.slaBreached) - Number(x.slaBreached) || SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || x.openedAt.localeCompare(y.openedAt));
  }

  async queue(admin: ResolvedAdminContext, q: { kind?: QueueKind; severity?: TrustCaseSeverity; assigned?: "me" | "unassigned" | "any"; breachedOnly?: boolean; subjectType?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1), pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const all = (await this.collect()).filter((i) =>
      (!q.kind || i.kind === q.kind) && (!q.severity || i.severity === q.severity) && (!q.subjectType || i.subjectType === q.subjectType) && (!q.breachedOnly || i.slaBreached)
      && (!q.assigned || q.assigned === "any" || (q.assigned === "me" ? i.assignedAdminId === admin.adminUserId : !i.assignedAdminId)));
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
  }

  async summary() {
    const all = await this.collect();
    const count = <K extends string>(f: (i: QueueItem) => K) => all.reduce<Record<string, number>>((m, i) => ({ ...m, [f(i)]: (m[f(i)] ?? 0) + 1 }), {});
    return {
      total: all.length, byKind: count((i) => i.kind), bySeverity: count((i) => i.severity),
      slaBreached: all.filter((i) => i.slaBreached).length, unassigned: all.filter((i) => !i.assignedAdminId).length,
      oldestOpenedAt: all.reduce<string | null>((m, i) => (!m || i.openedAt < m ? i.openedAt : m), null),
      sla: { highSeverityHours: this.settings.getInt("trust.highSeveritySlaHours"), standardHours: this.settings.getInt("trust.standardSlaHours") },
    };
  }

  private async find(key: string) {
    const item = (await this.collect()).find((i) => i.key === key);
    if (!item) throw new NotFoundApiException("Queue item");
    return item;
  }

  /** Claim (assign to me) or release a queue item. Report groups move together; cases and appeals use their own assignee field. */
  async setAssignee(admin: ResolvedAdminContext, key: string, claim: boolean, reason?: string) {
    const item = await this.find(key);
    if (claim && item.assignedAdminId && item.assignedAdminId !== admin.adminUserId) throw new ValidationApiException({ field: "key", reason: "ALREADY_CLAIMED", assignedAdminId: item.assignedAdminId });
    const assignee = claim ? admin.adminUserId : null;
    await this.prisma.$transaction(async (tx) => {
      if (item.kind === "REPORT") await tx.communityReport.updateMany({ where: { id: { in: item.itemIds }, status: CommunityReportStatus.OPEN }, data: { assignedAdminId: assignee, assignedAt: claim ? new Date() : null } });
      else if (item.kind === "PLACE_REPORT") await tx.placeReport.updateMany({ where: { id: { in: item.itemIds }, status: PlaceReportStatus.OPEN }, data: { assignedAdminId: assignee, assignedAt: claim ? new Date() : null } });
      else if (item.kind === "TRUST_CASE") await tx.trustCase.update({ where: { id: item.itemIds[0] }, data: { assignedAdminId: assignee } });
      else await tx.appeal.update({ where: { id: item.itemIds[0] }, data: { reviewerAdminId: assignee, ...(claim ? { status: AppealStatus.UNDER_REVIEW } : {}) } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: claim ? "trust_queue.claimed" : "trust_queue.released", entityType: "TRUST_QUEUE_ITEM", entityId: key.slice(0, 200), reason, afterSummary: { kind: item.kind, itemIds: item.itemIds, assignedAdminId: assignee }, tx });
    });
    return this.find(key).catch(() => ({ key, released: true }));
  }

  /** Dismiss every open report in one REPORT/PLACE_REPORT group at once (e.g. a brigade of duplicate spam reports). Audited. */
  async dismissGroup(admin: ResolvedAdminContext, key: string, reason: string) {
    const item = await this.find(key);
    if (item.kind !== "REPORT" && item.kind !== "PLACE_REPORT") throw new ValidationApiException({ field: "key", reason: "ONLY_REPORT_GROUPS" });
    const n = await this.prisma.$transaction(async (tx) => {
      const r = item.kind === "REPORT"
        ? await tx.communityReport.updateMany({ where: { id: { in: item.itemIds }, status: CommunityReportStatus.OPEN }, data: { status: CommunityReportStatus.DISMISSED } })
        : await tx.placeReport.updateMany({ where: { id: { in: item.itemIds }, status: PlaceReportStatus.OPEN }, data: { status: PlaceReportStatus.DISMISSED, resolvedByAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "trust_queue.bulk_dismissed", entityType: "TRUST_QUEUE_ITEM", entityId: key.slice(0, 200), reason, afterSummary: { kind: item.kind, dismissed: r.count, itemIds: item.itemIds }, tx });
      return r.count;
    });
    return { key, dismissed: n };
  }
}
