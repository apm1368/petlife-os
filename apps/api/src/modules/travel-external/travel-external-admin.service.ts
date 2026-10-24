import { Inject, Injectable } from "@nestjs/common";
import { AdminTaskSource, AdminTaskStatus, ExternalAutomationStatus, ExternalChangeKind, ExternalImagePolicy, ExternalMatchStatus, ExternalPublishState, ExternalSourceHealth, ExternalSourceMode, ExternalStayStatus, ExternalSyncKind, ExternalSyncStatus, ExternalSyncTrigger, PetPolicyStatus, Prisma, type ExternalTravelSource } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { effectivePetPolicy, publishBlockers, TravelExternalService } from "./travel-external.service";
import { freshnessOf } from "./scrape/freshness";
import { TRAVEL_SOURCE_ADAPTERS } from "./adapters/adapter-registry";
import type { TravelSourceAdapter } from "./adapters/travel-source-adapter";

export interface SourceConfigInput {
  syncIntervalMinutes?: number; priceTtlMinutes?: number; metadataTtlMinutes?: number; imagePolicy?: ExternalImagePolicy; maxRequestsPerRun?: number;
  timeoutMs?: number; retryCount?: number; cityScopes?: string[]; autoPublish?: boolean;
  requestDelayMinMs?: number; requestDelayMaxMs?: number; priceFreshHours?: number; priceAgingHours?: number; staleAfterMissedRuns?: number; removeAfterMissedRuns?: number; rawRetentionDays?: number;
}

