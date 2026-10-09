import { Injectable } from "@nestjs/common";
import { ExternalPublishState, ExternalStayStatus, Prisma, type ExternalStay, type ExternalTravelSource } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { assertSourceUrl, OVERRIDABLE, TravelExternalService } from "./travel-external.service";
import type { AdapterQuoteContext } from "./adapters/travel-source-adapter";

const VISIBLE: ExternalStayStatus[] = [ExternalStayStatus.ACTIVE, ExternalStayStatus.STALE];
type StayWith = ExternalStay & { source: ExternalTravelSource; images: { sourceImageUrl: string; position: number }[] };

/**
 * Member-facing external stays: every item is source-attributed, timestamped and pet-qualified by source evidence.
 * Prices are shown only for the exact search dates/guests and only while fresh; the CTA leaves PET LIFE for the source.
 */
@Injectable()
export class TravelExternalPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: TravelExternalService,
  ) {}

  private display(s: StayWith) {
    const o = (s.overrides ?? {}) as Record<string, { overrideValue: string }>;
    const val = (f: (typeof OVERRIDABLE)[number]) => o[f]?.overrideValue ?? (s as Record<string, unknown>)[f] ?? null;
    const metadataFresh = s.lastCheckedAt.getTime() + s.source.metadataTtlMinutes * 60e3 > Date.now();
    return {
      id: s.id,
      title: val("title"), city: val("city"), area: val("area"), stayType: val("stayType"), province: s.province, capacity: s.capacity, bedrooms: s.bedrooms, beds: s.beds,
      source: { code: s.source.code, nameFa: s.source.nameFa, nameEn: s.source.nameEn },
      pet: { accepted: true, evidenceType: s.petEvidenceType, evidenceObservedAt: s.petEvidenceObservedAt.toISOString(), policy: s.petPolicy, summary: val("petPolicySummary") },
      rating: s.rating, reviewCount: s.reviewCount, instantBooking: s.instantBooking ?? "UNKNOWN", descriptionSummary: val("descriptionSummary"),
      images: s.source.imagePolicy === "NO_IMAGES" ? [] : s.images.sort((a, b) => a.position - b.position).map((i) => i.sourceImageUrl),
      status: s.status === ExternalStayStatus.STALE || !metadataFresh ? "STALE" : "ACTIVE",
      lastCheckedAt: s.lastCheckedAt.toISOString(),
      outboundPath: `/travel/external/stays/${s.id}/out`,
      propertyGroupId: s.propertyGroupId,
    };
  }

  async search(q: { city?: string; checkIn?: string; checkOut?: string; guests?: number; pets?: number; stayType?: string; source?: string; minPrice?: number; maxPrice?: number; instantBooking?: boolean; dogs?: boolean; cats?: boolean; page?: number; pageSize?: number }) {
    const ctx = this.context(q);
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ExternalStayWhereInput = {
      publishState: ExternalPublishState.PUBLISHED, status: { in: VISIBLE }, petFriendly: true,
      ...(q.city ? { city: { equals: q.city.trim(), mode: "insensitive" } } : {}),
      ...(q.stayType ? { stayType: q.stayType } : {}),
      ...(q.source ? { source: { code: q.source } } : {}),
      ...(q.instantBooking !== undefined ? { instantBooking: q.instantBooking } : {}),
      ...(q.guests ? { OR: [{ capacity: null }, { capacity: { gte: q.guests } }] } : {}),
      // Pet filters match only explicit source values; UNKNOWN never counts as "yes".
      ...(q.dogs ? { petPolicy: { path: ["dogs"], equals: true } } : {}),
      ...(q.cats ? { AND: [{ petPolicy: { path: ["cats"], equals: true } }] } : {}),
    };
    const rows = await this.prisma.externalStay.findMany({ where, include: { source: true, images: true }, orderBy: [{ lastCheckedAt: "desc" }], take: 500 });
    const items = await Promise.all(rows.map(async (s) => ({ ...this.display(s), price: ctx ? this.core.priceView(await this.core.latestPrice(s.id, ctx), ctx) : this.core.priceView(null, null) })));
    // Price filters only ever use fresh prices for these exact dates; anything without one is excluded when filtering by price.
    const priced = q.minPrice !== undefined || q.maxPrice !== undefined
      ? items.filter((i) => i.price.state === "FRESH" && "priceIrr" in i.price && i.price.priceIrr != null && (q.minPrice === undefined || i.price.priceIrr >= q.minPrice) && (q.maxPrice === undefined || i.price.priceIrr <= q.maxPrice))
      : items;
    return { ...toPaginatedDto(priced.slice(skip, skip + take), priced.length, page, pageSize), context: ctx, notice: "SOURCE_ATTRIBUTED_EXTERNAL_LISTINGS" };
  }

  private context(q: { checkIn?: string; checkOut?: string; guests?: number; pets?: number }): AdapterQuoteContext | null {
    if (!q.checkIn && !q.checkOut) return null;
    if (!q.checkIn || !q.checkOut || q.checkOut <= q.checkIn) throw new ValidationApiException({ field: "checkOut", reason: "INVALID_DATE_RANGE" });
    return { checkIn: q.checkIn, checkOut: q.checkOut, guests: q.guests ?? 2, pets: q.pets };
  }

  async detail(id: string, q: { checkIn?: string; checkOut?: string; guests?: number; pets?: number }) {
    const s = await this.prisma.externalStay.findFirst({ where: { id, publishState: ExternalPublishState.PUBLISHED, status: { in: VISIBLE } }, include: { source: true, images: true } });
    if (!s) throw new NotFoundApiException("External stay");
    const ctx = this.context(q);
    return { ...this.display(s), price: ctx ? await this.core.quote(id, ctx) : this.core.priceView(null, null), alternatives: s.propertyGroupId ? (await this.prisma.externalStay.findMany({ where: { propertyGroupId: s.propertyGroupId, id: { not: s.id }, publishState: ExternalPublishState.PUBLISHED, status: { in: VISIBLE } }, include: { source: true, images: true } })).map((a) => this.display(a)) : [] };
  }

  /** Logs the click (no booking, no conversion claim) and returns the validated source URL for a 302. */
  async outbound(id: string, userId: string | null, searchContext: Record<string, unknown> | null) {
    const s = await this.prisma.externalStay.findFirst({ where: { id, status: { not: ExternalStayStatus.HIDDEN } }, include: { source: true } });
    if (!s) throw new NotFoundApiException("External stay");
    const url = assertSourceUrl(s.sourceUrl, s.source.allowedHosts);
    await this.prisma.outboundTravelClick.create({ data: { stayId: s.id, sourceCode: s.source.code, userId, searchContext: (searchContext ?? undefined) as Prisma.InputJsonValue | undefined } });
    return url.toString();
  }

  async favorite(userId: string, stayId: string, on: boolean) {
    if (on) {
      if (!(await this.prisma.externalStay.count({ where: { id: stayId, publishState: ExternalPublishState.PUBLISHED } }))) throw new NotFoundApiException("External stay");
      await this.prisma.externalStayFavorite.createMany({ data: [{ userId, stayId }], skipDuplicates: true });
    } else await this.prisma.externalStayFavorite.deleteMany({ where: { userId, stayId } });
    return { stayId, saved: on };
  }

  /** Saved stays stay listed even if the source removed them — marked unavailable rather than silently dropped. */
  async favorites(userId: string) {
    const rows = await this.prisma.externalStayFavorite.findMany({ where: { userId }, include: { stay: { include: { source: true, images: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => ({ savedAt: r.createdAt.toISOString(), available: VISIBLE.includes(r.stay.status) && r.stay.publishState === ExternalPublishState.PUBLISHED, stay: this.display(r.stay) }));
  }

  async attachToTrip(userId: string, petId: string, tripId: string, stayId: string, ctx?: AdapterQuoteContext) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, petId } });
    if (!trip) throw new NotFoundApiException("Trip");
    const stay = await this.prisma.externalStay.findFirst({ where: { id: stayId, publishState: ExternalPublishState.PUBLISHED, status: { in: VISIBLE } } });
    if (!stay) throw new NotFoundApiException("External stay");
    const snap = ctx ? await this.core.latestPrice(stayId, ctx) : null;
    await this.prisma.tripExternalStay.upsert({ where: { tripId_stayId: { tripId, stayId } }, create: { tripId, stayId, addedByUserId: userId, priceSnapshotId: snap?.id ?? null }, update: { priceSnapshotId: snap?.id ?? undefined } });
    return this.tripStays(tripId);
  }

  async detachFromTrip(petId: string, tripId: string, stayId: string) {
    if (!(await this.prisma.trip.count({ where: { id: tripId, petId } }))) throw new NotFoundApiException("Trip");
    await this.prisma.tripExternalStay.deleteMany({ where: { tripId, stayId } });
    return this.tripStays(tripId);
  }

  /** The guard checked access to `petId`; the trip must belong to that pet (no cross-pet IDOR). */
  async tripStaysForPet(petId: string, tripId: string) {
    if (!(await this.prisma.trip.count({ where: { id: tripId, petId } }))) throw new NotFoundApiException("Trip");
    return this.tripStays(tripId);
  }

  private async tripStays(tripId: string) {
    const rows = await this.prisma.tripExternalStay.findMany({ where: { tripId }, include: { stay: { include: { source: true, images: true } } } });
    const snaps = await this.prisma.externalStayPriceSnapshot.findMany({ where: { id: { in: rows.map((r) => r.priceSnapshotId).filter((x): x is string => Boolean(x)) } } });
    return rows.map((r) => ({ state: r.state, reservationConfirmed: false, addedAt: r.createdAt.toISOString(), stay: this.display(r.stay), priceAtAttach: (() => { const sn = snaps.find((x) => x.id === r.priceSnapshotId); return sn ? { priceIrr: sn.priceIrr, observedAt: sn.lastConfirmedAt.toISOString(), checkIn: sn.checkIn.toISOString().slice(0, 10), checkOut: sn.checkOut.toISOString().slice(0, 10), guests: sn.guests } : null; })() }));
  }
}
