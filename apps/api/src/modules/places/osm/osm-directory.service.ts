import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PetFriendlyPlaceStatus, PetSpecies, Prisma, type OsmSyncArea } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { registerWorker, trackWorker } from "../../../common/workers/worker-heartbeat";
import { mapOsmElement, overpassQuery, sameBusiness, type OsmElement, type OsmPlaceCandidate } from "./osm-mapping";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** Identify ourselves to Overpass as its usage policy asks. */
const USER_AGENT = "opetlife-directory/1.0 (+https://opetlife.ir)";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** One area per tick, ticks an hour apart: at most one Overpass request an hour (fair use). */
const TICK_MS = 60 * 60 * 1000;
/** Categories whose visit is plainly indoors / outdoors; anything else stays "not stated". */
const INDOOR_KINDS: ReadonlySet<string> = new Set(["VETERINARY", "PET_SHOP", "GROOMING", "BOARDING", "SHELTER"]);
const OUTDOOR_KINDS: ReadonlySet<string> = new Set(["PARK", "DOG_PARK"]);
const FETCH_TIMEOUT_MS = 120_000;
/** Largest Overpass answer we read (a city box is a few MB); the query asks Overpass for the same cap. */
export const MAX_OVERPASS_BYTES = 32 * 1024 * 1024;

export class OverpassRateLimitedError extends Error {}

/** The response body as text, refusing to read past `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Overpass answer too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

type Counts = { fetched: number; created: number; updated: number; linked: number; skipped: number; hidden: number };

/**
 * Seeds the places directory from OpenStreetMap (ODbL, attributed in the UI) per city bounding box and re-syncs each
 * area weekly. Imported listings are UNVERIFIED and labelled as such; a listing a business has claimed is never
 * overwritten; one that disappears from OSM is hidden (not deleted). On 429/504 the run stops and is retried later.
 */
