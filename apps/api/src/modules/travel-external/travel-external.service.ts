import { Inject, Injectable, Logger } from "@nestjs/common";
import { ExternalAutomationStatus, ExternalAvailability, ExternalChangeKind, ExternalEntryMode, ExternalImagePolicy, ExternalObservedBy, ExternalPriceBasis, ExternalPublishState, ExternalSourceHealth, ExternalSourceMode, ExternalStayStatus, ExternalSyncKind, ExternalSyncStatus, PetEvidenceType, Prisma, type ExternalStay, type ExternalTravelSource } from "@prisma/client";
import type Redis from "ioredis";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { validateSourceUrl, SourceFetchError } from "./safe-fetch";
import { AdapterError, type AdapterListing, type AdapterQuoteContext, type TravelSourceAdapter } from "./adapters/travel-source-adapter";
import { TRAVEL_SOURCE_ADAPTERS } from "./adapters/adapter-registry";

/** Key-order-independent (Postgres jsonb reorders object keys), Date-safe hash for change detection. */
const stable = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(stable(v))).digest("hex").slice(0, 32);
/** Source URLs are user/adapter input: a rejected URL is a 400, never a 500. */
export function assertSourceUrl(raw: string, hosts: string[]): URL {
  try {
    return validateSourceUrl(raw, hosts);
  } catch (e) {
    throw new ValidationApiException({ field: "sourceUrl", reason: e instanceof SourceFetchError ? e.category : "INVALID_URL" });
  }
}
const DAY = 86400e3;
export const PET_POLICY_KEYS = ["dogs", "cats", "maxPets", "sizeLimit", "indoor", "extraFeeIrr", "approvalRequired"] as const;
export const OVERRIDABLE = ["title", "city", "area", "stayType", "petPolicySummary", "descriptionSummary"] as const;
type Overrides = Partial<Record<(typeof OVERRIDABLE)[number], { sourceValue: unknown; overrideValue: string; adminUserId: string; at: string }>>;

export function normalizePetPolicy(p: AdapterListing["petPolicy"] = {}) {
  return Object.fromEntries(PET_POLICY_KEYS.map((k) => [k, p?.[k] ?? "UNKNOWN"]));
}
/** A listing is publishable only with a valid source URL, explicit pet evidence, a title and a known freshness. */
export function publishBlockers(stay: Pick<ExternalStay, "sourceUrl" | "title" | "petEvidenceText" | "petEvidenceType" | "lastCheckedAt">, source: Pick<ExternalTravelSource, "allowedHosts">): string[] {
  const out: string[] = [];
  try { validateSourceUrl(stay.sourceUrl, source.allowedHosts); } catch { out.push("SOURCE_URL_INVALID"); }
  if (!stay.title?.trim()) out.push("TITLE_MISSING");
  if (!stay.petEvidenceText?.trim() || !stay.petEvidenceType) out.push("PET_EVIDENCE_MISSING");
  if (!stay.lastCheckedAt) out.push("FRESHNESS_UNKNOWN");
  return out;
}

/**
 * TRAVEL-EXT pipeline: Discover → Fetch → Normalize → Validate → Deduplicate → Snapshot → Publish, plus date-aware
 * quoting with a per-context cache. Every network touch goes through an adapter (and safeFetch); a source failure never
 * propagates beyond this service — the caller gets cached data or an explicit unavailable state.
 */
@Injectable()
export class TravelExternalService {
  private readonly logger = new Logger(TravelExternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(TRAVEL_SOURCE_ADAPTERS) private readonly adapters: Map<string, TravelSourceAdapter>,
  ) {}

  async source(code: string) {
    const s = await this.prisma.externalTravelSource.findUnique({ where: { code } });
    if (!s) throw new NotFoundApiException("Travel source");
    return s;
  }

  // ------------------------------------------------------------------ sync
  /** Stuck STARTED runs (worker restart, crash) become ABANDONED so nothing is locked forever. */
  async abandonStuckRuns(now = new Date()) {
    const sources = await this.prisma.externalTravelSource.findMany({ select: { id: true, timeoutMs: true, maxRequestsPerRun: true } });
    let n = 0;
    for (const s of sources) {
      const cutoff = new Date(now.getTime() - Math.max(15 * 60e3, 2 * s.timeoutMs * (s.maxRequestsPerRun + 2)));
      n += (await this.prisma.externalSyncRun.updateMany({ where: { sourceId: s.id, status: ExternalSyncStatus.STARTED, startedAt: { lt: cutoff } }, data: { status: ExternalSyncStatus.ABANDONED, finishedAt: now } })).count;
    }
    return n;
  }

