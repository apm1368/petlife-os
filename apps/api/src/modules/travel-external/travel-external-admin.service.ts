import { Inject, Injectable } from "@nestjs/common";
import { ExternalAutomationStatus, ExternalImagePolicy, ExternalMatchStatus, ExternalPublishState, ExternalSourceHealth, ExternalSourceMode, ExternalStayStatus, ExternalSyncKind, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { publishBlockers, TravelExternalService } from "./travel-external.service";
import { TRAVEL_SOURCE_ADAPTERS } from "./adapters/adapter-registry";
import type { TravelSourceAdapter } from "./adapters/travel-source-adapter";

export interface SourceConfigInput {
  syncIntervalMinutes?: number; priceTtlMinutes?: number; metadataTtlMinutes?: number; imagePolicy?: ExternalImagePolicy; maxRequestsPerRun?: number;
  timeoutMs?: number; retryCount?: number; cityScopes?: string[]; autoPublish?: boolean;
}

/** Staff control plane for external travel sources — configuration, runs, listing inspector, publication, matching. All mutations audited. */
@Injectable()
export class TravelExternalAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: TravelExternalService,
    private readonly audit: AdminAuditLogService,
    @Inject(TRAVEL_SOURCE_ADAPTERS) private readonly adapters: Map<string, TravelSourceAdapter>,
  ) {}

  async dashboard() {
    const [total, published, bySource, fresh, stale, failedRuns, removed, clicks] = await Promise.all([
      this.prisma.externalStay.count(),
      this.prisma.externalStay.count({ where: { publishState: ExternalPublishState.PUBLISHED, status: { in: [ExternalStayStatus.ACTIVE, ExternalStayStatus.STALE] } } }),
      this.prisma.externalStay.groupBy({ by: ["sourceId", "publishState"], _count: { _all: true } }),
      this.prisma.externalStayPriceSnapshot.count({ where: { expiresAt: { gt: new Date() } } }),
      this.prisma.externalStayPriceSnapshot.count({ where: { expiresAt: { lte: new Date() } } }),
      this.prisma.externalSyncRun.count({ where: { status: { in: ["FAILED", "ABANDONED"] }, startedAt: { gte: new Date(Date.now() - 7 * 86400e3) } } }),
      this.prisma.externalStay.count({ where: { status: ExternalStayStatus.SOURCE_REMOVED } }),
      this.prisma.outboundTravelClick.count(),
    ]);
    const sources = await this.prisma.externalTravelSource.findMany({ select: { id: true, code: true } });
    return {
      totalExternalListings: total, petFriendlyPublished: published,
      bySource: sources.map((s) => ({ code: s.code, total: bySource.filter((b) => b.sourceId === s.id).reduce((n, b) => n + b._count._all, 0), published: bySource.find((b) => b.sourceId === s.id && b.publishState === "PUBLISHED")?._count._all ?? 0 })),
      freshPriceSnapshots: fresh, stalePriceSnapshots: stale, failedSyncsLast7Days: failedRuns, sourceRemoved: removed, outboundClicks: clicks, conversion: "UNKNOWN",
    };
  }

  async sources() {
    const rows = await this.prisma.externalTravelSource.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { stays: true } } } });
    return Promise.all(rows.map((s) => this.sourceView(s)));
  }

  private async sourceView(s: Prisma.ExternalTravelSourceGetPayload<{ include: { _count: { select: { stays: true } } } }>) {
    const lastRun = await this.prisma.externalSyncRun.findFirst({ where: { sourceId: s.id }, orderBy: { startedAt: "desc" } });
    const next = s.mode === ExternalSourceMode.AUTOMATED && s.lastRunAt ? new Date(Math.max(s.lastRunAt.getTime() + s.syncIntervalMinutes * 60e3, s.circuitOpenUntil?.getTime() ?? 0)).toISOString() : null;
    return {
      code: s.code, nameFa: s.nameFa, nameEn: s.nameEn, allowedHosts: s.allowedHosts, mode: s.mode, automationStatus: s.automationStatus, health: s.health, healthReason: s.healthReason, discoveryNotes: s.discoveryNotes,
      config: { syncIntervalMinutes: s.syncIntervalMinutes, priceTtlMinutes: s.priceTtlMinutes, metadataTtlMinutes: s.metadataTtlMinutes, imagePolicy: s.imagePolicy, maxRequestsPerRun: s.maxRequestsPerRun, timeoutMs: s.timeoutMs, retryCount: s.retryCount, cityScopes: s.cityScopes, autoPublish: s.autoPublish },
      affiliate: { active: s.affiliateActive, configured: Boolean(s.affiliateId || s.trackingTemplate) },
      lastRunAt: s.lastRunAt?.toISOString() ?? null, lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null, lastFailureAt: s.lastFailureAt?.toISOString() ?? null, lastErrorCategory: s.lastErrorCategory,
      circuitOpenUntil: s.circuitOpenUntil?.toISOString() ?? null, consecutiveFailures: s.consecutiveFailures, nextRunAt: next,
      lastRun: lastRun ? { id: lastRun.id, kind: lastRun.kind, status: lastRun.status, itemsScanned: lastRun.itemsScanned, created: lastRun.created, updated: lastRun.updated, failed: lastRun.failed, startedAt: lastRun.startedAt.toISOString() } : null,
      listingCount: s._count.stays,
    };
  }

  async sourceDetail(code: string) {
    const s = await this.prisma.externalTravelSource.findUnique({ where: { code }, include: { _count: { select: { stays: true } } } });
    if (!s) throw new NotFoundApiException("Travel source");
    const [statuses, runs] = await Promise.all([
      this.prisma.externalStay.groupBy({ by: ["status", "publishState"], where: { sourceId: s.id }, _count: { _all: true } }),
      this.prisma.externalSyncRun.findMany({ where: { sourceId: s.id }, orderBy: { startedAt: "desc" }, take: 20 }),
    ]);
    return { ...(await this.sourceView(s)), listings: statuses.map((x) => ({ status: x.status, publishState: x.publishState, count: x._count._all })), runs };
  }

  async updateConfig(admin: ResolvedAdminContext, code: string, input: SourceConfigInput, reason: string) {
    const s = await this.core.source(code);
    const data: Prisma.ExternalTravelSourceUpdateInput = { ...input };
    const updated = await this.prisma.externalTravelSource.update({ where: { id: s.id }, data });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_source.config_changed", entityType: "EXTERNAL_TRAVEL_SOURCE", entityId: code, reason, beforeSummary: { syncIntervalMinutes: s.syncIntervalMinutes, priceTtlMinutes: s.priceTtlMinutes, cityScopes: s.cityScopes, autoPublish: s.autoPublish, imagePolicy: s.imagePolicy }, afterSummary: input as Record<string, unknown> });
    return this.sourceDetail(updated.code);
  }

  /** Pause = mode DISABLED (nothing runs, published listings stay with their freshness labels). Resume picks MANUAL unless automation is SUPPORTED. */
  async setPaused(admin: ResolvedAdminContext, code: string, paused: boolean, reason: string) {
    const s = await this.core.source(code);
    const mode = paused ? ExternalSourceMode.DISABLED : s.automationStatus === ExternalAutomationStatus.SUPPORTED ? ExternalSourceMode.AUTOMATED : ExternalSourceMode.MANUAL;
    if (s.mode === mode) throw new ValidationApiException({ field: "mode", reason: "UNCHANGED" });
    await this.prisma.externalTravelSource.update({ where: { id: s.id }, data: { mode, health: paused ? ExternalSourceHealth.DISABLED : s.automationStatus === ExternalAutomationStatus.BLOCKED_EXTERNAL ? ExternalSourceHealth.BLOCKED : ExternalSourceHealth.DEGRADED, ...(paused ? {} : { circuitOpenUntil: null, consecutiveFailures: 0 }) } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: paused ? "travel_source.paused" : "travel_source.resumed", entityType: "EXTERNAL_TRAVEL_SOURCE", entityId: code, reason, afterSummary: { mode } });
    return this.sourceDetail(code);
  }

  /** Re-checks compliant access with one robots.txt request; automation can only be SUPPORTED once an adapter implements retrieval. */
  async probe(admin: ResolvedAdminContext, code: string) {
    const s = await this.core.source(code);
    const adapter = this.adapters.get(code);
    if (!adapter) throw new ValidationApiException({ field: "code", reason: "NO_ADAPTER" });
    const r = await adapter.probe(s.allowedHosts, s.timeoutMs);
    const notes = { ...((s.discoveryNotes as Record<string, unknown> | null) ?? {}), lastProbe: { at: new Date().toISOString(), ok: r.ok, category: r.category ?? null, detail: r.detail } };
    await this.prisma.externalTravelSource.update({ where: { id: s.id }, data: { discoveryNotes: notes as Prisma.InputJsonValue, ...(r.ok ? {} : { automationStatus: r.category === "BLOCKED_EXTERNAL" ? ExternalAutomationStatus.BLOCKED_EXTERNAL : s.automationStatus, health: r.category === "BLOCKED_EXTERNAL" ? ExternalSourceHealth.BLOCKED : s.health, healthReason: r.detail }) } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_source.probed", entityType: "EXTERNAL_TRAVEL_SOURCE", entityId: code, afterSummary: { ok: r.ok, category: r.category ?? null } });
    return r;
  }

  async run(admin: ResolvedAdminContext, code: string, kind: ExternalSyncKind, listingId?: string) {
    const run = await this.core.runSync(code, kind, { adminUserId: admin.adminUserId, listingId });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_source.sync_run", entityType: "EXTERNAL_TRAVEL_SOURCE", entityId: code, afterSummary: { runId: run.id, kind, status: run.status } });
    return run;
  }

  async runs(q: { source?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalSyncRunWhereInput = q.source ? { source: { code: q.source } } : {};
    const [rows, total] = await Promise.all([this.prisma.externalSyncRun.findMany({ where, orderBy: { startedAt: "desc" }, skip, take, include: { source: { select: { code: true } } } }), this.prisma.externalSyncRun.count({ where })]);
    return toPaginatedDto(rows, total, page, pageSize);
  }

  async listings(q: { source?: string; status?: ExternalStayStatus; publishState?: ExternalPublishState; city?: string; q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalStayWhereInput = { ...(q.source ? { source: { code: q.source } } : {}), ...(q.status ? { status: q.status } : {}), ...(q.publishState ? { publishState: q.publishState } : {}), ...(q.city ? { city: q.city } : {}), ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}) };
    const [rows, total] = await Promise.all([this.prisma.externalStay.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take, include: { source: { select: { code: true } } } }), this.prisma.externalStay.count({ where })]);
    return toPaginatedDto(rows.map((r) => ({ id: r.id, source: r.source.code, title: r.title, city: r.city, status: r.status, publishState: r.publishState, entryMode: r.entryMode, petEvidenceType: r.petEvidenceType, lastCheckedAt: r.lastCheckedAt.toISOString(), hasOverrides: Boolean(r.overrides && Object.keys(r.overrides as object).length) })), total, page, pageSize);
  }

  async inspect(id: string) {
    const s = await this.prisma.externalStay.findUnique({ where: { id }, include: { source: true, images: { orderBy: { position: "asc" } }, prices: { orderBy: { observedAt: "desc" }, take: 60 }, changes: { orderBy: { createdAt: "desc" }, take: 50 }, _count: { select: { clicks: true, favorites: true, trips: true } } } });
    if (!s) throw new NotFoundApiException("External stay");
    const runs = await this.prisma.externalSyncRun.findMany({ where: { sourceId: s.sourceId, status: { in: ["FAILED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, take: 5, select: { id: true, status: true, startedAt: true, errorCategories: true } });
    const matches = await this.prisma.externalStayMatchCandidate.findMany({ where: { OR: [{ stayAId: id }, { stayBId: id }] } });
    return {
      normalized: { id: s.id, title: s.title, city: s.city, province: s.province, area: s.area, stayType: s.stayType, capacity: s.capacity, bedrooms: s.bedrooms, beds: s.beds, latitude: s.latitude, longitude: s.longitude, rating: s.rating, reviewCount: s.reviewCount, instantBooking: s.instantBooking, descriptionSummary: s.descriptionSummary, status: s.status, publishState: s.publishState, entryMode: s.entryMode, createdByAdminId: s.createdByAdminId },
      source: { code: s.source.code, sourceListingId: s.sourceListingId, sourceUrl: s.sourceUrl, lastSourceUpdateAt: s.lastSourceUpdateAt?.toISOString() ?? null, lastCheckedAt: s.lastCheckedAt.toISOString(), lastSuccessfulSyncAt: s.lastSuccessfulSyncAt?.toISOString() ?? null },
      petEvidence: { type: s.petEvidenceType, text: s.petEvidenceText, observedAt: s.petEvidenceObservedAt.toISOString(), policy: s.petPolicy, summary: s.petPolicySummary },
      overrides: s.overrides ?? {},
      images: s.images.map((i) => ({ position: i.position, sourceImageUrl: i.sourceImageUrl, lastVerifiedAt: i.lastVerifiedAt.toISOString() })),
      priceHistory: s.prices.map((p) => ({ id: p.id, checkIn: p.checkIn.toISOString().slice(0, 10), checkOut: p.checkOut.toISOString().slice(0, 10), guests: p.guests, priceIrr: p.priceIrr, oldPriceIrr: p.oldPriceIrr, discountPercent: p.discountPercent, priceBasis: p.priceBasis, availability: p.availability, observedAt: p.observedAt.toISOString(), lastConfirmedAt: p.lastConfirmedAt.toISOString(), expiresAt: p.expiresAt.toISOString(), observedBy: p.observedBy })),
      changes: s.changes.map((c) => ({ kind: c.kind, detail: c.detail, at: c.createdAt.toISOString() })),
      recentSourceErrors: runs,
      matchCandidates: matches,
      publishBlockers: publishBlockers(s, s.source),
      engagement: { outboundClicks: s._count.clicks, favorites: s._count.favorites, tripAttachments: s._count.trips },
    };
  }

  async setVisibility(admin: ResolvedAdminContext, id: string, action: "hide" | "unhide" | "publish" | "unpublish", reason: string) {
    const s = await this.prisma.externalStay.findUnique({ where: { id }, include: { source: true } });
    if (!s) throw new NotFoundApiException("External stay");
    const data: Prisma.ExternalStayUpdateInput =
      action === "hide" ? { status: ExternalStayStatus.HIDDEN }
      : action === "unhide" ? { status: ExternalStayStatus.ACTIVE }
      : action === "publish" ? { publishState: ExternalPublishState.PUBLISHED }
      : { publishState: ExternalPublishState.DRAFT };
    if (action === "publish") {
      const blockers = publishBlockers(s, s.source);
      if (blockers.length) throw new ValidationApiException({ field: "publishState", reason: "NOT_PUBLISHABLE", blockers });
      if (s.status === ExternalStayStatus.SOURCE_REMOVED || s.status === ExternalStayStatus.HIDDEN) throw new ValidationApiException({ field: "status", reason: "NOT_PUBLISHABLE", status: s.status });
    }
    if (action === "unhide" && s.status !== ExternalStayStatus.HIDDEN) throw new ValidationApiException({ field: "status", reason: "NOT_HIDDEN" });
    await this.prisma.externalStay.update({ where: { id }, data });
    if (action === "hide" || action === "unhide") await this.prisma.externalStayChange.create({ data: { stayId: id, kind: action === "hide" ? "HIDDEN" : "UNHIDDEN", detail: { reason } } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: `travel_listing.${action}` as never, entityType: "EXTERNAL_STAY", entityId: id, reason });
    return this.inspect(id);
  }

  async reviewMatch(admin: ResolvedAdminContext, candidateId: string, approve: boolean) {
    const c = await this.prisma.externalStayMatchCandidate.findUnique({ where: { id: candidateId } });
    if (!c) throw new NotFoundApiException("Match candidate");
    if (c.status !== ExternalMatchStatus.PENDING) throw new ValidationApiException({ field: "status", reason: "ALREADY_REVIEWED" });
    await this.prisma.$transaction(async (tx) => {
      await tx.externalStayMatchCandidate.update({ where: { id: candidateId }, data: { status: approve ? ExternalMatchStatus.APPROVED : ExternalMatchStatus.REJECTED, reviewedByAdminId: admin.adminUserId, reviewedAt: new Date() } });
      if (approve) {
        const [a, b] = await Promise.all([tx.externalStay.findUniqueOrThrow({ where: { id: c.stayAId } }), tx.externalStay.findUniqueOrThrow({ where: { id: c.stayBId } })]);
        const group = a.propertyGroupId ?? b.propertyGroupId ?? randomUUID();
        await tx.externalStay.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { propertyGroupId: group } });
      }
      await this.audit.record({ adminUserId: admin.adminUserId, action: approve ? "travel_listing.match_approved" : "travel_listing.match_rejected", entityType: "EXTERNAL_STAY_MATCH", entityId: candidateId, afterSummary: { stayAId: c.stayAId, stayBId: c.stayBId }, tx });
    });
    return { id: candidateId, status: approve ? "APPROVED" : "REJECTED" };
  }

  async manualUpsert(admin: ResolvedAdminContext, input: Parameters<TravelExternalService["manualUpsert"]>[1]) {
    const r = await this.core.manualUpsert(admin.adminUserId, input);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_listing.manual_upsert", entityType: "EXTERNAL_STAY", entityId: r.stayId, afterSummary: { result: r.result, sourceCode: input.sourceCode, petEvidenceType: input.petEvidenceType } });
    return r;
  }

  async setOverride(admin: ResolvedAdminContext, id: string, field: Parameters<TravelExternalService["setOverride"]>[2], value: string | null) {
    const r = await this.core.setOverride(admin.adminUserId, id, field, value);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_listing.override_set", entityType: "EXTERNAL_STAY", entityId: id, afterSummary: { field, cleared: value === null } });
    return r;
  }

  async recordPrice(admin: ResolvedAdminContext, id: string, ctx: { checkIn: string; checkOut: string; guests: number; pets?: number }, q: Parameters<TravelExternalService["recordPrice"]>[2], observedAt: Date) {
    const stay = await this.prisma.externalStay.findUnique({ where: { id }, include: { source: true } });
    if (!stay) throw new NotFoundApiException("External stay");
    if (ctx.checkOut <= ctx.checkIn) throw new ValidationApiException({ field: "checkOut", reason: "INVALID_DATE_RANGE" });
    const row = await this.core.recordPrice(stay, ctx, q, { observedBy: "ADMIN", adminUserId: admin.adminUserId, observedAt: observedAt > new Date() ? new Date() : observedAt });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_listing.price_recorded", entityType: "EXTERNAL_STAY", entityId: id, afterSummary: { checkIn: ctx.checkIn, checkOut: ctx.checkOut, guests: ctx.guests, priceIrr: q.priceIrr, availability: q.availability } });
    return row;
  }

  async matchCandidates(status: ExternalMatchStatus = ExternalMatchStatus.PENDING) {
    return this.prisma.externalStayMatchCandidate.findMany({ where: { status }, orderBy: { score: "desc" }, take: 100 });
  }
}