@Injectable()
export class OsmDirectoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OsmDirectoryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("osm-directory-sync", TICK_MS);
    this.timer = setInterval(() => void trackWorker("osm-directory-sync", TICK_MS, () => this.tick()).catch((e) => this.logger.error("OSM directory tick failed", e)), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** A run is under way in this process (the admin "run now" refuses while it is). */
  isRunning(): boolean {
    return this.running;
  }

  /** The oldest active area that is due (never run, or last run over a week ago), claimed atomically. */
  async tick(now = new Date()): Promise<string | null> {
    if (this.running) return null;
    const due = await this.prisma.osmSyncArea.findFirst({
      where: { active: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - WEEK_MS) } }] },
      orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }, { city: "asc" }],
    });
    if (!due) return null;
    const claimed = await this.prisma.osmSyncArea.updateMany({ where: { id: due.id, lastRunAt: due.lastRunAt }, data: { lastRunAt: now } });
    if (!claimed.count) return null;
    return this.run(due);
  }

  /** Never rejects: every failure is recorded on the run (when it exists) and the area retried in about an hour. */
  async run(area: OsmSyncArea, requestedByAdminId?: string, fetchElements: (area: OsmSyncArea) => Promise<OsmElement[]> = (a) => this.fetchOverpass(a)): Promise<string | null> {
    this.running = true;
    const counts: Counts = { fetched: 0, created: 0, updated: 0, linked: 0, skipped: 0, hidden: 0 };
    let run: { id: string } | null = null;
    try {
      run = await this.prisma.osmImportRun.create({ data: { areaId: area.id, status: "RUNNING", requestedByAdminId }, select: { id: true } });
      const elements = await fetchElements(area);
      counts.fetched = elements.length;
      const seen = new Set<string>();
      for (const el of elements) {
        const candidate = mapOsmElement(el);
        if (!candidate) {
          counts.skipped++;
          continue;
        }
        seen.add(`${candidate.osmType}/${candidate.osmId}`);
        const outcome = await this.upsert(candidate, area);
        counts[outcome]++;
      }
      counts.hidden = await this.hideMissing(area, seen);
      await this.prisma.osmImportRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", ...counts, finishedAt: new Date() } });
      await this.prisma.osmSyncArea.update({ where: { id: area.id }, data: { lastRunAt: new Date() } });
      this.logger.log(`OSM directory ${area.city}: ${JSON.stringify(counts)}`);
    } catch (error) {
      const limited = error instanceof OverpassRateLimitedError;
      const message = error instanceof Error ? error.message.slice(0, 500) : String(error);
      if (run) await this.prisma.osmImportRun.update({ where: { id: run.id }, data: { status: limited ? "RATE_LIMITED" : "FAILED", ...counts, error: message, finishedAt: new Date() } }).catch(() => undefined);
      // Let a failed area come round again in an hour rather than in a week.
      await this.prisma.osmSyncArea.update({ where: { id: area.id }, data: { lastRunAt: new Date(Date.now() - WEEK_MS + TICK_MS) } }).catch(() => undefined);
      this.logger.warn(`OSM directory ${area.city} ${limited ? "rate-limited" : "failed"}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
    return run?.id ?? null;
  }

  private async fetchOverpass(area: OsmSyncArea): Promise<OsmElement[]> {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT, accept: "application/json" },
      body: `data=${encodeURIComponent(overpassQuery(area))}`,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "error",
    });
    if (res.status === 429 || res.status === 504) throw new OverpassRateLimitedError(`Overpass answered ${res.status}`);
    if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_OVERPASS_BYTES) throw new Error("Overpass answer too large");
    const body = JSON.parse(await readCapped(res, MAX_OVERPASS_BYTES)) as { elements?: OsmElement[]; remark?: string };
    if (body.remark && /runtime error|timed out|rate_limited/i.test(body.remark)) throw new OverpassRateLimitedError(body.remark.slice(0, 200));
    return (body.elements ?? []).filter((e) => e && (e.type === "node" || e.type === "way" || e.type === "relation"));
  }

  private async setLocation(tx: Prisma.TransactionClient, id: string, latitude: number, longitude: number) {
    await tx.$executeRaw`UPDATE pet_friendly_places SET location = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography WHERE id = ${id}::uuid`;
  }

  private async upsert(c: OsmPlaceCandidate, area: OsmSyncArea): Promise<"created" | "updated" | "linked" | "skipped"> {
    const tags = c.tags as unknown as Prisma.InputJsonValue;
    const existing = await this.prisma.petFriendlyPlace.findUnique({ where: { osmType_osmId: { osmType: c.osmType, osmId: c.osmId } } });
    const fields = {
      name: c.name,
      category: c.category,
      address: c.address,
      // The area name keeps the city filter consistent (OSM addr:city spellings vary); the raw tag stays in osmTags.
      city: area.city,
      province: area.province,
      latitude: c.latitude,
      longitude: c.longitude,
      phone: c.phone,
      website: c.website,
      leashRequired: c.leashRequired,
    };
    return this.prisma.$transaction(async (tx) => {
      if (existing) {
        // A claimed listing belongs to the business: only the OSM bookkeeping moves.
        if (existing.claimedByProviderOrganizationId || existing.source !== "OSM") {
          await tx.petFriendlyPlace.update({ where: { id: existing.id }, data: { osmTags: tags, osmSyncedAt: new Date(), osmMissingSince: null } });
          return "skipped";
        }
        // Fields staff edited by hand stay as staff left them; so does a listing staff took down.
        const edited = new Set(existing.osmEditedFields);
        const pinMoved = edited.has("latitude") || edited.has("longitude");
        const keep = (k: string) => !edited.has(k) && !(pinMoved && (k === "latitude" || k === "longitude"));
        const data = Object.fromEntries(Object.entries(fields).filter(([k]) => keep(k))) as Prisma.PetFriendlyPlaceUpdateInput;
        // Only a listing the re-sync itself hid comes back; one staff took down stays down.
        const relist = existing.osmMissingSince !== null && !edited.has("isPubliclyListed") && existing.status !== PetFriendlyPlaceStatus.SUSPENDED;
        await tx.petFriendlyPlace.update({ where: { id: existing.id }, data: { ...data, osmTags: tags, osmSyncedAt: new Date(), osmMissingSince: null, ...(relist ? { isPubliclyListed: true } : {}) } });
        if (!pinMoved) await this.setLocation(tx, existing.id, c.latitude, c.longitude);
        return "updated";
      }
      // De-duplicate against places already in the directory (staff-added or member-suggested): link, don't copy.
      const near = await tx.petFriendlyPlace.findMany({
        where: { osmId: null, latitude: { gte: c.latitude - 0.001, lte: c.latitude + 0.001 }, longitude: { gte: c.longitude - 0.001, lte: c.longitude + 0.001 } },
        select: { id: true, name: true, latitude: true, longitude: true },
        take: 20,
      });
      const twin = near.find((p) => sameBusiness(p, c));
      if (twin) {
        await tx.petFriendlyPlace.update({ where: { id: twin.id }, data: { osmType: c.osmType, osmId: c.osmId, osmTags: tags, osmSyncedAt: new Date() } });
        return "linked";
      }
      const created = await tx.petFriendlyPlace.create({
        data: {
          ...fields,
          country: "IR",
          source: "OSM",
          osmType: c.osmType,
          osmId: c.osmId,
          osmTags: tags,
          osmSyncedAt: new Date(),
          status: PetFriendlyPlaceStatus.UNVERIFIED,
          verificationSource: "OPENSTREETMAP",
          isPubliclyListed: true,
          speciesAllowed: c.dogsOnly ? [PetSpecies.DOG] : [],
          // Only what the kind of place makes plain: a shop/clinic is visited indoors, a park outdoors. Nothing else is
          // inferred (a café's terrace, a shop's yard) until the business or staff say so.
          indoorAllowed: INDOOR_KINDS.has(c.category),
          outdoorAllowed: OUTDOOR_KINDS.has(c.category),
        },
      });
      await this.setLocation(tx, created.id, c.latitude, c.longitude);
      return "created";
    });
  }

  /** Unclaimed OSM listings in this area that the latest pull no longer contains are hidden (kept for history). */
  private async hideMissing(area: OsmSyncArea, seen: Set<string>): Promise<number> {
    const inArea = await this.prisma.petFriendlyPlace.findMany({
      where: { source: "OSM", claimedByProviderOrganizationId: null, osmMissingSince: null, latitude: { gte: area.south, lte: area.north }, longitude: { gte: area.west, lte: area.east } },
      select: { id: true, osmType: true, osmId: true },
    });
    const missing = inArea.filter((p) => !seen.has(`${p.osmType}/${p.osmId}`)).map((p) => p.id);
    if (!missing.length) return 0;
    const result = await this.prisma.petFriendlyPlace.updateMany({ where: { id: { in: missing } }, data: { osmMissingSince: new Date(), isPubliclyListed: false } });
    return result.count;
  }
}
