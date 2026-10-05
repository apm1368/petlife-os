import { Injectable } from "@nestjs/common";
import { PlaceSuggestionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import type { SuggestPlaceDto } from "../places/dto/places.dto";

const MAX_PENDING_PER_USER = 10;

/**
 * Member suggestions for new pet-friendly places. Nothing a member writes becomes public: approval creates an
 * UNVERIFIED, unlisted place that an admin still has to verify and list. Corrections and closures of existing
 * places go through place reports.
 */
@Injectable()
export class PlaceSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  async suggest(userId: string, dto: SuggestPlaceDto) {
    if (await this.prisma.placeSuggestion.count({ where: { userId, status: PlaceSuggestionStatus.PENDING } }) >= MAX_PENDING_PER_USER) throw new ValidationApiException({ reason: "TOO_MANY_PENDING_SUGGESTIONS", max: MAX_PENDING_PER_USER });
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) throw new ValidationApiException({ field: "latitude", reason: "BOTH_OR_NEITHER" });
    const row = await this.prisma.placeSuggestion.create({ data: { userId, name: dto.name.trim(), category: dto.category, city: dto.city.trim(), address: dto.address?.trim() || null, latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, notes: dto.notes?.trim() || null } });
    return toDto(row);
  }

  async mine(userId: string) {
    return (await this.prisma.placeSuggestion.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 })).map(toDto);
  }

  async adminList(status?: PlaceSuggestionStatus) {
    return (await this.prisma.placeSuggestion.findMany({ where: { status: status ?? PlaceSuggestionStatus.PENDING }, orderBy: { createdAt: "asc" }, take: 200 })).map(toDto);
  }

  async approve(admin: ResolvedAdminContext, id: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.placeSuggestion.findUnique({ where: { id } });
      if (!s) throw new NotFoundApiException("PlaceSuggestion");
      if (s.status !== PlaceSuggestionStatus.PENDING) throw new ValidationApiException({ reason: "NOT_PENDING", status: s.status });
      if (s.latitude === null || s.longitude === null) throw new ValidationApiException({ reason: "COORDINATES_REQUIRED_TO_CREATE_PLACE" });
      const place = await tx.petFriendlyPlace.create({ data: { name: s.name, category: s.category, city: s.city, country: "IR", address: s.address, latitude: s.latitude, longitude: s.longitude, description: s.notes } });
      await tx.$executeRaw`UPDATE "pet_friendly_places" SET "location" = ST_SetSRID(ST_MakePoint(${s.longitude}, ${s.latitude}), 4326)::geography WHERE id = ${place.id}::uuid`;
      const updated = await tx.placeSuggestion.update({ where: { id }, data: { status: PlaceSuggestionStatus.APPROVED, reviewedByAdminId: admin.adminUserId, reviewNote: note ?? null, createdPlaceId: place.id } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "place_suggestion.approved", entityType: "PlaceSuggestion", entityId: id, afterSummary: { createdPlaceId: place.id }, tx });
      return toDto(updated);
    });
  }

  async reject(admin: ResolvedAdminContext, id: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.placeSuggestion.updateMany({ where: { id, status: PlaceSuggestionStatus.PENDING }, data: { status: PlaceSuggestionStatus.REJECTED, reviewedByAdminId: admin.adminUserId, reviewNote: note ?? null } });
      if (!done.count) throw new NotFoundApiException("PlaceSuggestion");
      await this.audit.record({ adminUserId: admin.adminUserId, action: "place_suggestion.rejected", entityType: "PlaceSuggestion", entityId: id, reason: note, tx });
      return toDto(await tx.placeSuggestion.findUniqueOrThrow({ where: { id } }));
    });
  }
}

function toDto(s: Prisma.PlaceSuggestionGetPayload<object>) {
  return { id: s.id, name: s.name, category: s.category, city: s.city, address: s.address, latitude: s.latitude, longitude: s.longitude, notes: s.notes, status: s.status, reviewNote: s.reviewNote, createdPlaceId: s.createdPlaceId, createdAt: s.createdAt.toISOString() };
}
