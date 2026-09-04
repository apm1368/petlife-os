import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { PetFriendlyPlaceNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toPetFriendlyPlaceDto } from "./places-mapper";
import type { CreatePetFriendlyPlaceDto, ListPetFriendlyPlacesQueryDto, SetPetFriendlyPlaceListedDto, SetPetFriendlyPlaceVerificationStatusDto, UpdatePetFriendlyPlaceDto } from "./dto/places.dto";

/**
 * Admin CRUD + verification lifecycle for Pet-Friendly Places. The
 * `location` geography column has no Prisma-native type (see the
 * schema-level doc comment on PetFriendlyPlace.location) so this service is
 * the only writer, always syncing it from latitude/longitude via raw SQL in
 * the same transaction as the Prisma write — never the other way around.
 */
@Injectable()
export class PetFriendlyPlaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async getRawOrThrow(id: string) {
    const row = await this.prisma.petFriendlyPlace.findUnique({ where: { id } });
    if (!row) throw new PetFriendlyPlaceNotFoundException({ placeId: id });
    return row;
  }

  private async syncLocation(tx: Prisma.TransactionClient, id: string, latitude: number, longitude: number) {
    await tx.$executeRaw`UPDATE pet_friendly_places SET location = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography WHERE id = ${id}::uuid`;
  }

  async adminList(query: ListPetFriendlyPlacesQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.PetFriendlyPlaceWhereInput = {
      country: query.country,
      city: query.city,
      category: query.category,
      speciesAllowed: query.species ? { has: query.species } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.petFriendlyPlace.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.petFriendlyPlace.count({ where }),
    ]);
    return toPaginatedDto(rows.map((row) => toPetFriendlyPlaceDto(row)), total, page, pageSize);
  }

  async adminGet(id: string) {
    return toPetFriendlyPlaceDto(await this.getRawOrThrow(id));
  }

  async create(admin: ResolvedAdminContext, dto: CreatePetFriendlyPlaceDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.petFriendlyPlace.create({
        data: {
          name: dto.name,
          category: dto.category,
          description: dto.description,
          country: dto.country,
          city: dto.city,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          speciesAllowed: dto.speciesAllowed ?? [],
          sizeRestrictions: dto.sizeRestrictions,
          indoorAllowed: dto.indoorAllowed ?? true,
          outdoorAllowed: dto.outdoorAllowed ?? true,
          petPolicy: dto.petPolicy,
        },
      });
      await this.syncLocation(tx, created.id, dto.latitude, dto.longitude);
      await this.audit.record({ adminUserId: admin.adminUserId, action: "pet_friendly_place.created", entityType: "PetFriendlyPlace", entityId: created.id, afterSummary: { name: created.name }, tx });
      return created;
    });
    return toPetFriendlyPlaceDto(row);
  }

  async update(admin: ResolvedAdminContext, id: string, dto: UpdatePetFriendlyPlaceDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.petFriendlyPlace.update({ where: { id }, data: dto });
      if (dto.latitude !== undefined || dto.longitude !== undefined) {
        await this.syncLocation(tx, id, dto.latitude ?? existing.latitude, dto.longitude ?? existing.longitude);
      }
      await this.audit.record({ adminUserId: admin.adminUserId, action: "pet_friendly_place.updated", entityType: "PetFriendlyPlace", entityId: id, tx });
      return updated;
    });
    return toPetFriendlyPlaceDto(row);
  }

  async setVerificationStatus(admin: ResolvedAdminContext, id: string, dto: SetPetFriendlyPlaceVerificationStatusDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.petFriendlyPlace.update({ where: { id }, data: { status: dto.status, verifiedAt: new Date() } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "pet_friendly_place.verification_changed",
        entityType: "PetFriendlyPlace",
        entityId: id,
        beforeSummary: { status: existing.status },
        afterSummary: { status: updated.status },
        tx,
      });
      return updated;
    });
    return toPetFriendlyPlaceDto(row);
  }

  async setPubliclyListed(admin: ResolvedAdminContext, id: string, dto: SetPetFriendlyPlaceListedDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.petFriendlyPlace.update({ where: { id }, data: { isPubliclyListed: dto.isPubliclyListed } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "pet_friendly_place.listed_changed",
        entityType: "PetFriendlyPlace",
        entityId: id,
        beforeSummary: { isPubliclyListed: existing.isPubliclyListed },
        afterSummary: { isPubliclyListed: updated.isPubliclyListed },
        tx,
      });
      return updated;
    });
    return toPetFriendlyPlaceDto(row);
  }

  async requestImageUpload(id: string, contentType: string, fileSizeBytes: number) {
    await this.getRawOrThrow(id);
    return this.storage.createPetFriendlyPlaceImageUploadTarget(id, contentType, fileSizeBytes);
  }
}