/** One operational status per source for the ERP (derived; the stored fields stay the source of truth). */
export function sourceStatus(s: Pick<ExternalTravelSource, "mode" | "automationStatus" | "health" | "lastRunStatus" | "circuitOpenUntil">): "ACTIVE" | "PAUSED" | "BLOCKED" | "DEGRADED" | "ERROR" | "NOT_SUPPORTED" {
  if (s.mode === ExternalSourceMode.DISABLED) return "PAUSED";
  if (s.health === ExternalSourceHealth.BLOCKED || s.automationStatus === ExternalAutomationStatus.BLOCKED_EXTERNAL) return "BLOCKED";
  if (s.mode !== ExternalSourceMode.AUTOMATED || s.automationStatus !== ExternalAutomationStatus.SUPPORTED) return "NOT_SUPPORTED";
  if (s.lastRunStatus === ExternalSyncStatus.FAILED || s.lastRunStatus === ExternalSyncStatus.ABANDONED) return "ERROR";
  if (s.health === ExternalSourceHealth.DEGRADED || (s.circuitOpenUntil && s.circuitOpenUntil > new Date())) return "DEGRADED";
  return "ACTIVE";
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
    const adapter = this.adapters.get(s.code);
    return {
      code: s.code, nameFa: s.nameFa, nameEn: s.nameEn, allowedHosts: s.allowedHosts, mode: s.mode, automationStatus: s.automationStatus, health: s.health, healthReason: s.healthReason, discoveryNotes: s.discoveryNotes,
      status: sourceStatus(s), sourceType: s.sourceType, accessStatus: s.accessStatus, partnership: "NONE", affiliateStatus: s.affiliateActive ? "CONFIGURED" : "NONE",
      adapter: adapter ? { strategy: adapter.strategy, parserReady: adapter.parserReady } : null,
      robots: { checkedAt: s.robotsCheckedAt?.toISOString() ?? null, result: s.robotsResult }, terms: { checkedAt: s.termsCheckedAt?.toISOString() ?? null, url: s.termsUrl },
      lastRunStatus: s.lastRunStatus, lastError: s.lastError, lastListingsSeen: s.lastListingsSeen, lastDurationMs: s.lastDurationMs,
      config: { syncIntervalMinutes: s.syncIntervalMinutes, priceTtlMinutes: s.priceTtlMinutes, metadataTtlMinutes: s.metadataTtlMinutes, imagePolicy: s.imagePolicy, maxRequestsPerRun: s.maxRequestsPerRun, timeoutMs: s.timeoutMs, retryCount: s.retryCount, cityScopes: s.cityScopes, autoPublish: s.autoPublish, requestDelayMinMs: s.requestDelayMinMs, requestDelayMaxMs: s.requestDelayMaxMs, concurrency: 1, priceFreshHours: s.priceFreshHours, priceAgingHours: s.priceAgingHours, staleAfterMissedRuns: s.staleAfterMissedRuns, removeAfterMissedRuns: s.removeAfterMissedRuns, anomalyDropRatio: s.anomalyDropRatio, rawRetentionDays: s.rawRetentionDays },
      affiliate: { active: s.affiliateActive, configured: Boolean(s.affiliateId || s.trackingTemplate) },
      lastRunAt: s.lastRunAt?.toISOString() ?? null, lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null, lastFailureAt: s.lastFailureAt?.toISOString() ?? null, lastErrorCategory: s.lastErrorCategory,
      circuitOpenUntil: s.circuitOpenUntil?.toISOString() ?? null, consecutiveFailures: s.consecutiveFailures, nextRunAt: next,
      lastRun: lastRun ? { id: lastRun.id, kind: lastRun.kind, trigger: lastRun.trigger, status: lastRun.status, itemsScanned: lastRun.itemsScanned, listingsDiscovered: lastRun.listingsDiscovered, created: lastRun.created, updated: lastRun.updated, unchanged: lastRun.unchanged, failed: lastRun.failed, removed: lastRun.removed, anomaly: lastRun.anomaly, startedAt: lastRun.startedAt.toISOString(), durationMs: lastRun.durationMs } : null,
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
    if ((input.requestDelayMinMs ?? s.requestDelayMinMs) > (input.requestDelayMaxMs ?? s.requestDelayMaxMs)) throw new ValidationApiException({ field: "requestDelayMaxMs", reason: "MAX_BELOW_MIN" });
    if ((input.staleAfterMissedRuns ?? s.staleAfterMissedRuns) >= (input.removeAfterMissedRuns ?? s.removeAfterMissedRuns)) throw new ValidationApiException({ field: "removeAfterMissedRuns", reason: "MUST_EXCEED_STALE_THRESHOLD" });
    if ((input.priceFreshHours ?? s.priceFreshHours) > (input.priceAgingHours ?? s.priceAgingHours)) throw new ValidationApiException({ field: "priceAgingHours", reason: "MUST_BE_AT_LEAST_FRESH" });
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

  /** Low-frequency source health check (one or two requests, through the same paced, SSRF-safe client). */
  async probe(admin: ResolvedAdminContext, code: string) {
    const r = await this.core.healthCheck(code);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_source.probed", entityType: "EXTERNAL_TRAVEL_SOURCE", entityId: code, afterSummary: { ok: r.ok, category: r.category ?? null, schemaOk: r.schemaOk ?? null } });
    return r;
  }

  async run(admin: ResolvedAdminContext, code: string, kind: ExternalSyncKind, listingId?: string) {
    const run = await this.core.runSync(code, kind, { adminUserId: admin.adminUserId, listingId, trigger: ExternalSyncTrigger.MANUAL });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_source.sync_run", entityType: "EXTERNAL_TRAVEL_SOURCE", entityId: code, afterSummary: { runId: run.id, kind, status: run.status } });
    return run;
  }

  async retryListing(admin: ResolvedAdminContext, id: string) {
    const s = await this.prisma.externalStay.findUnique({ where: { id }, include: { source: { select: { code: true } } } });
    if (!s) throw new NotFoundApiException("External stay");
    const run = await this.core.runSync(s.source.code, ExternalSyncKind.LISTING, { adminUserId: admin.adminUserId, listingId: id, trigger: ExternalSyncTrigger.RETRY });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_source.sync_run", entityType: "EXTERNAL_STAY", entityId: id, afterSummary: { runId: run.id, kind: "LISTING", status: run.status } });
    return run;
  }

  async runDetail(id: string) {
    const r = await this.prisma.externalSyncRun.findUnique({ where: { id }, include: { source: { select: { code: true, nameFa: true } } } });
    if (!r) throw new NotFoundApiException("Sync run");
    const changes = await this.prisma.externalStayChange.groupBy({ by: ["kind"], where: { runId: id }, _count: { _all: true } });
    return { ...r, changesByKind: Object.fromEntries(changes.map((c) => [c.kind, c._count._all])) };
  }

  /** Per source: last runs' discovered counts vs baseline, failure/anomaly rates — degradation shows before inventory suffers. */
  async parserHealth() {
    const sources = await this.prisma.externalTravelSource.findMany({ orderBy: { code: "asc" } });
    return Promise.all(sources.map(async (s) => {
      const runs = await this.prisma.externalSyncRun.findMany({ where: { sourceId: s.id, kind: { in: [ExternalSyncKind.FULL, ExternalSyncKind.DISCOVERY] } }, orderBy: { startedAt: "desc" }, take: 14, select: { id: true, status: true, startedAt: true, listingsDiscovered: true, failed: true, itemsScanned: true, anomaly: true, errorCategories: true } });
      const healthy = runs.filter((r) => r.status === ExternalSyncStatus.SUCCEEDED && !r.anomaly).map((r) => r.listingsDiscovered).sort((a, b) => a - b);
      const adapter = this.adapters.get(s.code);
      return {
        code: s.code, status: sourceStatus(s), parserReady: adapter?.parserReady ?? false, strategy: adapter?.strategy ?? null,
        baselineListings: healthy.length ? healthy[Math.floor(healthy.length / 2)] : null,
        lastDiscovered: runs[0]?.listingsDiscovered ?? null,
        anomalyRuns: runs.filter((r) => r.anomaly).length,
        itemFailureRate: runs.reduce((n, r) => n + r.itemsScanned, 0) ? Math.round((runs.reduce((n, r) => n + r.failed, 0) / runs.reduce((n, r) => n + r.itemsScanned, 0)) * 1000) / 10 : null,
        runFailureRate: runs.length ? Math.round((runs.filter((r) => r.status === ExternalSyncStatus.FAILED).length / runs.length) * 1000) / 10 : null,
        lastHealthCheck: ((s.discoveryNotes as Record<string, unknown> | null) ?? {}).lastHealthCheck ?? null,
        recentRuns: runs,
      };
    }));
  }

  /** Individual failures across runs (newest first), flattened from each run's bounded error list. */
  async errors(q: { source?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalSyncRunWhereInput = { ...(q.source ? { source: { code: q.source } } : {}), OR: [{ status: { in: [ExternalSyncStatus.FAILED, ExternalSyncStatus.PARTIAL, ExternalSyncStatus.ABANDONED] } }, { failed: { gt: 0 } }] };
    const [rows, total] = await Promise.all([this.prisma.externalSyncRun.findMany({ where, orderBy: { startedAt: "desc" }, skip, take, include: { source: { select: { code: true } } } }), this.prisma.externalSyncRun.count({ where })]);
    return toPaginatedDto(rows.map((r) => ({ runId: r.id, source: r.source.code, kind: r.kind, status: r.status, startedAt: r.startedAt.toISOString(), categories: r.errorCategories, errors: r.errors ?? [] })), total, page, pageSize);
  }

  /** Pet-policy evidence queue: what each claim rests on, source vs staff, newest first. */
  async petEvidence(q: { status?: PetPolicyStatus; source?: string; unreviewedOnly?: boolean; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalPetPolicyEvidenceWhereInput = { ...(q.status ? { status: q.status } : {}), stay: { ...(q.source ? { source: { code: q.source } } : {}), ...(q.unreviewedOnly ? { adminPetPolicyStatus: null } : {}) } };
    const [rows, total] = await Promise.all([this.prisma.externalPetPolicyEvidence.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { stay: { select: { id: true, title: true, city: true, petPolicyStatus: true, adminPetPolicyStatus: true, source: { select: { code: true } } } } } }), this.prisma.externalPetPolicyEvidence.count({ where })]);
    return toPaginatedDto(rows.map((e) => ({ id: e.id, stay: { id: e.stay.id, title: e.stay.title, city: e.stay.city, source: e.stay.source.code, sourceObservation: e.stay.petPolicyStatus, adminConfirmed: e.stay.adminPetPolicyStatus, effective: effectivePetPolicy(e.stay) }, status: e.status, authority: e.authority, evidenceSource: e.evidenceSource, evidenceUrl: e.evidenceUrl, evidenceText: e.evidenceText, evidencePath: e.evidencePath, fields: { dogsAllowed: e.dogsAllowed, catsAllowed: e.catsAllowed, otherPetsAllowed: e.otherPetsAllowed, maxPets: e.maxPets, maxWeightKg: e.maxWeightKg, petFeeIrr: e.petFeeIrr, depositIrr: e.depositIrr, restrictions: e.restrictions, allowedAreas: e.allowedAreas }, observedAt: e.evidenceObservedAt.toISOString(), lastConfirmedAt: e.lastConfirmedAt.toISOString() })), total, page, pageSize);
  }

  async reviewPetPolicy(admin: ResolvedAdminContext, id: string, status: PetPolicyStatus | null, note: string) {
    const r = await this.core.reviewPetPolicy(admin.adminUserId, id, status, note);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_listing.pet_policy_reviewed", entityType: "EXTERNAL_STAY", entityId: id, reason: note, beforeSummary: { sourceObservation: r.sourceObservation }, afterSummary: { adminConfirmed: status, effective: r.effective } });
    return r;
  }

  /** Daily diff report (UTC day): new, removed, stale, price and pet-policy changes, listing failures, source errors. */
  async dailyDiff(q: { date?: string; source?: string }) {
    const day = q.date ? new Date(`${q.date}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const range = { gte: day, lt: new Date(day.getTime() + 86400e3) };
    const stayWhere: Prisma.ExternalStayWhereInput = q.source ? { source: { code: q.source } } : {};
    const changes = await this.prisma.externalStayChange.findMany({ where: { createdAt: range, stay: stayWhere }, orderBy: { createdAt: "asc" }, take: 2000, include: { stay: { select: { id: true, title: true, city: true, source: { select: { code: true } } } } } });
    const pick = (...k: ExternalChangeKind[]) => changes.filter((c) => k.includes(c.kind)).map((c) => ({ stayId: c.stay.id, title: c.stay.title, city: c.stay.city, source: c.stay.source.code, kind: c.kind, field: c.field, oldValue: c.oldValue, newValue: c.newValue, runId: c.runId, at: c.createdAt.toISOString() }));
    const runs = await this.prisma.externalSyncRun.findMany({ where: { startedAt: range, ...(q.source ? { source: { code: q.source } } : {}) }, orderBy: { startedAt: "asc" }, include: { source: { select: { code: true } } } });
    const staleNow = await this.prisma.externalStay.count({ where: { ...stayWhere, status: ExternalStayStatus.STALE } });
    return {
      date: day.toISOString().slice(0, 10),
      newListings: pick(ExternalChangeKind.CREATED),
      removedListings: pick(ExternalChangeKind.SOURCE_REMOVED),
      markedStale: pick(ExternalChangeKind.STALE),
      reappeared: pick(ExternalChangeKind.REAPPEARED),
      priceChanges: pick(ExternalChangeKind.PRICE_CHANGED),
      petPolicyChanges: pick(ExternalChangeKind.PET_POLICY_CHANGED, ExternalChangeKind.PET_POLICY_CONFLICT, ExternalChangeKind.PET_POLICY_REVIEWED),
      fieldChanges: pick(ExternalChangeKind.FIELD_CHANGED, ExternalChangeKind.IMAGE_CHANGED, ExternalChangeKind.URL_CHANGED).length,
      listingFailures: runs.reduce((n, r) => n + r.failed, 0),
      sourceErrors: runs.filter((r) => r.status !== ExternalSyncStatus.SUCCEEDED).map((r) => ({ runId: r.id, source: r.source.code, status: r.status, categories: r.errorCategories, anomaly: r.anomaly, at: r.startedAt.toISOString() })),
      runs: runs.map((r) => ({ id: r.id, source: r.source.code, kind: r.kind, trigger: r.trigger, status: r.status, discovered: r.listingsDiscovered, created: r.created, updated: r.updated, unchanged: r.unchanged, failed: r.failed, removed: r.removed, durationMs: r.durationMs })),
      staleListingsNow: staleNow,
    };
  }

  /** Scraper analytics: per source inventory, policy coverage, price coverage/freshness, error and block rates. */
  async metrics() {
    const sources = await this.prisma.externalTravelSource.findMany({ orderBy: { code: "asc" } });
    const since = new Date(Date.now() - 7 * 86400e3);
    return Promise.all(sources.map(async (s) => {
      const where = { sourceId: s.id, status: { in: [ExternalStayStatus.DISCOVERED, ExternalStayStatus.ACTIVE, ExternalStayStatus.STALE] } };
      const [total, byPolicy, priced, prices, newDay, changesDay, runs] = await Promise.all([
        this.prisma.externalStay.count({ where }),
        this.prisma.externalStay.groupBy({ by: ["petPolicyStatus", "adminPetPolicyStatus"], where, _count: { _all: true } }),
        this.prisma.externalStay.count({ where: { ...where, prices: { some: { priceIrr: { not: null } } } } }),
        this.prisma.externalStayPriceSnapshot.findMany({ where: { stay: { sourceId: s.id } }, select: { lastConfirmedAt: true }, orderBy: { lastConfirmedAt: "desc" }, take: 5000 }),
        this.prisma.externalStayChange.count({ where: { kind: ExternalChangeKind.CREATED, createdAt: { gte: new Date(Date.now() - 86400e3) }, stay: { sourceId: s.id } } }),
        this.prisma.externalStayChange.count({ where: { createdAt: { gte: new Date(Date.now() - 86400e3) }, stay: { sourceId: s.id } } }),
        this.prisma.externalSyncRun.findMany({ where: { sourceId: s.id, startedAt: { gte: since } }, select: { status: true, errorCategories: true } }),
      ]);
      const eff: Record<string, number> = {};
      for (const g of byPolicy) { const k = g.adminPetPolicyStatus ?? g.petPolicyStatus; eff[k] = (eff[k] ?? 0) + g._count._all; }
      const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : null);
      const fresh: Record<string, number> = { FRESH: 0, AGING: 0, STALE: 0 };
      for (const p of prices) fresh[freshnessOf(p.lastConfirmedAt, s)]! += 1;
      const blocked = runs.filter((r) => Object.keys((r.errorCategories as Record<string, number> | null) ?? {}).some((k) => k === "BLOCKED_EXTERNAL" || k === "RATE_LIMITED")).length;
      return {
        code: s.code, status: sourceStatus(s), listings: total, newLast24h: newDay, changesLast24h: changesDay,
        petPolicy: { confirmedAllowed: eff.CONFIRMED_ALLOWED ?? 0, confirmedNotAllowed: eff.CONFIRMED_NOT_ALLOWED ?? 0, ambiguous: eff.AMBIGUOUS ?? 0, unknown: eff.UNKNOWN ?? 0, petQualifiedPercent: pct(eff.CONFIRMED_ALLOWED ?? 0), unknownPercent: pct(eff.UNKNOWN ?? 0) },
        priceCoveragePercent: pct(priced),
        priceFreshness: fresh,
        runsLast7d: runs.length,
        errorRatePercent: runs.length ? Math.round((runs.filter((r) => r.status === ExternalSyncStatus.FAILED || r.status === ExternalSyncStatus.ABANDONED).length / runs.length) * 1000) / 10 : null,
        blockRatePercent: runs.length ? Math.round((blocked / runs.length) * 1000) / 10 : null,
      };
    }));
  }

  /** Open admin tasks raised by the travel engine (blocked source, parser anomaly, pet-policy conflict, duplicates, repeated failure). */
  sourceTasks() {
    return this.prisma.adminTask.findMany({ where: { source: AdminTaskSource.TRAVEL_SOURCE, status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async canonical(id: string) {
    const c = await this.prisma.canonicalAccommodation.findUnique({ where: { id }, include: { listings: { include: { source: { select: { code: true } } } } } });
    if (!c) throw new NotFoundApiException("Canonical accommodation");
    return { ...c, listings: c.listings.map((l) => ({ id: l.id, source: l.source.code, title: l.title, sourceUrl: l.sourceUrl, status: l.status, publishState: l.publishState, petPolicy: effectivePetPolicy(l) })) };
  }

  async runs(q: { source?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalSyncRunWhereInput = q.source ? { source: { code: q.source } } : {};
    const [rows, total] = await Promise.all([this.prisma.externalSyncRun.findMany({ where, orderBy: { startedAt: "desc" }, skip, take, include: { source: { select: { code: true } } } }), this.prisma.externalSyncRun.count({ where })]);
    return toPaginatedDto(rows, total, page, pageSize);
  }

  async listings(q: { source?: string; status?: ExternalStayStatus; publishState?: ExternalPublishState; petPolicyStatus?: PetPolicyStatus; city?: string; q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalStayWhereInput = { ...(q.source ? { source: { code: q.source } } : {}), ...(q.status ? { status: q.status } : {}), ...(q.publishState ? { publishState: q.publishState } : {}), ...(q.petPolicyStatus ? { OR: [{ adminPetPolicyStatus: q.petPolicyStatus }, { adminPetPolicyStatus: null, petPolicyStatus: q.petPolicyStatus }] } : {}), ...(q.city ? { city: q.city } : {}), ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}) };
    const [rows, total] = await Promise.all([this.prisma.externalStay.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take, include: { source: { select: { code: true } } } }), this.prisma.externalStay.count({ where })]);
    return toPaginatedDto(rows.map((r) => ({ id: r.id, source: r.source.code, title: r.title, city: r.city, status: r.status, publishState: r.publishState, entryMode: r.entryMode, petEvidenceType: r.petEvidenceType, petPolicy: { sourceObservation: r.petPolicyStatus, adminConfirmed: r.adminPetPolicyStatus, effective: effectivePetPolicy(r) }, sourceType: r.sourceType, firstSeenAt: r.firstSeenAt?.toISOString() ?? null, lastSeenAt: r.lastSeenAt?.toISOString() ?? null, lastChangedAt: r.lastChangedAt?.toISOString() ?? null, missedRuns: r.missedRuns, canonicalAccommodationId: r.canonicalAccommodationId, lastCheckedAt: r.lastCheckedAt.toISOString(), hasOverrides: Boolean(r.overrides && Object.keys(r.overrides as object).length) })), total, page, pageSize);
  }

  async inspect(id: string) {
    const s = await this.prisma.externalStay.findUnique({ where: { id }, include: { source: true, images: { orderBy: { position: "asc" } }, prices: { orderBy: { observedAt: "desc" }, take: 60 }, changes: { orderBy: { createdAt: "desc" }, take: 100 }, petEvidence: { orderBy: { createdAt: "desc" }, take: 30 }, observations: { orderBy: { observedAt: "desc" }, take: 20, select: { id: true, runId: true, observedAt: true, rawFingerprint: true, normalizedFingerprint: true, normalized: true, rawExcerpt: true } }, _count: { select: { clicks: true, favorites: true, trips: true } } } });
    if (!s) throw new NotFoundApiException("External stay");
    const runs = await this.prisma.externalSyncRun.findMany({ where: { sourceId: s.sourceId, status: { in: ["FAILED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, take: 5, select: { id: true, status: true, startedAt: true, errorCategories: true } });
    const matches = await this.prisma.externalStayMatchCandidate.findMany({ where: { OR: [{ stayAId: id }, { stayBId: id }] } });
    return {
      normalized: { id: s.id, title: s.title, city: s.city, country: s.country, province: s.province, area: s.area, addressText: s.addressText, amenities: s.amenities, stayType: s.stayType, capacity: s.capacity, bedrooms: s.bedrooms, beds: s.beds, latitude: s.latitude, longitude: s.longitude, rating: s.rating, reviewCount: s.reviewCount, instantBooking: s.instantBooking, descriptionSummary: s.descriptionSummary, status: s.status, publishState: s.publishState, entryMode: s.entryMode, createdByAdminId: s.createdByAdminId },
      lifecycle: { status: s.status, firstSeenAt: s.firstSeenAt?.toISOString() ?? null, lastSeenAt: s.lastSeenAt?.toISOString() ?? null, lastChangedAt: s.lastChangedAt?.toISOString() ?? null, missedRuns: s.missedRuns, staleAfterMissedRuns: s.source.staleAfterMissedRuns, removeAfterMissedRuns: s.source.removeAfterMissedRuns },
      canonicalAccommodationId: s.canonicalAccommodationId,
      source: { code: s.source.code, sourceType: s.sourceType, sourceListingId: s.sourceListingId, sourceUrl: s.sourceUrl, rawFingerprint: s.rawFingerprint, normalizedFingerprint: s.normalizedFingerprint, lastSourceUpdateAt: s.lastSourceUpdateAt?.toISOString() ?? null, lastCheckedAt: s.lastCheckedAt.toISOString(), lastSuccessfulSyncAt: s.lastSuccessfulSyncAt?.toISOString() ?? null },
      petEvidence: { type: s.petEvidenceType, text: s.petEvidenceText, observedAt: s.petEvidenceObservedAt?.toISOString() ?? null, policy: s.petPolicy, summary: s.petPolicySummary },
      petPolicy: { sourceObservation: s.petPolicyStatus, adminConfirmed: s.adminPetPolicyStatus, adminNote: s.adminPetPolicyNote, adminReviewedAt: s.adminPetPolicyAt?.toISOString() ?? null, effective: effectivePetPolicy(s), precedence: "ADMIN_CONFIRMED > SOURCE_OBSERVATION" },
      petEvidenceHistory: s.petEvidence.map((e) => ({ id: e.id, status: e.status, authority: e.authority, evidenceSource: e.evidenceSource, evidenceText: e.evidenceText, evidencePath: e.evidencePath, observedAt: e.evidenceObservedAt.toISOString(), lastConfirmedAt: e.lastConfirmedAt.toISOString(), runId: e.runId, dogsAllowed: e.dogsAllowed, catsAllowed: e.catsAllowed, maxPets: e.maxPets, maxWeightKg: e.maxWeightKg, petFeeIrr: e.petFeeIrr })),
      observations: s.observations.map((o) => ({ ...o, observedAt: o.observedAt.toISOString() })),
      overrides: s.overrides ?? {},
      images: s.images.map((i) => ({ position: i.position, sourceImageUrl: i.sourceImageUrl, lastVerifiedAt: i.lastVerifiedAt.toISOString() })),
      priceHistory: s.prices.map((p) => ({ id: p.id, checkIn: p.checkIn?.toISOString().slice(0, 10) ?? null, checkOut: p.checkOut?.toISOString().slice(0, 10) ?? null, guests: p.guests, priceType: p.priceType, currency: p.currency, runId: p.runId, freshness: freshnessOf(p.lastConfirmedAt, s.source), priceIrr: p.priceIrr, oldPriceIrr: p.oldPriceIrr, discountPercent: p.discountPercent, priceBasis: p.priceBasis, availability: p.availability, observedAt: p.observedAt.toISOString(), lastConfirmedAt: p.lastConfirmedAt.toISOString(), expiresAt: p.expiresAt.toISOString(), observedBy: p.observedBy })),
      changes: s.changes.map((c) => ({ kind: c.kind, field: c.field, oldValue: c.oldValue, newValue: c.newValue, runId: c.runId, detail: c.detail, at: c.createdAt.toISOString() })),
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
        // Staff-confirmed duplicate → one canonical accommodation; each source listing (and its offer) stays separate.
        if (a.canonicalAccommodationId && b.canonicalAccommodationId && a.canonicalAccommodationId !== b.canonicalAccommodationId) {
          await tx.externalStay.updateMany({ where: { canonicalAccommodationId: b.canonicalAccommodationId }, data: { canonicalAccommodationId: a.canonicalAccommodationId } });
          await tx.canonicalAccommodation.delete({ where: { id: b.canonicalAccommodationId } });
        }
        const canonicalId = a.canonicalAccommodationId ?? b.canonicalAccommodationId ?? (await tx.canonicalAccommodation.create({ data: { title: a.title, city: a.city, province: a.province ?? b.province, latitude: a.latitude ?? b.latitude, longitude: a.longitude ?? b.longitude, createdByAdminId: admin.adminUserId } })).id;
        await tx.externalStay.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { canonicalAccommodationId: canonicalId } });
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
