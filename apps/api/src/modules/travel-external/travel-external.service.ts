import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AdminPriority, AdminTaskSource, ExternalAutomationStatus, ExternalAvailability, ExternalChangeKind, ExternalEntryMode, ExternalImagePolicy, ExternalObservedBy, ExternalPriceBasis, ExternalPriceType,
  ExternalPublishState, ExternalSourceAccessStatus, ExternalSourceHealth, ExternalSourceMode, ExternalSourceType, ExternalStayStatus, ExternalSyncKind, ExternalSyncStatus, ExternalSyncTrigger,
  PetEvidenceType, PetPolicyAuthority, PetPolicyStatus, Prisma, type ExternalStay, type ExternalTravelSource,
} from "@prisma/client";
import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AutomaticTaskService } from "../admin/task/automatic-task.service";
import { validateSourceUrl, SourceFetchError } from "./safe-fetch";
import { AdapterError, type AdapterListing, type NormalizedListing, type PriceObservation, type PriceWindow, type RawListing, type ScrapeContext, type TravelSourceAdapter } from "./adapters/travel-source-adapter";
import { TRAVEL_SOURCE_ADAPTERS } from "./adapters/adapter-registry";
import { ScrapeHttpClient } from "./scrape/scrape-http-client";
import { compactRaw, fingerprint as hash } from "./scrape/fingerprint";
import { diffFields, type TrackedField } from "./scrape/diff";
import { freshnessOf } from "./scrape/freshness";
import type { PetPolicyObservation } from "./scrape/pet-policy-extractor";

/** Source URLs are user/adapter input: a rejected URL is a 400, never a 500. */
export function assertSourceUrl(raw: string, hosts: string[]): URL {
  try {
    return validateSourceUrl(raw, hosts);
  } catch (e) {
    throw new ValidationApiException({ field: "sourceUrl", reason: e instanceof SourceFetchError ? e.category : "INVALID_URL" });
  }
}
const DAY = 86400e3;
export const OVERRIDABLE = ["title", "city", "area", "stayType", "petPolicySummary", "descriptionSummary"] as const;
type Overrides = Partial<Record<(typeof OVERRIDABLE)[number], { sourceValue: unknown; overrideValue: string; adminUserId: string; at: string }>>;
type QuoteContext = { checkIn: string; checkOut: string; guests: number; pets?: number };
type RunCounters = { itemsScanned: number; created: number; updated: number; unchanged: number; failed: number; listingsDiscovered: number; removed: number; staleMarked: number };
type RunError = { externalId?: string; category: string; message: string };
const FATAL: string[] = ["BLOCKED_EXTERNAL", "RATE_LIMITED"];

/** Effective pet policy: reviewed staff truth first, then the latest source observation. */
export const effectivePetPolicy = (s: Pick<ExternalStay, "adminPetPolicyStatus" | "petPolicyStatus">): PetPolicyStatus => s.adminPetPolicyStatus ?? s.petPolicyStatus;

/** A listing is publishable with a valid source URL, a title and a known freshness. Pet policy may be UNKNOWN (labelled). */
export function publishBlockers(stay: Pick<ExternalStay, "sourceUrl" | "title" | "lastCheckedAt">, source: Pick<ExternalTravelSource, "allowedHosts">): string[] {
  const out: string[] = [];
  try { validateSourceUrl(stay.sourceUrl, source.allowedHosts); } catch { out.push("SOURCE_URL_INVALID"); }
  if (!stay.title?.trim()) out.push("TITLE_MISSING");
  if (!stay.lastCheckedAt) out.push("FRESHNESS_UNKNOWN");
  return out;
}

