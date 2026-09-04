import { Injectable } from "@nestjs/common";
import { PetFriendlyPlaceStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PetFriendlyPlaceNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toPetFriendlyPlaceDto } from "./places-mapper";
import type { ListPetFriendlyPlacesQueryDto, NearbyPetFriendlyPlacesQueryDto } from "./dto/places.dto";

const LISTED_FILTER = { status: PetFriendlyPlaceStatus.VERIFIED, isPubliclyListed: true };
const DEFAULT_RADIUS_METERS = 5_000;

interface NearbyRow {
  id: string;
  distance_meters: number;
}

/**
 * Public, anonymous-readable Pet-Friendly Places directory (spec: "public
 * browsing... pet-friendly places" must work without auth). Only VERIFIED +
 * isPubliclyListed places are ever reachable here — the same convention as
 * every other public read service in this handoff.
 */
@Injectable()
export class PublicPlacesReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** OptionalSessionAuthGuard personalizes a GET with the viewer's own favorite, never gates it — mirrors CommunityController's own "no guard by design" precedent. */
  private async favoritedIds(userId: string | undefined, placeIds: string[]): Promise<Set<string>> {
    if (!userId || placeIds.length === 0) return new Set();
    const favorites = await this.prisma.petFriendlyPlaceFavorite.findMany({ where: { userId, placeId: { in: placeIds } }, select: { placeId: true } });
    return new Set(favorites.map((f) => f.placeId));
  }

  async list(query: ListPetFriendlyPlacesQueryDto, userId?: string) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.PetFriendlyPlaceWhereInput = {
      ...LISTED_FILTER,
      country: query.country,
      city: query.city,
      category: query.category,
      speciesAllowed: query.species ? { has: query.species } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.petFriendlyPlace.findMany({ where, orderBy: { name: "asc" }, skip, take }),
      this.prisma.petFriendlyPlace.count({ where }),
    ]);
    const favorited = await this.favoritedIds(userId, rows.map((row) => row.id));
    return toPaginatedDto(
      rows.map((row) => toPetFriendlyPlaceDto(row, { isFavorited: favorited.has(row.id) })),
      total,
      page,
      pageSize,
    );
  }

  async get(id: string, userId?: string) {
    const row = await this.prisma.petFriendlyPlace.findFirst({ where: { id, ...LISTED_FILTER } });
    if (!row) throw new PetFriendlyPlaceNotFoundException({ placeId: id });
    const favorited = await this.favoritedIds(userId, [row.id]);
    return toPetFriendlyPlaceDto(row, { isFavorited: favorited.has(row.id) });
  }

  /**
   * Proximity search via PostGIS ST_DWithin/ST_Distance — the only reason
   * this handoff enables the postgis extension (spec: "Use PostGIS").
   * `location` has no Prisma-native type, so the geo half of the query runs
   * as raw SQL; the id list it returns is then re-hydrated through the
   * normal Prisma client so filtering/serialization stays consistent with
   * every other read path.
   */
  async nearby(query: NearbyPetFriendlyPlacesQueryDto, userId?: string) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const radiusMeters = query.radiusMeters ?? DEFAULT_RADIUS_METERS;

    const nearbyRows = await this.prisma.$queryRaw<NearbyRow[]>`
      SELECT id, ST_Distance(location, ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography) AS distance_meters
      FROM pet_friendly_places
      WHERE status = 'VERIFIED'
        AND "isPubliclyListed" = true
        AND location IS NOT NULL
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography, ${radiusMeters})
        AND (${query.category ?? null}::text IS NULL OR category = ${query.category ?? null}::"PetFriendlyPlaceCategory")
        AND (${query.species ?? null}::text IS NULL OR ${query.species ?? null}::"PetSpecies" = ANY("speciesAllowed"))
      ORDER BY distance_meters ASC
      OFFSET ${skip} LIMIT ${take}
    `;

    const total = await this.countNearby(query, radiusMeters);
    if (nearbyRows.length === 0) return toPaginatedDto([], total, page, pageSize);

    const distanceById = new Map(nearbyRows.map((row) => [row.id, row.distance_meters]));
    const rows = await this.prisma.petFriendlyPlace.findMany({ where: { id: { in: nearbyRows.map((row) => row.id) } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = nearbyRows.map((nearbyRow) => byId.get(nearbyRow.id)).filter((row): row is NonNullable<typeof row> => row !== undefined);
    const favorited = await this.favoritedIds(userId, ordered.map((row) => row.id));

    return toPaginatedDto(
      ordered.map((row) => toPetFriendlyPlaceDto(row, { distanceMeters: distanceById.get(row.id) ?? null, isFavorited: favorited.has(row.id) })),
      total,
      page,
      pageSize,
    );
  }

  private async countNearby(query: NearbyPetFriendlyPlacesQueryDto, radiusMeters: number) {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM pet_friendly_places
      WHERE status = 'VERIFIED'
        AND "isPubliclyListed" = true
        AND location IS NOT NULL
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography, ${radiusMeters})
        AND (${query.category ?? null}::text IS NULL OR category = ${query.category ?? null}::"PetFriendlyPlaceCategory")
        AND (${query.species ?? null}::text IS NULL OR ${query.species ?? null}::"PetSpecies" = ANY("speciesAllowed"))
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
