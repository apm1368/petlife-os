import { Injectable, Logger } from "@nestjs/common";
import { NotificationCategory, PlaceSuggestionKind, PlaceSuggestionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { StorageService } from "../storage/storage.service";
import type { SuggestPlaceChangeDto, SuggestPlaceDto } from "../places/dto/places.dto";

const MAX_PENDING_PER_USER = 10;
/** A place this close to a suggested pin is shown to the reviewer as a possible duplicate. */
export const DUPLICATE_RADIUS_METERS = 250;

/**
 * Name/city comparison for duplicate hints: case, Arabic vs Persian letters (ي/ك/ة/ۀ), Persian and Arabic digits,
 * spaces, ZWNJ and punctuation don't make two names different. The SQL side applies the same three steps.
 */
const FOLD_FROM = "يكةۀ۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
const FOLD_TO = "یکهه01234567890123456789";
// Alternation, not one character class: ZWNJ/ZWJ inside a class read as a joined sequence (no-misleading-character-class).
const FOLD_STRIP = "(?:\\s|\u200c|\u200d|[._,،'\"()-])";
export function foldPlaceName(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  for (const ch of lower) {
    const i = FOLD_FROM.indexOf(ch);
    out += i >= 0 ? FOLD_TO[i] : ch;
  }
  return out.replace(new RegExp(FOLD_STRIP, "g"), "");
}
const foldSql = (column: Prisma.Sql) => Prisma.sql`regexp_replace(translate(lower(${column}), ${FOLD_FROM}, ${FOLD_TO}), ${FOLD_STRIP}, '', 'g')`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** The exact key an upload slot issues for this member; nothing else may be attached to a suggestion. */
export function isOwnSuggestionPhotoKey(userId: string, key: string): boolean {
  return new RegExp(`^place-suggestions/${userId.replace(/[^0-9a-f-]/gi, "")}/${UUID}\\.(jpg|png|webp)$`).test(key);
}

export type PlaceDuplicateHint = { placeId: string; name: string; city: string; category: string; status: string; listed: boolean; distanceMeters: number | null; sameName: boolean };

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * Member suggestions for new pet-friendly places. Nothing a member writes becomes public: approval creates an
 * UNVERIFIED, unlisted place that an admin still has to verify and list. Corrections and closures of existing
 * places go through place reports.
 */
@Injectable()
export class PlaceSuggestionService {
  private readonly logger = new Logger(PlaceSuggestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly storage: StorageService,
  ) {}

  /** Owner #6: a private upload slot for one suggestion photo (jpeg/png/webp, ≤ 10 MB), under the member's prefix. */
  requestPhotoUpload(userId: string, contentType: string, fileSizeBytes: number) {
    return this.storage.createPlaceSuggestionPhotoUploadTarget(userId, contentType, fileSizeBytes);
  }

  /**
   * Only the member's own uploads can be attached, in exactly the shape the upload slot issued
   * (place-suggestions/<userId>/<uuid>.<jpg|png|webp>) — so no dot segments or other paths; anything else is refused.
   */
  private ownPhotos(userId: string, keys: string[] | undefined): string[] {
    const unique = [...new Set(keys ?? [])];
    if (unique.some((k) => !isOwnSuggestionPhotoKey(userId, k))) throw new ValidationApiException({ field: "photoObjectKeys", reason: "NOT_YOUR_UPLOAD" });
    return unique;
  }

  async suggest(userId: string, dto: SuggestPlaceDto) {
    if (await this.prisma.placeSuggestion.count({ where: { userId, status: PlaceSuggestionStatus.PENDING } }) >= MAX_PENDING_PER_USER) throw new ValidationApiException({ reason: "TOO_MANY_PENDING_SUGGESTIONS", max: MAX_PENDING_PER_USER });
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) throw new ValidationApiException({ field: "latitude", reason: "BOTH_OR_NEITHER" });
    const photoObjectKeys = this.ownPhotos(userId, dto.photoObjectKeys);
    const row = await this.prisma.placeSuggestion.create({ data: { userId, name: dto.name.trim(), category: dto.category, city: dto.city.trim(), address: dto.address?.trim() || null, latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, notes: dto.notes?.trim() || null, photoObjectKeys } });
    return toDto(row);
  }

  /** G15: a correction (structured attribute changes) or a closure report for an existing public place. */
  async suggestChange(userId: string, dto: SuggestPlaceChangeDto) {
    if (await this.prisma.placeSuggestion.count({ where: { userId, status: PlaceSuggestionStatus.PENDING } }) >= MAX_PENDING_PER_USER) throw new ValidationApiException({ reason: "TOO_MANY_PENDING_SUGGESTIONS", max: MAX_PENDING_PER_USER });
    const place = await this.prisma.petFriendlyPlace.findFirst({ where: { id: dto.placeId, isPubliclyListed: true } });
    if (!place) throw new NotFoundApiException("Place");
    const photoObjectKeys = this.ownPhotos(userId, dto.photoObjectKeys);
    const changes = Object.fromEntries(Object.entries(dto.changes ?? {}).filter(([, v]) => v !== undefined));
    if (dto.kind === "CORRECTION" && !Object.keys(changes).length) throw new ValidationApiException({ field: "changes", reason: "NOTHING_TO_CORRECT" });
    const row = await this.prisma.placeSuggestion.create({
      data: { userId, kind: dto.kind, placeId: place.id, proposedChanges: dto.kind === "CORRECTION" ? (changes as Prisma.InputJsonValue) : Prisma.JsonNull, name: place.name, category: place.category, city: place.city, address: place.address, notes: dto.notes?.trim() || null, photoObjectKeys },
    });
    return toDto(row);
  }

  async mine(userId: string) {
    return (await this.prisma.placeSuggestion.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 })).map(toDto);
  }

  async adminList(status?: PlaceSuggestionStatus) {
    return (await this.prisma.placeSuggestion.findMany({ where: { status: status ?? PlaceSuggestionStatus.PENDING }, orderBy: { createdAt: "asc" }, take: 200 })).map(toDto);
  }

  /**
   * The admin review queue (owner #6, 2026-11-13): who suggested it, what the place looks like now (for corrections
   * and closures), and — for new places — existing places within DUPLICATE_RADIUS_METERS of the pin or with the same
   * name in the same city, plus other pending suggestions of the same place. Hints only; staff decide.
   */
  async adminQueue(query: { status?: PlaceSuggestionStatus; kind?: PlaceSuggestionKind }) {
    const status = query.status ?? PlaceSuggestionStatus.PENDING;
    const kindWhere = query.kind ? { kind: query.kind } : {};
    const [rows, groups] = await Promise.all([
      this.prisma.placeSuggestion.findMany({ where: { status, ...kindWhere }, orderBy: [{ createdAt: status === PlaceSuggestionStatus.PENDING ? "asc" : "desc" }, { id: "asc" }], take: 200 }),
      this.prisma.placeSuggestion.groupBy({ by: ["status"], where: kindWhere, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(Object.values(PlaceSuggestionStatus).map((st) => [st, groups.find((g) => g.status === st)?._count._all ?? 0])) as Record<PlaceSuggestionStatus, number>;
    const [members, reviewers, places] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, displayName: true } }),
      this.prisma.adminUser.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.reviewedByAdminId).filter((x): x is string => !!x))] } }, select: { id: true, user: { select: { displayName: true } } } }),
      this.prisma.petFriendlyPlace.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.placeId, r.createdPlaceId]).filter((x): x is string => !!x))] } } }),
    ]);
    const pendingNew = status === PlaceSuggestionStatus.PENDING ? rows.filter((r) => r.kind === PlaceSuggestionKind.NEW_PLACE) : [];
    const hints = new Map(await Promise.all(pendingNew.map(async (r) => [r.id, await this.duplicateHints(r)] as const)));
    const photoUrls = new Map(await Promise.all(rows.map(async (r) => [r.id, await this.photoPreviews(r.photoObjectKeys)] as const)));
    const items = rows.map((r) => {
      const place = places.find((p) => p.id === (r.placeId ?? r.createdPlaceId));
      const changes = (r.proposedChanges ?? null) as Record<string, unknown> | null;
      const twins = r.kind === PlaceSuggestionKind.NEW_PLACE && status === PlaceSuggestionStatus.PENDING
        ? pendingNew.filter((o) => o.id !== r.id && ((foldPlaceName(o.name) === foldPlaceName(r.name) && foldPlaceName(o.city) === foldPlaceName(r.city)) || (o.latitude !== null && o.longitude !== null && r.latitude !== null && r.longitude !== null && metersBetween({ lat: o.latitude, lng: o.longitude }, { lat: r.latitude, lng: r.longitude }) <= DUPLICATE_RADIUS_METERS))).map((o) => o.id)
        : [];
      return {
        ...toDto(r),
        member: { id: r.userId, displayName: members.find((m) => m.id === r.userId)?.displayName ?? null },
        reviewedBy: r.reviewedByAdminId ? reviewers.find((a) => a.id === r.reviewedByAdminId)?.user.displayName ?? null : null,
        reviewedAt: r.status === PlaceSuggestionStatus.PENDING ? null : r.updatedAt.toISOString(),
        place: place ? { id: place.id, name: place.name, city: place.city, category: place.category, status: place.status, listed: place.isPubliclyListed } : null,
        /** For a correction: each proposed field's value on the place right now, so staff see before → after. */
        currentValues: changes && place ? Object.fromEntries(Object.keys(changes).map((k) => [k, (place as Record<string, unknown>)[k] ?? null])) : null,
        duplicates: hints.get(r.id) ?? [],
        /** Short-lived private links to the member's photos (staff-only; the objects stay private). */
        photos: photoUrls.get(r.id) ?? [],
        similarPendingIds: twins,
      };
    });
    return { items, counts };
  }

  private async photoPreviews(keys: string[]) {
    return Promise.all(keys.map(async (key, index) => {
      try {
        const target = await this.storage.createPrivateDownloadTarget(key);
        return { index, url: target.downloadUrl, expiresInSeconds: target.expiresInSeconds };
      } catch {
        return { index, url: null, expiresInSeconds: 0 };
      }
    }));
  }

  private async duplicateHints(s: { name: string; city: string; latitude: number | null; longitude: number | null }): Promise<PlaceDuplicateHint[]> {
    type Row = { id: string; name: string; city: string; category: string; status: string; listed: boolean; distance: number | null };
    const name = foldPlaceName(s.name), city = foldPlaceName(s.city);
    const hasPin = s.latitude !== null && s.longitude !== null;
    const point = hasPin ? Prisma.sql`ST_SetSRID(ST_MakePoint(${s.longitude}::float8, ${s.latitude}::float8), 4326)::geography` : null;
    const near = point ? Prisma.sql`("location" IS NOT NULL AND ST_DWithin("location", ${point}, ${DUPLICATE_RADIUS_METERS}))` : Prisma.sql`false`;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id, name, city, category::text AS category, status::text AS status, "isPubliclyListed" AS listed,
             ${point ? Prisma.sql`CASE WHEN "location" IS NULL THEN NULL ELSE ST_Distance("location", ${point}) END` : Prisma.sql`NULL::float8`} AS distance
      FROM "pet_friendly_places"
      WHERE ${near} OR (${foldSql(Prisma.sql`"city"`)} = ${city} AND ${foldSql(Prisma.sql`"name"`)} = ${name})
      ORDER BY distance ASC NULLS LAST, name ASC
      LIMIT 6`;
    return rows.map((p) => ({ placeId: p.id, name: p.name, city: p.city, category: p.category, status: p.status, listed: p.listed, distanceMeters: p.distance === null ? null : Math.round(Number(p.distance)), sameName: foldPlaceName(p.name) === name && foldPlaceName(p.city) === city }));
  }

  /**
   * Approves once (compare-and-set on PENDING, so two reviewers can't both create a place). A new place is created
   * UNVERIFIED and unlisted — never public from a member's words alone; staff verify and list it on the places page.
   * Staff may supply the pin when the member didn't. The member is told after the commit.
   */
  async approve(admin: ResolvedAdminContext, id: string, input: { note?: string; latitude?: number; longitude?: number } = {}) {
    if ((input.latitude === undefined) !== (input.longitude === undefined)) throw new ValidationApiException({ field: "latitude", reason: "BOTH_OR_NEITHER" });
    const note = input.note?.trim() || null;
    const result = await this.prisma.$transaction(async (tx) => {
      const s = await tx.placeSuggestion.findUnique({ where: { id } });
      if (!s) throw new NotFoundApiException("PlaceSuggestion");
      if (s.status !== PlaceSuggestionStatus.PENDING) throw new ValidationApiException({ reason: "NOT_PENDING", status: s.status });
      const latitude = input.latitude ?? s.latitude, longitude = input.longitude ?? s.longitude;
      if (s.kind === PlaceSuggestionKind.NEW_PLACE && (latitude === null || longitude === null)) throw new ValidationApiException({ reason: "COORDINATES_REQUIRED_TO_CREATE_PLACE" });
      const claimed = await tx.placeSuggestion.updateMany({ where: { id, status: PlaceSuggestionStatus.PENDING }, data: { status: PlaceSuggestionStatus.APPROVED, reviewedByAdminId: admin.adminUserId, reviewNote: note } });
      if (!claimed.count) throw new ValidationApiException({ reason: "NOT_PENDING" });
      if (s.kind !== PlaceSuggestionKind.NEW_PLACE) {
        // Moderated change to an existing place: a correction applies only the whitelisted fields it carried; a
        // closure takes the place out of public listing (it stays in the database).
        const before = await tx.petFriendlyPlace.findUniqueOrThrow({ where: { id: s.placeId! } });
        const changes = (s.proposedChanges ?? {}) as Record<string, unknown>;
        const data = s.kind === PlaceSuggestionKind.CLOSURE_REPORT ? { isPubliclyListed: false } : changes;
        await tx.petFriendlyPlace.update({ where: { id: before.id }, data });
        await this.audit.record({ adminUserId: admin.adminUserId, action: s.kind === PlaceSuggestionKind.CLOSURE_REPORT ? "place_closure.approved" : "place_correction.approved", entityType: "PetFriendlyPlace", entityId: before.id, beforeSummary: Object.fromEntries(Object.keys(data).map((k) => [k, (before as Record<string, unknown>)[k] ?? null])), afterSummary: data, reason: note ?? undefined, tx });
        return { suggestion: await tx.placeSuggestion.findUniqueOrThrow({ where: { id } }), userId: s.userId, name: s.name };
      }
      const place = await tx.petFriendlyPlace.create({ data: { name: s.name, category: s.category, city: s.city, country: "IR", address: s.address, latitude: latitude!, longitude: longitude!, description: s.notes } });
      await tx.$executeRaw`UPDATE "pet_friendly_places" SET "location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography WHERE id = ${place.id}::uuid`;
      const updated = await tx.placeSuggestion.update({ where: { id }, data: { createdPlaceId: place.id } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "place_suggestion.approved", entityType: "PlaceSuggestion", entityId: id, reason: note ?? undefined, afterSummary: { createdPlaceId: place.id, pinFrom: input.latitude !== undefined ? "STAFF" : "MEMBER", memberPhotos: s.photoObjectKeys.length }, tx });
      return { suggestion: updated, userId: s.userId, name: s.name, photos: s.photoObjectKeys, placeId: place.id };
    });
    const createdPlaceId = "placeId" in result ? result.placeId : undefined;
    const photos = "photos" in result ? result.photos ?? [] : [];
    if (createdPlaceId && photos.length) await this.copyPhotosToPlace(id, createdPlaceId, photos);
    await this.notifyMember(result.userId, "place_suggestion.approved", id, { name: result.name });
    return toDto(result.suggestion);
  }

  /**
   * The new (still unverified, unlisted) place gets the member's photos in its gallery. Best effort after the
   * commit: a photo that never finished uploading is skipped and logged rather than undoing the approval.
   */
  private async copyPhotosToPlace(suggestionId: string, placeId: string, keys: string[]) {
    const copied: string[] = [];
    for (const key of keys) {
      try {
        copied.push(await this.storage.copyPlaceSuggestionPhotoToPlace(key, placeId));
      } catch (error) {
        this.logger.warn(`Suggestion ${suggestionId}: photo ${key} could not be copied to place ${placeId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!copied.length) return;
    await this.prisma.petFriendlyPlace.update({ where: { id: placeId }, data: { imageObjectKeys: { push: copied } } });
  }

  /** Rejects with the reason the member will read (owner #6: reject with a reason). */
  async reject(admin: ResolvedAdminContext, id: string, note: string) {
    const reason = note.trim();
    if (reason.length < 5) throw new ValidationApiException({ field: "note", reason: "REQUIRED_FOR_REJECTION" });
    const row = await this.prisma.$transaction(async (tx) => {
      const done = await tx.placeSuggestion.updateMany({ where: { id, status: PlaceSuggestionStatus.PENDING }, data: { status: PlaceSuggestionStatus.REJECTED, reviewedByAdminId: admin.adminUserId, reviewNote: reason } });
      if (!done.count) throw new NotFoundApiException("PlaceSuggestion");
      await this.audit.record({ adminUserId: admin.adminUserId, action: "place_suggestion.rejected", entityType: "PlaceSuggestion", entityId: id, reason, tx });
      return tx.placeSuggestion.findUniqueOrThrow({ where: { id } });
    });
    await this.notifyMember(row.userId, "place_suggestion.rejected", id, { name: row.name, reason });
    return toDto(row);
  }

  private async notifyMember(userId: string, type: string, id: string, templateParams: Record<string, string>) {
    try {
      await this.notifications.notify({ userId, type, category: NotificationCategory.SYSTEM, templateParams, entityType: "PlaceSuggestion", entityId: id });
    } catch (error) {
      // The decision is committed and visible in the member's suggestions; a failed notification is logged, not hidden.
      this.logger.error(`Place suggestion notification ${type} for ${id} failed`, error instanceof Error ? error.stack : undefined);
    }
  }
}

function toDto(s: Prisma.PlaceSuggestionGetPayload<object>) {
  return { kind: s.kind, placeId: s.placeId, proposedChanges: s.proposedChanges, id: s.id, name: s.name, category: s.category, city: s.city, address: s.address, latitude: s.latitude, longitude: s.longitude, notes: s.notes, status: s.status, reviewNote: s.reviewNote, createdPlaceId: s.createdPlaceId, photoCount: s.photoObjectKeys.length, createdAt: s.createdAt.toISOString() };
}