/** Deterministic daily observation windows (2 nights, 2 guests): nearest weekend (Thu→Sat), +7, +14, +30 days. */
export function observationWindows(now: Date): PriceWindow[] {
  const d = (days: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
  const toThu = (4 - now.getUTCDay() + 7) % 7 || 7;
  return [toThu, 7, 14, 30].map((o) => ({ checkIn: d(o), checkOut: d(o + 2), guests: 2 }));
}

/**
 * TRAVEL-SCRAPE engine (source-agnostic): discover → (details) → normalize → pet evidence → prices → images → snapshot →
 * diff → lifecycle, with pacing (one request at a time, polite delay), a request budget, single-flight per source,
 * circuit breaker, parser-anomaly guard, per-listing error isolation and deduplicated admin tasks. A failed run never
 * deletes or corrupts inventory: last known data stays, marked by freshness.
 */
@Injectable()
export class TravelExternalService {
  private readonly logger = new Logger(TravelExternalService.name);
  /** Pacing sleeps are skipped under NODE_ENV=test. */
  sleep: (ms: number) => Promise<void> = (ms) => (process.env.NODE_ENV === "test" ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(TRAVEL_SOURCE_ADAPTERS) private readonly adapters: Map<string, TravelSourceAdapter>,
    private readonly tasks: AutomaticTaskService,
    private readonly events: DomainEventsService,
  ) {}

  async source(code: string) {
    const s = await this.prisma.externalTravelSource.findUnique({ where: { code } });
    if (!s) throw new NotFoundApiException("Travel source");
    return s;
  }

  context(source: ExternalTravelSource, now = new Date()): ScrapeContext {
    return {
      http: new ScrapeHttpClient({ allowedHosts: source.allowedHosts, timeoutMs: source.timeoutMs, requestDelayMinMs: source.requestDelayMinMs, requestDelayMaxMs: source.requestDelayMaxMs, maxRequests: source.maxRequestsPerRun }, this.sleep),
      cityScopes: source.cityScopes,
      maxListings: source.maxRequestsPerRun,
      windows: observationWindows(now),
      now,
    };
  }

  // ------------------------------------------------------------------ sync
  /** Stuck STARTED runs (worker restart, crash) become ABANDONED so nothing is locked forever. */
  async abandonStuckRuns(now = new Date()) {
    const sources = await this.prisma.externalTravelSource.findMany({ select: { id: true, timeoutMs: true, maxRequestsPerRun: true, requestDelayMaxMs: true } });
    let n = 0;
    for (const s of sources) {
      const cutoff = new Date(now.getTime() - Math.max(15 * 60e3, 2 * (s.timeoutMs + s.requestDelayMaxMs) * (s.maxRequestsPerRun + 2)));
      n += (await this.prisma.externalSyncRun.updateMany({ where: { sourceId: s.id, status: ExternalSyncStatus.STARTED, startedAt: { lt: cutoff } }, data: { status: ExternalSyncStatus.ABANDONED, finishedAt: now } })).count;
    }
    return n;
  }

  async runSync(code: string, kind: ExternalSyncKind, opts: { adminUserId?: string; listingId?: string; trigger?: ExternalSyncTrigger } = {}) {
    const source = await this.source(code);
    await this.abandonStuckRuns();
    const lockKey = `travel-ext-sync:${code}`;
    const ttl = Math.max(120_000, (source.timeoutMs + source.requestDelayMaxMs) * (source.maxRequestsPerRun + 2));
    const token = randomUUID();
    if ((await this.redis.set(lockKey, token, "PX", ttl, "NX")) !== "OK") throw new ValidationApiException({ field: "source", reason: "SYNC_ALREADY_RUNNING" });
    const started = Date.now();
    const run = await this.prisma.externalSyncRun.create({ data: { sourceId: source.id, kind, triggeredByAdminId: opts.adminUserId ?? null, trigger: opts.trigger ?? (opts.adminUserId ? ExternalSyncTrigger.MANUAL : ExternalSyncTrigger.SCHEDULED) } });
    const c: RunCounters = { itemsScanned: 0, created: 0, updated: 0, unchanged: 0, failed: 0, listingsDiscovered: 0, removed: 0, staleMarked: 0 };
    const categories: Record<string, number> = {};
    const errors: RunError[] = [];
    const fail = (category: string, message: string, externalId?: string) => { categories[category] = (categories[category] ?? 0) + 1; if (errors.length < 50) errors.push({ externalId, category, message: message.slice(0, 200) }); };
    let status: ExternalSyncStatus = ExternalSyncStatus.SUCCEEDED;
    let fatal: AdapterError | null = null;
    let anomaly = false;
    const ctx = this.context(source);
    try {
      const adapter = this.adapters.get(code);
      if (source.mode !== ExternalSourceMode.AUTOMATED || source.automationStatus !== ExternalAutomationStatus.SUPPORTED || !adapter || !adapter.parserReady) {
        const cat = !adapter || !adapter.parserReady ? "PARSER_PENDING" : source.automationStatus === ExternalAutomationStatus.BLOCKED_EXTERNAL ? "BLOCKED_EXTERNAL" : "NOT_SUPPORTED";
        fail(cat, cat === "PARSER_PENDING" ? "source parser not active (real public payload not yet observed)" : "automation not enabled for this source");
        status = ExternalSyncStatus.FAILED;
      } else if (source.circuitOpenUntil && source.circuitOpenUntil > new Date()) {
        fail("CIRCUIT_OPEN", `circuit open until ${source.circuitOpenUntil.toISOString()}`);
        status = ExternalSyncStatus.CANCELLED;
      } else if (opts.listingId) {
        const stay = await this.prisma.externalStay.findFirst({ where: { id: opts.listingId, sourceId: source.id } });
        if (!stay) throw new NotFoundApiException("External stay");
        c.itemsScanned = 1;
        try {
          c[await this.ingestRaw(source, adapter, run.id, await adapter.fetchDetails(ctx, stay.sourceListingId))]++;
        } catch (e) {
          if (!(e instanceof AdapterError && e.category === "LISTING_REMOVED")) throw e;
          // The source says the listing is gone (404 on its own page): a confirmed removal, not a missed crawl.
          c.removed += (await this.markMissing(source, run.id, [stay], true)).removed;
        }
      } else {
        const disc = await adapter.discover(ctx);
        c.listingsDiscovered = disc.items.length;
        anomaly = await this.isAnomalous(source, disc.items.length);
        const seen = new Set<string>();
        for (const raw of disc.items) {
          c.itemsScanned++;
          try {
            let detail: RawListing | null = null;
            if (raw.stage === "search" && ctx.http.remaining > 0 && (await this.needsDetails(source, raw.externalId))) {
              detail = await adapter.fetchDetails(ctx, raw.externalId).catch((e) => { if (e instanceof AdapterError && FATAL.includes(e.category)) throw e; return null; });
            }
            c[await this.ingestRaw(source, adapter, run.id, detail ?? raw, detail ? raw : undefined)]++;
            seen.add(raw.externalId);
          } catch (e) {
            // A block/rate limit mid-run stops the run (never hammer); anything else is isolated to this one listing.
            if (e instanceof AdapterError && FATAL.includes(e.category)) throw e;
            c.failed++;
            seen.add(raw.externalId); // present on the source but unparseable is not "missing"
            fail(e instanceof AdapterError ? e.category : e instanceof ValidationApiException ? String((e.details as { reason?: string })?.reason ?? "INVALID") : "NORMALIZE_ERROR", e instanceof Error ? e.message : "failed", raw.externalId);
          }
        }
        if (anomaly) {
          fail("PARSER_ANOMALY", `discovered ${disc.items.length} listings, far below the recent baseline — lifecycle changes withheld`);
          await this.raiseTask(source, "PARSER_ANOMALY", `travel:${code}:parser-anomaly:${new Date().toISOString().slice(0, 10)}`, `ناهنجاری پارسر منبع ${source.nameFa}`, `Run ${run.id}: only ${disc.items.length} listings vs the recent baseline. No listing was removed.`, AdminPriority.HIGH);
        } else if (kind === ExternalSyncKind.FULL && disc.complete && c.failed <= c.itemsScanned / 2) {
          const r = await this.applyMissing(source, run.id, seen);
          c.staleMarked = r.stale;
          c.removed = r.removed;
        }
        status = anomaly || (c.failed && c.itemsScanned > c.failed) ? ExternalSyncStatus.PARTIAL : c.failed ? ExternalSyncStatus.FAILED : ExternalSyncStatus.SUCCEEDED;
      }
    } catch (e) {
      const cat = e instanceof AdapterError ? e.category : e instanceof SourceFetchError ? e.category : e instanceof NotFoundApiException ? "NOT_FOUND" : "UNEXPECTED";
      fail(cat, e instanceof Error ? e.message : "failed");
      fatal = e instanceof AdapterError ? e : null;
      status = ExternalSyncStatus.FAILED;
      if (!(e instanceof AdapterError) && !(e instanceof SourceFetchError) && !(e instanceof NotFoundApiException)) this.logger.error(`Travel sync ${code} failed`, e instanceof Error ? e.stack : undefined);
    } finally {
      const durationMs = Date.now() - started;
      await this.prisma.externalSyncRun.update({ where: { id: run.id }, data: { ...c, pagesRequested: ctx.http.requests, status, finishedAt: new Date(), durationMs, anomaly, errorCategories: categories, errors: errors as unknown as Prisma.InputJsonValue } });
      await this.recordHealth(source, run.id, status, Object.keys(categories)[0], fatal, { listingsSeen: c.listingsDiscovered || c.itemsScanned, durationMs, anomaly, message: errors[0]?.message });
      if ((await this.redis.get(lockKey)) === token) await this.redis.del(lockKey);
    }
    await this.events.publish("ExternalTravelSyncCompleted", { sourceCode: code, runId: run.id, kind, status, created: c.created, updated: c.updated, removed: c.removed }, { aggregateType: "ExternalSyncRun", aggregateId: run.id });
    return this.prisma.externalSyncRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  /** Detail pages are fetched for new listings and when the stored detail is older than the metadata TTL. */
  private async needsDetails(source: ExternalTravelSource, externalId: string) {
    const s = await this.prisma.externalStay.findUnique({ where: { sourceId_sourceListingId: { sourceId: source.id, sourceListingId: externalId } }, select: { status: true, lastCheckedAt: true } });
    return !s || s.status === ExternalStayStatus.DISCOVERED || s.lastCheckedAt.getTime() + source.metadataTtlMinutes * 60e3 < Date.now();
  }

  /** Far fewer listings than the recent baseline (median of the last 5 healthy discovery runs, ≥ 10) means the parser broke, not the inventory. */
  private async isAnomalous(source: ExternalTravelSource, discovered: number) {
    const recent = await this.prisma.externalSyncRun.findMany({ where: { sourceId: source.id, kind: { in: [ExternalSyncKind.FULL, ExternalSyncKind.DISCOVERY] }, status: ExternalSyncStatus.SUCCEEDED, anomaly: false, listingsDiscovered: { gt: 0 } }, orderBy: { startedAt: "desc" }, take: 5, select: { listingsDiscovered: true } });
    if (recent.length < 2) return false;
    const sorted = recent.map((r) => r.listingsDiscovered).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    return median >= 10 && discovered < median * source.anomalyDropRatio;
  }

  /** Conservative lifecycle: only complete, healthy FULL runs count a miss; STALE after N misses, REMOVED_FROM_SOURCE after M. */
  private async applyMissing(source: ExternalTravelSource, runId: string, seen: Set<string>) {
    const missing = await this.prisma.externalStay.findMany({ where: { sourceId: source.id, entryMode: ExternalEntryMode.AUTOMATED, status: { in: [ExternalStayStatus.DISCOVERED, ExternalStayStatus.ACTIVE, ExternalStayStatus.STALE] }, sourceListingId: { notIn: [...seen] }, ...(source.cityScopes.length ? { city: { in: source.cityScopes } } : {}) } });
    return this.markMissing(source, runId, missing, false);
  }

  private async markMissing(source: ExternalTravelSource, runId: string, stays: ExternalStay[], confirmedGone: boolean) {
    let stale = 0, removed = 0;
    for (const s of stays) {
      const missed = s.missedRuns + 1;
      const next = confirmedGone || missed >= source.removeAfterMissedRuns ? ExternalStayStatus.SOURCE_REMOVED : missed >= source.staleAfterMissedRuns ? ExternalStayStatus.STALE : s.status;
      await this.prisma.externalStay.update({ where: { id: s.id }, data: { missedRuns: missed, status: next, ...(next !== s.status ? { lastChangedAt: new Date() } : {}) } });
      if (next !== s.status) {
        if (next === ExternalStayStatus.SOURCE_REMOVED) removed++; else stale++;
        await this.change(s.id, next === ExternalStayStatus.SOURCE_REMOVED ? ExternalChangeKind.SOURCE_REMOVED : ExternalChangeKind.STALE, { missedRuns: missed, confirmedGone }, { runId, field: "status", oldValue: s.status, newValue: next });
      }
    }
    return { stale, removed };
  }

  /** Circuit breaker + health. 403 → BLOCKED (24 h), 429 → wait Retry-After, other failures back off exponentially (max 24 h). */
  private async recordHealth(source: ExternalTravelSource, runId: string, status: ExternalSyncStatus, category: string | undefined, fatal: AdapterError | null, m: { listingsSeen: number; durationMs: number; anomaly: boolean; message?: string }) {
    const now = new Date();
    const base = { lastRunAt: now, lastRunStatus: status, lastDurationMs: m.durationMs, lastListingsSeen: m.listingsSeen };
    if (status === ExternalSyncStatus.SUCCEEDED || status === ExternalSyncStatus.PARTIAL) {
      const partial = status === ExternalSyncStatus.PARTIAL;
      await this.prisma.externalTravelSource.update({ where: { id: source.id }, data: { ...base, lastSuccessAt: now, consecutiveFailures: 0, circuitOpenUntil: null, accessStatus: ExternalSourceAccessStatus.VERIFIED_PUBLIC, health: partial ? ExternalSourceHealth.DEGRADED : ExternalSourceHealth.HEALTHY, healthReason: m.anomaly ? "Parser anomaly: far fewer listings than usual" : partial ? "Some listings failed to parse" : null, lastErrorCategory: partial ? (category ?? null) : null, lastError: partial ? (m.message ?? null) : null } });
      return;
    }
    if (status === ExternalSyncStatus.CANCELLED) { await this.prisma.externalTravelSource.update({ where: { id: source.id }, data: base }); return; }
    // Not an access failure: the source isn't automated / its parser isn't active. No circuit, no failure streak.
    if (category === "NOT_SUPPORTED" || category === "PARSER_PENDING") {
      await this.prisma.externalTravelSource.update({ where: { id: source.id }, data: { ...base, lastErrorCategory: category, lastError: m.message ?? null } });
      return;
    }
    const failures = source.consecutiveFailures + 1;
    const blocked = category === "BLOCKED_EXTERNAL";
    const backoff = Math.min(DAY, 2 ** Math.min(failures, 10) * 60e3);
    const until = blocked ? DAY : category === "RATE_LIMITED" ? Math.max(fatal?.retryAfterMs ?? 0, backoff) : backoff;
    await this.prisma.externalTravelSource.update({
      where: { id: source.id },
      data: {
        ...base, lastFailureAt: now, lastErrorCategory: category ?? "UNKNOWN", lastError: m.message ?? null, consecutiveFailures: failures,
        circuitOpenUntil: new Date(now.getTime() + until),
        ...(blocked ? { accessStatus: ExternalSourceAccessStatus.BLOCKED_BY_SOURCE } : {}),
        health: source.mode === ExternalSourceMode.DISABLED ? ExternalSourceHealth.DISABLED : blocked ? ExternalSourceHealth.BLOCKED : ExternalSourceHealth.DEGRADED,
        healthReason: blocked ? "Source denied automated access (no bypass attempted)" : category === "RATE_LIMITED" ? "Source asked us to slow down (429); waiting" : `Last run failed: ${category}`,
      },
    });
    if (blocked) await this.raiseTask(source, "SOURCE_BLOCKED", `travel:${source.code}:blocked:${now.toISOString().slice(0, 10)}`, `منبع ${source.nameFa} دسترسی خودکار را رد کرد`, `Run ${runId}: ${m.message ?? category}. Automated sync paused 24 h; no bypass attempted.`, AdminPriority.HIGH);
    if (failures >= 3) await this.raiseTask(source, "REPEATED_FAILURE", `travel:${source.code}:repeated-failure:${source.lastSuccessAt?.toISOString() ?? "never"}`, `خطای مکرر در همگام‌سازی ${source.nameFa}`, `${failures} consecutive failed runs; last: ${category}.`);
  }

  private raiseTask(source: Pick<ExternalTravelSource, "code">, kind: string, dedupeKey: string, title: string, description: string, priority: AdminPriority = AdminPriority.NORMAL, related?: { type: string; id: string }) {
    return this.tasks.raise({ dedupeKey, title, description: `[${kind}] ${description}`, source: AdminTaskSource.TRAVEL_SOURCE, team: "operations", priority, relatedEntityType: related?.type ?? "EXTERNAL_TRAVEL_SOURCE", relatedEntityId: related?.id ?? source.code });
  }

  private change(stayId: string, kind: ExternalChangeKind, detail: Record<string, unknown>, extra: { runId?: string | null; field?: string; oldValue?: unknown; newValue?: unknown } = {}) {
    const j = (v: unknown) => (v === undefined ? undefined : v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
    return this.prisma.externalStayChange.create({ data: { stayId, kind, detail: detail as Prisma.InputJsonValue, runId: extra.runId ?? null, field: extra.field ?? null, oldValue: j(extra.oldValue), newValue: j(extra.newValue) } });
  }

  // ------------------------------------------------------------------ ingestion
  /** `raw` is the richest record (details if fetched); `searchRaw` the list item it came from (its prices are for the search window). */
  private async ingestRaw(source: ExternalTravelSource, adapter: TravelSourceAdapter, runId: string, raw: RawListing, searchRaw?: RawListing): Promise<"created" | "updated" | "unchanged"> {
    const normalized = adapter.normalize(raw);
    const pet = adapter.extractPetPolicy(raw);
    const prices = [...(searchRaw ? adapter.extractPrices(searchRaw) : []), ...adapter.extractPrices(raw)];
    const images = adapter.extractImages(raw);
    return this.ingest(source, { runId, mode: ExternalEntryMode.AUTOMATED, adminUserId: null, sourceType: source.sourceType }, { normalized, pet, prices, images, rawPayload: raw.payload, partial: Boolean(normalized.partial) });
  }

  /** Validate → snapshot → diff → evidence → prices → images → lifecycle. Idempotent on (source, sourceListingId). */
  async ingest(source: ExternalTravelSource, meta: { runId: string | null; mode: ExternalEntryMode; adminUserId: string | null; sourceType: ExternalSourceType }, obs: { normalized: NormalizedListing; pet: PetPolicyObservation; prices: PriceObservation[]; images: string[]; rawPayload: unknown; partial?: boolean }): Promise<"created" | "updated" | "unchanged"> {
    const l = obs.normalized;
    if (!l.title?.trim() || !l.city?.trim() || !l.sourceListingId?.trim()) throw new ValidationApiException({ field: "listing", reason: "REQUIRED_FIELD_MISSING" });
    assertSourceUrl(l.sourceUrl, source.allowedHosts);
    const now = new Date();
    const imageUrls = this.validImages(source, obs.images);
    const data = {
      sourceUrl: l.sourceUrl, title: l.title.trim().slice(0, 200), city: l.city.trim(), country: l.country ?? null, province: l.province ?? null, area: l.area ?? null, addressText: l.addressText?.slice(0, 300) ?? null, stayType: l.stayType ?? null,
      latitude: l.latitude ?? null, longitude: l.longitude ?? null, capacity: l.capacity ?? null, bedrooms: l.bedrooms ?? null, beds: l.beds ?? null, amenities: (l.amenities ?? []).map((a) => a.slice(0, 80)).slice(0, 60),
      rating: l.rating ?? null, reviewCount: l.reviewCount ?? null, instantBooking: l.instantBooking ?? null, descriptionSummary: l.descriptionSummary?.slice(0, 500) ?? null, lastSourceUpdateAt: l.lastSourceUpdateAt ?? null,
    };
    const tracked = (x: Record<string, unknown>, imgs: string[], pet: PetPolicyStatus): Partial<Record<TrackedField, unknown>> => ({ title: x.title, descriptionSummary: x.descriptionSummary, imageUrls: imgs, city: x.city, province: x.province, area: x.area, addressText: x.addressText, latitude: x.latitude, longitude: x.longitude, amenities: x.amenities, capacity: x.capacity, stayType: x.stayType, petPolicyStatus: pet });
    const normalizedFingerprint = hash({ ...data, imageUrls, pet: [obs.pet.status, obs.pet.evidenceText] });
    const rawFingerprint = hash(obs.rawPayload ?? data);
    const existing = await this.prisma.externalStay.findUnique({ where: { sourceId_sourceListingId: { sourceId: source.id, sourceListingId: l.sourceListingId } }, include: { images: { orderBy: { position: "asc" } } } });
    let stayId: string;
    let result: "created" | "updated" | "unchanged";
    if (!existing) {
      const created = await this.prisma.externalStay.create({
        data: {
          ...data, sourceId: source.id, sourceListingId: l.sourceListingId, sourceType: meta.sourceType, entryMode: meta.mode, createdByAdminId: meta.adminUserId,
          status: obs.partial ? ExternalStayStatus.DISCOVERED : ExternalStayStatus.ACTIVE, publishState: ExternalPublishState.DRAFT,
          petPolicyStatus: obs.pet.status, petFriendly: obs.pet.status === PetPolicyStatus.CONFIRMED_ALLOWED, ...this.petMirror(obs.pet, now),
          // Auto-publish applies to automated ingestion only; staff manual records stay DRAFT until a staff publish.
          firstSeenAt: now, lastSeenAt: now, lastChangedAt: now, lastCheckedAt: now, lastSuccessfulSyncAt: meta.mode === ExternalEntryMode.AUTOMATED ? now : null, normalizedFingerprint, rawFingerprint,
        },
      });
      stayId = created.id;
      await this.setImages(stayId, imageUrls);
      await this.change(stayId, ExternalChangeKind.CREATED, {}, { runId: meta.runId });
      if (source.autoPublish && meta.mode === ExternalEntryMode.AUTOMATED && !obs.partial && !publishBlockers(created, source).length) await this.prisma.externalStay.update({ where: { id: stayId }, data: { publishState: ExternalPublishState.PUBLISHED } });
      result = "created";
    } else {
      stayId = existing.id;
      const diffs = diffFields(tracked(existing as unknown as Record<string, unknown>, existing.images.map((i) => i.sourceImageUrl), existing.petPolicyStatus), tracked(data, imageUrls, obs.pet.status));
      const reappeared = existing.status === ExternalStayStatus.STALE || existing.status === ExternalStayStatus.SOURCE_REMOVED;
      const promote = existing.status === ExternalStayStatus.DISCOVERED && !obs.partial;
      const nextStatus = existing.status === ExternalStayStatus.HIDDEN ? ExternalStayStatus.HIDDEN : existing.status === ExternalStayStatus.DISCOVERED && obs.partial ? ExternalStayStatus.DISCOVERED : ExternalStayStatus.ACTIVE;
      const urlChanged = existing.sourceUrl !== data.sourceUrl;
      const petEvidenceChanged = obs.pet.status !== existing.petPolicyStatus || (obs.pet.evidenceText ?? null) !== (existing.petEvidenceText ?? null);
      const changed = diffs.length > 0 || reappeared || promote || urlChanged;
      await this.prisma.externalStay.update({
        where: { id: stayId },
        data: {
          ...data, status: nextStatus, missedRuns: 0, lastSeenAt: now, lastCheckedAt: now, normalizedFingerprint, rawFingerprint,
          ...(meta.mode === ExternalEntryMode.AUTOMATED ? { lastSuccessfulSyncAt: now } : {}),
          ...(changed ? { lastChangedAt: now } : {}),
          petPolicyStatus: obs.pet.status, petFriendly: effectivePetPolicy({ adminPetPolicyStatus: existing.adminPetPolicyStatus, petPolicyStatus: obs.pet.status }) === PetPolicyStatus.CONFIRMED_ALLOWED,
          ...(petEvidenceChanged ? this.petMirror(obs.pet, now) : {}),
        },
      });
      for (const d of diffs) {
        if (d.field === "imageUrls") await this.setImages(stayId, imageUrls);
        await this.change(stayId, d.field === "imageUrls" ? ExternalChangeKind.IMAGE_CHANGED : d.field === "petPolicyStatus" ? ExternalChangeKind.PET_POLICY_CHANGED : ExternalChangeKind.FIELD_CHANGED, {}, { runId: meta.runId, field: d.field, oldValue: d.oldValue, newValue: d.newValue });
      }
      if (!diffs.some((d) => d.field === "imageUrls")) await this.prisma.externalStayImage.updateMany({ where: { stayId }, data: { lastVerifiedAt: now } });
      if (urlChanged) await this.change(stayId, ExternalChangeKind.URL_CHANGED, { from: existing.sourceUrl, to: data.sourceUrl }, { runId: meta.runId, field: "sourceUrl", oldValue: existing.sourceUrl, newValue: data.sourceUrl });
      if (reappeared) await this.change(stayId, ExternalChangeKind.REAPPEARED, {}, { runId: meta.runId, field: "status", oldValue: existing.status, newValue: ExternalStayStatus.ACTIVE });
      // A flip between an explicit yes and an explicit no is never silent: change event + staff task (public shows latest evidence with its date).
      const flip = (existing.petPolicyStatus === PetPolicyStatus.CONFIRMED_ALLOWED && obs.pet.status === PetPolicyStatus.CONFIRMED_NOT_ALLOWED) || (existing.petPolicyStatus === PetPolicyStatus.CONFIRMED_NOT_ALLOWED && obs.pet.status === PetPolicyStatus.CONFIRMED_ALLOWED);
      if (flip) {
        await this.change(stayId, ExternalChangeKind.PET_POLICY_CONFLICT, { adminConfirmed: existing.adminPetPolicyStatus }, { runId: meta.runId, field: "petPolicyStatus", oldValue: existing.petPolicyStatus, newValue: obs.pet.status });
        await this.raiseTask(source, "PET_POLICY_CONFLICT", `travel:pet-conflict:${stayId}:${obs.pet.status}:${now.toISOString().slice(0, 10)}`, `تغییر متناقض سیاست حیوان خانگی: ${data.title}`.slice(0, 200), `Source ${source.code} listing ${l.sourceListingId}: ${existing.petPolicyStatus} → ${obs.pet.status}.`, AdminPriority.HIGH, { type: "EXTERNAL_STAY", id: stayId });
      }
      if (source.autoPublish && meta.mode === ExternalEntryMode.AUTOMATED && (promote || reappeared) && existing.publishState === ExternalPublishState.DRAFT && !publishBlockers({ ...existing, ...data }, source).length) await this.prisma.externalStay.update({ where: { id: stayId }, data: { publishState: ExternalPublishState.PUBLISHED } });
      result = changed ? "updated" : "unchanged";
    }
    // Snapshot only when the observed content changed (normalized state + short raw excerpt; raw is cleared after retention).
    const prev = await this.prisma.externalStayObservation.findFirst({ where: { stayId }, orderBy: { observedAt: "desc" }, select: { rawFingerprint: true, normalizedFingerprint: true } });
    if (!prev || prev.normalizedFingerprint !== normalizedFingerprint || prev.rawFingerprint !== rawFingerprint) {
      await this.prisma.externalStayObservation.create({ data: { stayId, runId: meta.runId, sourceListingId: l.sourceListingId, sourceUrl: l.sourceUrl, observedAt: now, rawFingerprint, normalizedFingerprint, normalized: { ...data, imageUrls, petPolicyStatus: obs.pet.status } as unknown as Prisma.InputJsonValue, rawExcerpt: obs.rawPayload === undefined ? undefined : (compactRaw(obs.rawPayload) as Prisma.InputJsonValue) } });
    }
    await this.recordPetEvidence(stayId, l.sourceUrl, meta, obs.pet, now);
    if (obs.prices.length) {
      const stay = await this.prisma.externalStay.findUniqueOrThrow({ where: { id: stayId }, include: { source: true } });
      for (const p of obs.prices) await this.recordPrice(stay, { checkIn: p.checkIn, checkOut: p.checkOut, guests: p.guests }, { priceIrr: p.amount, oldPriceIrr: p.oldAmount ?? null, discountPercent: p.discountPercent ?? null, priceBasis: p.priceBasis as ExternalPriceBasis, availability: p.availability as ExternalAvailability, priceType: p.priceType as ExternalPriceType }, { observedBy: meta.mode === ExternalEntryMode.MANUAL ? ExternalObservedBy.ADMIN : ExternalObservedBy.ADAPTER, adminUserId: meta.adminUserId ?? undefined, observedAt: now, runId: meta.runId });
    }
    if (result === "created") await this.findMatchCandidates(stayId);
    return result;
  }

  private petMirror(p: PetPolicyObservation, now: Date) {
    // Legacy normalized policy JSON (TRAVEL-EXT-1 consumers): explicit values only, "UNKNOWN" otherwise.
    const u = <T>(v: T | null | undefined) => (v === null || v === undefined ? "UNKNOWN" : v);
    const petPolicy = { dogs: u(p.dogsAllowed), cats: u(p.catsAllowed), maxPets: u(p.maxPets), sizeLimit: p.maxWeightKg ? `${p.maxWeightKg}kg` : "UNKNOWN", indoor: "UNKNOWN", extraFeeIrr: u(p.petFeeIrr), approvalRequired: "UNKNOWN" } as Prisma.InputJsonValue;
    const type = p.evidenceSource && (Object.values(PetEvidenceType) as string[]).includes(p.evidenceSource) ? (p.evidenceSource as PetEvidenceType) : p.evidenceText ? PetEvidenceType.SOURCE_POLICY_TEXT : null;
    return { petPolicy, petEvidenceType: type, petEvidenceText: p.evidenceText?.slice(0, 500) ?? null, petEvidenceObservedAt: p.evidenceText ? now : null };
  }

  /** New evidence row when the claim (status, fields or excerpt) changes; an identical repeat only bumps lastConfirmedAt. */
  private async recordPetEvidence(stayId: string, url: string, meta: { runId: string | null; adminUserId: string | null; mode: ExternalEntryMode }, p: PetPolicyObservation, now: Date) {
    const { status, evidenceSource, evidenceText, evidencePath, ...fields } = p;
    const fp = hash({ status, evidenceText, fields });
    const latest = await this.prisma.externalPetPolicyEvidence.findFirst({ where: { stayId, authority: PetPolicyAuthority.SOURCE_OBSERVATION }, orderBy: { createdAt: "desc" } });
    if (latest?.fingerprint === fp) { await this.prisma.externalPetPolicyEvidence.update({ where: { id: latest.id }, data: { lastConfirmedAt: now } }); return; }
    await this.prisma.externalPetPolicyEvidence.create({
      data: {
        stayId, runId: meta.runId, status, authority: PetPolicyAuthority.SOURCE_OBSERVATION, evidenceSource, evidenceUrl: url, evidenceText: evidenceText?.slice(0, 300) ?? null, evidencePath: evidencePath?.slice(0, 200) ?? null,
        dogsAllowed: fields.dogsAllowed ?? null, catsAllowed: fields.catsAllowed ?? null, otherPetsAllowed: fields.otherPetsAllowed ?? null, maxPets: fields.maxPets ?? null, maxWeightKg: fields.maxWeightKg ?? null,
        petFeeIrr: fields.petFeeIrr ?? null, depositIrr: fields.depositIrr ?? null, restrictions: fields.restrictions?.slice(0, 300) ?? null, allowedAreas: fields.allowedAreas?.slice(0, 200) ?? null, notes: fields.notes?.slice(0, 300) ?? null,
        evidenceObservedAt: now, lastConfirmedAt: now, fingerprint: fp, adminUserId: meta.mode === ExternalEntryMode.MANUAL ? meta.adminUserId : null,
      },
    });
  }

  /** Staff review of the pet policy: becomes the effective truth (ADMIN_CONFIRMED > source); the source observation is kept and keeps updating. */
  async reviewPetPolicy(adminUserId: string, stayId: string, status: PetPolicyStatus | null, note: string) {
    const stay = await this.prisma.externalStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundApiException("External stay");
    const now = new Date();
    await this.prisma.externalStay.update({ where: { id: stayId }, data: { adminPetPolicyStatus: status, adminPetPolicyNote: status ? note.slice(0, 500) : null, adminPetPolicyById: status ? adminUserId : null, adminPetPolicyAt: status ? now : null, petFriendly: (status ?? stay.petPolicyStatus) === PetPolicyStatus.CONFIRMED_ALLOWED, lastChangedAt: now } });
    if (status) await this.prisma.externalPetPolicyEvidence.create({ data: { stayId, status, authority: PetPolicyAuthority.ADMIN_CONFIRMED, evidenceSource: "ADMIN_REVIEW", evidenceUrl: stay.sourceUrl, evidenceText: note.slice(0, 300), evidenceObservedAt: now, lastConfirmedAt: now, fingerprint: hash({ admin: status, note, at: now }), adminUserId } });
    await this.change(stayId, ExternalChangeKind.PET_POLICY_REVIEWED, { note: note.slice(0, 200) }, { field: "adminPetPolicyStatus", oldValue: stay.adminPetPolicyStatus, newValue: status });
    return { stayId, sourceObservation: stay.petPolicyStatus, adminConfirmed: status, effective: status ?? stay.petPolicyStatus };
  }

  private validImages(source: ExternalTravelSource, urls: string[]) {
    if (source.imagePolicy === ExternalImagePolicy.NO_IMAGES) return [];
    return [...new Set(urls)].filter((u) => { try { validateSourceUrl(u, source.allowedHosts); return true; } catch { return false; } }).slice(0, 8);
  }

  /** Image references only — source URLs, never downloaded. */
  private async setImages(stayId: string, urls: string[]) {
    const now = new Date();
    await this.prisma.$transaction([this.prisma.externalStayImage.deleteMany({ where: { stayId } }), this.prisma.externalStayImage.createMany({ data: urls.map((u, i) => ({ stayId, sourceImageUrl: u, position: i, lastVerifiedAt: now })) })]);
  }

  // ------------------------------------------------------------------ cross-source matching (never auto-merged)
  async findMatchCandidates(stayId: string) {
    const stay = await this.prisma.externalStay.findUniqueOrThrow({ where: { id: stayId }, include: { source: { select: { code: true } } } });
    const others = await this.prisma.externalStay.findMany({ where: { city: stay.city, sourceId: { not: stay.sourceId }, status: { not: ExternalStayStatus.HIDDEN } }, take: 300 });
    const norm = (t: string) => t.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/(^|\s)(ویلا|اجاره|سوئیت|آپارتمان|کلبه|اقامتگاه|villa)(?=\s|$)/gu, " ");
    const tokens = (t: string) => new Set(norm(t).split(/\s+/).filter((w) => w.length > 1));
    const a = tokens(stay.title);
    let found = 0;
    for (const o of others) {
      const b = tokens(o.title);
      const jaccard = [...a].filter((w) => b.has(w)).length / Math.max(1, new Set([...a, ...b]).size);
      const meters = stay.latitude != null && o.latitude != null && stay.longitude != null && o.longitude != null ? Math.hypot((stay.latitude - o.latitude) * 111_000, (stay.longitude - o.longitude) * 111_000 * Math.cos((stay.latitude * Math.PI) / 180)) : null;
      const sameAddress = Boolean(stay.addressText && o.addressText && norm(stay.addressText) === norm(o.addressText));
      const score = jaccard * 0.6 + (meters !== null ? (meters < 150 ? 0.4 : meters < 500 ? 0.2 : 0) : 0) + (stay.area && stay.area === o.area ? 0.1 : 0) + (sameAddress ? 0.2 : 0);
      if (score < 0.5) continue;
      const [x, y] = [stay.id, o.id].sort();
      found += (await this.prisma.externalStayMatchCandidate.createMany({ data: [{ stayAId: x!, stayBId: y!, score: Math.round(Math.min(1, score) * 100) / 100, signals: { titleSimilarity: Math.round(jaccard * 100) / 100, distanceMeters: meters === null ? null : Math.round(meters), sameArea: Boolean(stay.area && stay.area === o.area), sameAddress, city: stay.city } }], skipDuplicates: true })).count;
    }
    if (found) await this.raiseTask(stay.source, "DUPLICATE_CANDIDATE", `travel:duplicates:${new Date().toISOString().slice(0, 10)}`, "بررسی اقامتگاه‌های احتمالاً تکراری بین منابع", "New cross-source duplicate candidates are waiting for review (never merged automatically).", AdminPriority.LOW, { type: "EXTERNAL_STAY_MATCH", id: "queue" });
  }

  // ------------------------------------------------------------------ prices (always contextual)
  async recordPrice(
    stay: ExternalStay & { source: ExternalTravelSource },
    ctx: { checkIn: string | null; checkOut: string | null; guests: number; pets?: number },
    q: { priceIrr: number | null; oldPriceIrr?: number | null; discountPercent?: number | null; priceBasis: ExternalPriceBasis; availability: ExternalAvailability; priceType?: ExternalPriceType },
    by: { observedBy: ExternalObservedBy; adminUserId?: string; observedAt?: Date; runId?: string | null },
  ) {
    const observedAt = by.observedAt ?? new Date();
    const priceType = q.priceType ?? (q.priceIrr === null ? ExternalPriceType.UNKNOWN : ExternalPriceType.EXACT);
    // Shown with its number only while ≤ priceAgingHours old; afterwards STALE (no number).
    const expiresAt = new Date(observedAt.getTime() + stay.source.priceAgingHours * 3600e3);
    const contentHash = hash([q.priceIrr, q.oldPriceIrr ?? null, q.discountPercent ?? null, q.priceBasis, q.availability, priceType]);
    const ctxWhere = { stayId: stay.id, checkIn: ctx.checkIn ? new Date(ctx.checkIn) : null, checkOut: ctx.checkOut ? new Date(ctx.checkOut) : null, guests: ctx.guests, priceType };
    const latest = await this.prisma.externalStayPriceSnapshot.findFirst({ where: ctxWhere, orderBy: { observedAt: "desc" } });
    if (latest && latest.contentHash === contentHash) {
      return this.prisma.externalStayPriceSnapshot.update({ where: { id: latest.id }, data: { lastConfirmedAt: observedAt, expiresAt } });
    }
    const row = await this.prisma.externalStayPriceSnapshot.create({ data: { ...ctxWhere, pets: ctx.pets ?? null, priceIrr: q.priceIrr, oldPriceIrr: q.oldPriceIrr ?? null, discountPercent: q.discountPercent ?? null, priceBasis: q.priceBasis, availability: q.availability, observedAt, lastConfirmedAt: observedAt, expiresAt, observedBy: by.observedBy, observedByAdminId: by.adminUserId ?? null, contentHash, currency: "IRR", runId: by.runId ?? null } });
    if (latest && latest.priceIrr !== q.priceIrr) await this.change(stay.id, ExternalChangeKind.PRICE_CHANGED, { context: ctx, priceType, from: latest.priceIrr, to: q.priceIrr }, { runId: by.runId, field: "price", oldValue: latest.priceIrr, newValue: q.priceIrr });
    if (q.availability === ExternalAvailability.SOURCE_REPORTED_UNAVAILABLE && latest?.availability !== q.availability) await this.change(stay.id, ExternalChangeKind.UNAVAILABLE, { context: ctx }, { runId: by.runId });
    // Bounded history: the latest 30 distinct observations per context.
    const old = await this.prisma.externalStayPriceSnapshot.findMany({ where: ctxWhere, orderBy: { observedAt: "desc" }, skip: 30, select: { id: true } });
    if (old.length) await this.prisma.externalStayPriceSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return row;
  }

  /** Cached price for exactly this context; one bounded live quote only when the source supports it and its circuit is closed. */
  async quote(stayId: string, ctx: QuoteContext) {
    const stay = await this.prisma.externalStay.findUnique({ where: { id: stayId }, include: { source: true } });
    if (!stay || stay.publishState !== ExternalPublishState.PUBLISHED || stay.status === ExternalStayStatus.HIDDEN) throw new NotFoundApiException("External stay");
    const cached = await this.latestPrice(stayId, ctx);
    if (cached && cached.lastConfirmedAt.getTime() + stay.source.priceTtlMinutes * 60e3 > Date.now()) return this.priceView(cached, ctx, stay.source);
    const adapter = this.adapters.get(stay.source.code);
    const canRefresh = adapter?.quote && adapter.parserReady && stay.source.mode === ExternalSourceMode.AUTOMATED && stay.source.automationStatus === ExternalAutomationStatus.SUPPORTED && !(stay.source.circuitOpenUntil && stay.source.circuitOpenUntil > new Date());
    if (canRefresh) {
      try {
        const live = this.context({ ...stay.source, maxRequestsPerRun: 1 });
        const q = await Promise.race([adapter.quote!(live, stay.sourceListingId, ctx), new Promise<never>((_, rej) => setTimeout(() => rej(new AdapterError("TIMEOUT", "quote timeout")), Math.min(stay.source.timeoutMs, 5000)))]);
        return this.priceView(await this.recordPrice(stay, ctx, { priceIrr: q.amount, oldPriceIrr: q.oldAmount ?? null, discountPercent: q.discountPercent ?? null, priceBasis: q.priceBasis as ExternalPriceBasis, availability: q.availability as ExternalAvailability, priceType: q.priceType as ExternalPriceType }, { observedBy: ExternalObservedBy.ADAPTER }), ctx, stay.source);
      } catch (e) {
        this.logger.warn(`Quote refresh failed for ${stay.source.code}: ${e instanceof AdapterError ? e.category : "error"}`);
      }
    }
    return this.priceView(cached, ctx, stay.source);
  }

  latestPrice(stayId: string, ctx: QuoteContext) {
    return this.prisma.externalStayPriceSnapshot.findFirst({ where: { stayId, checkIn: new Date(ctx.checkIn), checkOut: new Date(ctx.checkOut), guests: ctx.guests, priceType: { not: ExternalPriceType.FROM_PRICE } }, orderBy: { observedAt: "desc" } });
  }

  latestFromPrice(stayId: string) {
    return this.prisma.externalStayPriceSnapshot.findFirst({ where: { stayId, priceType: ExternalPriceType.FROM_PRICE }, orderBy: { lastConfirmedAt: "desc" } });
  }

  /**
   * state: DATES_REQUIRED / NO_PRICE_FOR_DATES / FRESH (number shown — freshness FRESH or AGING) / STALE (no number).
   * freshness: FRESH ≤ priceFreshHours, AGING ≤ priceAgingHours, STALE beyond, UNKNOWN never observed. Never "real time".
   */
  priceView(snap: Prisma.ExternalStayPriceSnapshotGetPayload<object> | null, ctx: QuoteContext | null, source?: Pick<ExternalTravelSource, "priceFreshHours" | "priceAgingHours">) {
    const cfg = source ?? { priceFreshHours: 24, priceAgingHours: 72 };
    if (!ctx) return { state: "DATES_REQUIRED" as const, freshness: "UNKNOWN" as const };
    if (!snap) return { state: "NO_PRICE_FOR_DATES" as const, freshness: "UNKNOWN" as const, context: ctx, availability: { state: ExternalAvailability.UNKNOWN, observedAt: null } };
    const freshness = freshnessOf(snap.lastConfirmedAt, cfg);
    const shown = freshness === "FRESH" || freshness === "AGING";
    return {
      state: !shown ? ("STALE" as const) : snap.priceIrr === null ? ("NO_PRICE_FOR_DATES" as const) : ("FRESH" as const),
      freshness,
      context: ctx,
      priceType: snap.priceType,
      currency: snap.currency,
      priceIrr: shown ? snap.priceIrr : null,
      oldPriceIrr: shown ? snap.oldPriceIrr : null,
      discountPercent: shown ? snap.discountPercent : null,
      priceBasis: snap.priceBasis,
      observedAt: snap.lastConfirmedAt.toISOString(),
      expiresAt: snap.expiresAt.toISOString(),
      availability: { state: shown ? snap.availability : ExternalAvailability.UNKNOWN, observedAt: snap.lastConfirmedAt.toISOString() },
      observedBy: snap.observedBy,
    };
  }

  // ------------------------------------------------------------------ health check (low frequency, few requests)
  async healthCheck(code: string) {
    const s = await this.source(code);
    const adapter = this.adapters.get(code);
    if (!adapter) throw new ValidationApiException({ field: "code", reason: "NO_ADAPTER" });
    const r = await adapter.healthCheck(this.context({ ...s, maxRequestsPerRun: 2 }));
    const blocked = r.category === "BLOCKED_EXTERNAL";
    const notes = { ...((s.discoveryNotes as Record<string, unknown> | null) ?? {}), lastHealthCheck: { at: new Date().toISOString(), ok: r.ok, category: r.category ?? null, schemaOk: r.schemaOk ?? null, url: r.checkedUrl ?? null, detail: r.detail.slice(0, 300) } };
    await this.prisma.externalTravelSource.update({
      where: { id: s.id },
      data: {
        discoveryNotes: notes as Prisma.InputJsonValue,
        ...(blocked ? { accessStatus: ExternalSourceAccessStatus.BLOCKED_BY_SOURCE, health: ExternalSourceHealth.BLOCKED, healthReason: r.detail.slice(0, 300) } : {}),
      },
    });
    if (blocked) await this.raiseTask(s, "SOURCE_BLOCKED", `travel:${code}:blocked:${new Date().toISOString().slice(0, 10)}`, `منبع ${s.nameFa} دسترسی خودکار را رد کرد`, `Health check: ${r.detail}`, AdminPriority.HIGH);
    return r;
  }

  /** Raw excerpts are evidence for a short while only; normalized history stays. */
  async pruneRawExcerpts(now = new Date()) {
    const sources = await this.prisma.externalTravelSource.findMany({ select: { id: true, rawRetentionDays: true } });
    let n = 0;
    for (const s of sources) n += (await this.prisma.externalStayObservation.updateMany({ where: { stay: { sourceId: s.id }, observedAt: { lt: new Date(now.getTime() - s.rawRetentionDays * DAY) }, NOT: { rawExcerpt: { equals: Prisma.DbNull } } }, data: { rawExcerpt: Prisma.DbNull } })).count;
    return n;
  }

  // ------------------------------------------------------------------ manual source records (staff)
  async manualUpsert(adminUserId: string, input: { sourceCode: string; sourceUrl: string; sourceListingId?: string; title: string; city: string; province?: string; area?: string; stayType?: string; capacity?: number; petEvidenceType: PetEvidenceType; petEvidenceText: string; petPolicy?: AdapterListing["petPolicy"]; instantBooking?: boolean; imageUrls?: string[] }) {
    const source = await this.source(input.sourceCode);
    if (source.mode === ExternalSourceMode.DISABLED) throw new ValidationApiException({ field: "sourceCode", reason: "SOURCE_DISABLED" });
    if (input.petEvidenceType === PetEvidenceType.AUTHORIZED_FEED) throw new ValidationApiException({ field: "petEvidenceType", reason: "FEED_EVIDENCE_IS_ADAPTER_ONLY" });
    if (!input.petEvidenceText?.trim()) throw new ValidationApiException({ field: "petEvidence", reason: "NO_PET_EVIDENCE" });
    const url = assertSourceUrl(input.sourceUrl, source.allowedHosts);
    const sourceListingId = input.sourceListingId?.trim() || url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || url.pathname;
    const p = input.petPolicy ?? {};
    const yes = (v: unknown) => (v === true ? true : v === false ? false : null);
    const pet: PetPolicyObservation = { status: PetPolicyStatus.CONFIRMED_ALLOWED, evidenceSource: input.petEvidenceType, evidenceText: input.petEvidenceText.trim().slice(0, 300), evidencePath: "manual-entry", dogsAllowed: yes(p.dogs), catsAllowed: yes(p.cats), maxPets: typeof p.maxPets === "number" ? p.maxPets : null, petFeeIrr: typeof p.extraFeeIrr === "number" ? p.extraFeeIrr : null };
    const result = await this.ingest(source, { runId: null, mode: ExternalEntryMode.MANUAL, adminUserId, sourceType: ExternalSourceType.MANUAL_ENTRY }, { normalized: { sourceListingId, sourceUrl: url.toString(), title: input.title, city: input.city, province: input.province, area: input.area, stayType: input.stayType, capacity: input.capacity, instantBooking: input.instantBooking }, pet, prices: [], images: input.imageUrls ?? [], rawPayload: undefined });
    const stay = await this.prisma.externalStay.findUniqueOrThrow({ where: { sourceId_sourceListingId: { sourceId: source.id, sourceListingId } } });
    return { result, stayId: stay.id };
  }

  async setOverride(adminUserId: string, stayId: string, field: (typeof OVERRIDABLE)[number], value: string | null) {
    const stay = await this.prisma.externalStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundApiException("External stay");
    const overrides = { ...((stay.overrides as Overrides | null) ?? {}) };
    if (value === null) delete overrides[field];
    else overrides[field] = { sourceValue: (stay as Record<string, unknown>)[field] ?? null, overrideValue: value, adminUserId, at: new Date().toISOString() };
    await this.prisma.externalStay.update({ where: { id: stayId }, data: { overrides: overrides as Prisma.InputJsonValue } });
    await this.change(stayId, ExternalChangeKind.OVERRIDE_SET, { field, overridden: value !== null });
    return overrides;
  }
}