  async runSync(code: string, kind: ExternalSyncKind, opts: { adminUserId?: string; listingId?: string } = {}) {
    const source = await this.source(code);
    await this.abandonStuckRuns();
    const lockKey = `travel-ext-sync:${code}`;
    const ttl = Math.max(60_000, source.timeoutMs * (source.maxRequestsPerRun + 2));
    const token = randomUUID();
    if ((await this.redis.set(lockKey, token, "PX", ttl, "NX")) !== "OK") throw new ValidationApiException({ field: "source", reason: "SYNC_ALREADY_RUNNING" });
    const run = await this.prisma.externalSyncRun.create({ data: { sourceId: source.id, kind, triggeredByAdminId: opts.adminUserId ?? null } });
    const counters = { itemsScanned: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };
    const errors: Record<string, number> = {};
    const bump = (cat: string) => { errors[cat] = (errors[cat] ?? 0) + 1; };
    let status: ExternalSyncStatus = ExternalSyncStatus.SUCCEEDED;
    try {
      const adapter = this.adapters.get(code);
      if (source.mode !== ExternalSourceMode.AUTOMATED || source.automationStatus !== ExternalAutomationStatus.SUPPORTED || !adapter) {
        bump(source.automationStatus === ExternalAutomationStatus.BLOCKED_EXTERNAL ? "BLOCKED_EXTERNAL" : "NOT_SUPPORTED");
        status = ExternalSyncStatus.FAILED;
      } else if (source.circuitOpenUntil && source.circuitOpenUntil > new Date()) {
        bump("CIRCUIT_OPEN");
        status = ExternalSyncStatus.CANCELLED;
      } else {
        const scope = { cities: source.cityScopes, limit: source.maxRequestsPerRun };
        const listings = opts.listingId
          ? [await adapter.fetchListing((await this.prisma.externalStay.findFirstOrThrow({ where: { id: opts.listingId, sourceId: source.id } })).sourceListingId)]
          : await adapter.discover(scope);
        const seen = new Set<string>();
        for (const l of listings) {
          counters.itemsScanned++;
          try {
            const r = await this.upsertFromSource(source, l, ExternalEntryMode.AUTOMATED, null);
            counters[r]++;
            seen.add(l.sourceListingId);
          } catch (e) {
            counters.failed++;
            bump(e instanceof ValidationApiException ? String((e.details as { reason?: string })?.reason ?? "INVALID") : "NORMALIZE_ERROR");
          }
        }
        if (kind === ExternalSyncKind.FULL) await this.reconcileMissing(source, adapter, seen, bump);
        status = counters.failed && counters.itemsScanned > counters.failed ? ExternalSyncStatus.PARTIAL : counters.failed ? ExternalSyncStatus.FAILED : ExternalSyncStatus.SUCCEEDED;
      }
    } catch (e) {
      const cat = e instanceof AdapterError ? e.category : e instanceof SourceFetchError ? e.category : "UNEXPECTED";
      bump(cat);
      status = ExternalSyncStatus.FAILED;
      if (!(e instanceof AdapterError) && !(e instanceof SourceFetchError)) this.logger.error(`Travel sync ${code} failed`, e instanceof Error ? e.stack : undefined);
    } finally {
      await this.prisma.externalSyncRun.update({ where: { id: run.id }, data: { ...counters, status, finishedAt: new Date(), errorCategories: errors } });
      await this.recordHealth(source, status, Object.keys(errors)[0]);
      if ((await this.redis.get(lockKey)) === token) await this.redis.del(lockKey);
    }
    return this.prisma.externalSyncRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  /** Circuit breaker + health: repeated failures open the circuit with exponential backoff (max 24 h); success closes it. */
  private async recordHealth(source: ExternalTravelSource, status: ExternalSyncStatus, category?: string) {
    const now = new Date();
    if (status === ExternalSyncStatus.SUCCEEDED || status === ExternalSyncStatus.PARTIAL) {
      await this.prisma.externalTravelSource.update({ where: { id: source.id }, data: { lastRunAt: now, lastSuccessAt: now, consecutiveFailures: 0, circuitOpenUntil: null, health: status === ExternalSyncStatus.PARTIAL ? ExternalSourceHealth.DEGRADED : ExternalSourceHealth.HEALTHY, healthReason: status === ExternalSyncStatus.PARTIAL ? "Some items failed validation" : null, lastErrorCategory: null } });
      return;
    }
    if (status === ExternalSyncStatus.CANCELLED) { await this.prisma.externalTravelSource.update({ where: { id: source.id }, data: { lastRunAt: now } }); return; }
    const failures = source.consecutiveFailures + 1;
    const blocked = category === "BLOCKED_EXTERNAL" || category === "BLOCKED_BY_SOURCE";
    const notSupported = category === "NOT_SUPPORTED";
    await this.prisma.externalTravelSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: now, lastFailureAt: now, lastErrorCategory: category ?? "UNKNOWN", consecutiveFailures: failures,
        circuitOpenUntil: notSupported ? null : new Date(now.getTime() + Math.min(DAY, 2 ** Math.min(failures, 10) * 60e3)),
        health: source.mode === ExternalSourceMode.DISABLED ? ExternalSourceHealth.DISABLED : blocked || failures >= 3 ? ExternalSourceHealth.BLOCKED : ExternalSourceHealth.DEGRADED,
        healthReason: blocked ? "Source rejects automated access (no bypass attempted)" : notSupported ? "No permitted automated retrieval mechanism" : `Last run failed: ${category}`,
      },
    });
  }

  /** Listings not seen in a full sync are re-checked one by one; only a confirmed removal marks SOURCE_REMOVED. */
  private async reconcileMissing(source: ExternalTravelSource, adapter: TravelSourceAdapter, seen: Set<string>, bump: (c: string) => void) {
    const known = await this.prisma.externalStay.findMany({ where: { sourceId: source.id, entryMode: ExternalEntryMode.AUTOMATED, status: { in: [ExternalStayStatus.ACTIVE, ExternalStayStatus.STALE] }, ...(source.cityScopes.length ? { city: { in: source.cityScopes } } : {}) }, take: source.maxRequestsPerRun });
    for (const stay of known.filter((k) => !seen.has(k.sourceListingId))) {
      try {
        await this.upsertFromSource(source, await adapter.fetchListing(stay.sourceListingId), ExternalEntryMode.AUTOMATED, null);
      } catch (e) {
        if (e instanceof AdapterError && e.category === "LISTING_REMOVED") {
          await this.prisma.externalStay.update({ where: { id: stay.id }, data: { status: ExternalStayStatus.SOURCE_REMOVED } });
          await this.change(stay.id, ExternalChangeKind.SOURCE_REMOVED, {});
        } else {
          await this.prisma.externalStay.update({ where: { id: stay.id }, data: { status: ExternalStayStatus.STALE } });
          bump(e instanceof AdapterError ? e.category : "RECHECK_FAILED");
        }
      }
    }
  }

  private change(stayId: string, kind: ExternalChangeKind, detail: Record<string, unknown>) {
    return this.prisma.externalStayChange.create({ data: { stayId, kind, detail: detail as Prisma.InputJsonValue } });
  }

  /** Validate + normalize + idempotent upsert on (source, sourceListingId) with change detection. */
  async upsertFromSource(source: ExternalTravelSource, l: AdapterListing, mode: ExternalEntryMode, adminUserId: string | null): Promise<"created" | "updated" | "unchanged"> {
    if (!l.petEvidence?.text?.trim()) throw new ValidationApiException({ field: "petEvidence", reason: "NO_PET_EVIDENCE" });
    assertSourceUrl(l.sourceUrl, source.allowedHosts);
    if (!l.title?.trim() || !l.city?.trim() || !l.sourceListingId?.trim()) throw new ValidationApiException({ field: "listing", reason: "REQUIRED_FIELD_MISSING" });
    const now = new Date();
    const data = {
      sourceUrl: l.sourceUrl, title: l.title.trim().slice(0, 200), city: l.city.trim(), province: l.province ?? null, area: l.area ?? null, stayType: l.stayType ?? null,
      latitude: l.latitude ?? null, longitude: l.longitude ?? null, capacity: l.capacity ?? null, bedrooms: l.bedrooms ?? null, beds: l.beds ?? null,
      petFriendly: true, petEvidenceType: l.petEvidence.type, petEvidenceText: l.petEvidence.text.trim().slice(0, 500), petPolicy: normalizePetPolicy(l.petPolicy) as Prisma.InputJsonValue,
      rating: l.rating ?? null, reviewCount: l.reviewCount ?? null, instantBooking: l.instantBooking ?? null, descriptionSummary: l.descriptionSummary?.slice(0, 500) ?? null,
      lastSourceUpdateAt: l.lastSourceUpdateAt ?? null,
    };
    const existing = await this.prisma.externalStay.findUnique({ where: { sourceId_sourceListingId: { sourceId: source.id, sourceListingId: l.sourceListingId } } });
    if (!existing) {
      const created = await this.prisma.externalStay.create({ data: { ...data, sourceId: source.id, sourceListingId: l.sourceListingId, petEvidenceObservedAt: now, lastCheckedAt: now, lastSuccessfulSyncAt: mode === ExternalEntryMode.AUTOMATED ? now : null, entryMode: mode, createdByAdminId: adminUserId, publishState: ExternalPublishState.DRAFT } });
      await this.replaceImages(source, created.id, l.imageUrls ?? []);
      if (source.autoPublish && !publishBlockers(created, source).length) await this.prisma.externalStay.update({ where: { id: created.id }, data: { publishState: ExternalPublishState.PUBLISHED } });
      await this.findMatchCandidates(created.id);
      return "created";
    }
    const before = { url: existing.sourceUrl, pet: hash([existing.petEvidenceText, existing.petPolicy]) };
    const projected = Object.fromEntries(Object.keys(data).map((k) => [k, (existing as Record<string, unknown>)[k] ?? null]));
    const changed = hash(data) !== hash(projected) || existing.status !== ExternalStayStatus.ACTIVE;
    await this.prisma.externalStay.update({ where: { id: existing.id }, data: { ...data, status: existing.status === ExternalStayStatus.HIDDEN ? ExternalStayStatus.HIDDEN : ExternalStayStatus.ACTIVE, lastCheckedAt: now, lastSuccessfulSyncAt: mode === ExternalEntryMode.AUTOMATED ? now : existing.lastSuccessfulSyncAt, ...(before.pet !== hash([data.petEvidenceText, data.petPolicy]) ? { petEvidenceObservedAt: now } : {}) } });
    if (before.url !== data.sourceUrl) await this.change(existing.id, ExternalChangeKind.URL_CHANGED, { from: before.url, to: data.sourceUrl });
    if (before.pet !== hash([data.petEvidenceText, data.petPolicy])) await this.change(existing.id, ExternalChangeKind.PET_POLICY_CHANGED, { petPolicy: data.petPolicy as unknown as Record<string, unknown> });
    if (await this.replaceImages(source, existing.id, l.imageUrls ?? [])) await this.change(existing.id, ExternalChangeKind.IMAGE_CHANGED, {});
    return changed ? "updated" : "unchanged";
  }

  /** Image references only (no download) and only if the source policy allows referencing; URLs must be allowlisted. */
  private async replaceImages(source: ExternalTravelSource, stayId: string, urls: string[]): Promise<boolean> {
    if (source.imagePolicy === ExternalImagePolicy.NO_IMAGES) return false;
    const valid = urls.filter((u) => { try { validateSourceUrl(u, source.allowedHosts); return true; } catch { return false; } }).slice(0, 8);
    const current = await this.prisma.externalStayImage.findMany({ where: { stayId }, orderBy: { position: "asc" } });
    if (hash(current.map((c) => c.sourceImageUrl)) === hash(valid)) {
      await this.prisma.externalStayImage.updateMany({ where: { stayId }, data: { lastVerifiedAt: new Date() } });
      return false;
    }
    await this.prisma.$transaction([this.prisma.externalStayImage.deleteMany({ where: { stayId } }), this.prisma.externalStayImage.createMany({ data: valid.map((u, i) => ({ stayId, sourceImageUrl: u, position: i, lastVerifiedAt: new Date() })) })]);
    return current.length > 0;
  }

  // ------------------------------------------------------------------ cross-source matching (never auto-merged)
  async findMatchCandidates(stayId: string) {
    const stay = await this.prisma.externalStay.findUniqueOrThrow({ where: { id: stayId } });
    const others = await this.prisma.externalStay.findMany({ where: { city: stay.city, sourceId: { not: stay.sourceId }, status: { not: ExternalStayStatus.HIDDEN } }, take: 200 });
    const tokens = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));
    const a = tokens(stay.title);
    for (const o of others) {
      const b = tokens(o.title);
      const jaccard = [...a].filter((w) => b.has(w)).length / Math.max(1, new Set([...a, ...b]).size);
      const meters = stay.latitude != null && o.latitude != null && stay.longitude != null && o.longitude != null ? Math.hypot((stay.latitude - o.latitude) * 111_000, (stay.longitude - o.longitude) * 111_000 * Math.cos((stay.latitude * Math.PI) / 180)) : null;
      const score = jaccard * 0.6 + (meters !== null ? (meters < 150 ? 0.4 : meters < 500 ? 0.2 : 0) : 0) + (stay.area && stay.area === o.area ? 0.1 : 0);
      if (score < 0.5) continue;
      const [x, y] = [stay.id, o.id].sort();
      await this.prisma.externalStayMatchCandidate.createMany({ data: [{ stayAId: x!, stayBId: y!, score: Math.round(score * 100) / 100, signals: { titleSimilarity: Math.round(jaccard * 100) / 100, distanceMeters: meters === null ? null : Math.round(meters), sameArea: Boolean(stay.area && stay.area === o.area) } }], skipDuplicates: true });
    }
  }

  // ------------------------------------------------------------------ prices (date-aware)
  async recordPrice(stay: ExternalStay & { source: ExternalTravelSource }, ctx: AdapterQuoteContext, q: { priceIrr: number | null; oldPriceIrr?: number | null; discountPercent?: number | null; priceBasis: ExternalPriceBasis; availability: ExternalAvailability }, by: { observedBy: ExternalObservedBy; adminUserId?: string; observedAt?: Date }) {
    const observedAt = by.observedAt ?? new Date();
    const expiresAt = new Date(observedAt.getTime() + stay.source.priceTtlMinutes * 60e3);
    const contentHash = hash([q.priceIrr, q.oldPriceIrr ?? null, q.discountPercent ?? null, q.priceBasis, q.availability]);
    const ctxWhere = { stayId: stay.id, checkIn: new Date(ctx.checkIn), checkOut: new Date(ctx.checkOut), guests: ctx.guests };
    const latest = await this.prisma.externalStayPriceSnapshot.findFirst({ where: ctxWhere, orderBy: { observedAt: "desc" } });
    if (latest && latest.contentHash === contentHash) {
      // Unchanged value: extend the existing observation instead of storing a duplicate row.
      return this.prisma.externalStayPriceSnapshot.update({ where: { id: latest.id }, data: { lastConfirmedAt: observedAt, expiresAt } });
    }
    const row = await this.prisma.externalStayPriceSnapshot.create({ data: { ...ctxWhere, pets: ctx.pets ?? null, priceIrr: q.priceIrr, oldPriceIrr: q.oldPriceIrr ?? null, discountPercent: q.discountPercent ?? null, priceBasis: q.priceBasis, availability: q.availability, observedAt, lastConfirmedAt: observedAt, expiresAt, observedBy: by.observedBy, observedByAdminId: by.adminUserId ?? null, contentHash } });
    if (latest && latest.priceIrr !== q.priceIrr) await this.change(stay.id, ExternalChangeKind.PRICE_CHANGED, { context: ctx, from: latest.priceIrr, to: q.priceIrr });
    if (q.availability === ExternalAvailability.SOURCE_REPORTED_UNAVAILABLE && latest?.availability !== q.availability) await this.change(stay.id, ExternalChangeKind.UNAVAILABLE, { context: ctx });
    // Bounded history: keep the latest 30 distinct observations per context.
    const old = await this.prisma.externalStayPriceSnapshot.findMany({ where: ctxWhere, orderBy: { observedAt: "desc" }, skip: 30, select: { id: true } });
    if (old.length) await this.prisma.externalStayPriceSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return row;
  }

  /** Cached price for exactly this context; a bounded live refresh only when the source supports it and is healthy. */
  async quote(stayId: string, ctx: AdapterQuoteContext) {
    const stay = await this.prisma.externalStay.findUnique({ where: { id: stayId }, include: { source: true } });
    if (!stay || stay.publishState !== ExternalPublishState.PUBLISHED || stay.status === ExternalStayStatus.HIDDEN) throw new NotFoundApiException("External stay");
    const cached = await this.latestPrice(stayId, ctx);
    if (cached && cached.expiresAt > new Date()) return this.priceView(cached, ctx);
    const adapter = this.adapters.get(stay.source.code);
    const canRefresh = adapter && stay.source.mode === ExternalSourceMode.AUTOMATED && stay.source.automationStatus === ExternalAutomationStatus.SUPPORTED && !(stay.source.circuitOpenUntil && stay.source.circuitOpenUntil > new Date());
    if (canRefresh) {
      try {
        const q = await Promise.race([adapter.quote(stay.sourceListingId, ctx), new Promise<never>((_, rej) => setTimeout(() => rej(new AdapterError("TIMEOUT", "quote timeout")), Math.min(stay.source.timeoutMs, 5000)))]);
        return this.priceView(await this.recordPrice(stay, ctx, { ...q, priceBasis: q.priceBasis as ExternalPriceBasis, availability: q.availability as ExternalAvailability }, { observedBy: ExternalObservedBy.ADAPTER }), ctx);
      } catch (e) {
        this.logger.warn(`Quote refresh failed for ${stay.source.code}: ${e instanceof AdapterError ? e.category : "error"}`);
      }
    }
    return cached ? this.priceView(cached, ctx) : this.priceView(null, ctx);
  }

  latestPrice(stayId: string, ctx: AdapterQuoteContext) {
    return this.prisma.externalStayPriceSnapshot.findFirst({ where: { stayId, checkIn: new Date(ctx.checkIn), checkOut: new Date(ctx.checkOut), guests: ctx.guests }, orderBy: { observedAt: "desc" } });
  }

  /** FRESH shows the number with its timestamp; STALE never shows a number; NO_PRICE_FOR_DATES when nothing was observed. */
  priceView(snap: Prisma.ExternalStayPriceSnapshotGetPayload<object> | null, ctx: AdapterQuoteContext | null) {
    if (!ctx) return { state: "DATES_REQUIRED" as const };
    if (!snap) return { state: "NO_PRICE_FOR_DATES" as const, context: ctx };
    const fresh = snap.expiresAt > new Date();
    return {
      // A fresh observation in which the source gave no price is still "no price for these dates", with its timestamp.
      state: !fresh ? ("STALE" as const) : snap.priceIrr === null ? ("NO_PRICE_FOR_DATES" as const) : ("FRESH" as const),
      context: ctx,
      priceIrr: fresh ? snap.priceIrr : null,
      oldPriceIrr: fresh ? snap.oldPriceIrr : null,
      discountPercent: fresh ? snap.discountPercent : null,
      priceBasis: snap.priceBasis,
      observedAt: snap.lastConfirmedAt.toISOString(),
      expiresAt: snap.expiresAt.toISOString(),
      availability: { state: fresh ? snap.availability : ExternalAvailability.UNKNOWN, observedAt: snap.lastConfirmedAt.toISOString() },
      observedBy: snap.observedBy,
    };
  }

  // ------------------------------------------------------------------ manual source records (staff)
  async manualUpsert(adminUserId: string, input: { sourceCode: string; sourceUrl: string; sourceListingId?: string; title: string; city: string; province?: string; area?: string; stayType?: string; capacity?: number; petEvidenceType: PetEvidenceType; petEvidenceText: string; petPolicy?: AdapterListing["petPolicy"]; instantBooking?: boolean; imageUrls?: string[] }) {
    const source = await this.source(input.sourceCode);
    if (source.mode === ExternalSourceMode.DISABLED) throw new ValidationApiException({ field: "sourceCode", reason: "SOURCE_DISABLED" });
    if (input.petEvidenceType === PetEvidenceType.AUTHORIZED_FEED) throw new ValidationApiException({ field: "petEvidenceType", reason: "FEED_EVIDENCE_IS_ADAPTER_ONLY" });
    const url = assertSourceUrl(input.sourceUrl, source.allowedHosts);
    const sourceListingId = input.sourceListingId?.trim() || url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || url.pathname;
    const result = await this.upsertFromSource(source, { ...input, sourceListingId, sourceUrl: url.toString(), petEvidence: { type: input.petEvidenceType, text: input.petEvidenceText } }, ExternalEntryMode.MANUAL, adminUserId);
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
