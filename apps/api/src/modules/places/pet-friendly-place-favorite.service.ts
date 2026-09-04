import { Injectable } from "@nestjs/common";
import { PetFriendlyPlaceStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PetFriendlyPlaceNotFoundException } from "../../common/errors/api-exception";
import { toPetFriendlyPlaceDto } from "./places-mapper";

/**
 * Favorites require authentication (spec: "favorites-saved places" needs
 * auth) — a lightweight join table using the same bare-userId,
 * no-relation convention as CommunityReaction.userId, so favoriting never
 * needs a User relation load.
 */
@Injectable()
export class PetFriendlyPlaceFavoriteService {
  constructor(private readonly prisma: PrismaService) {}

  async listFavorites(userId: string) {
    const favorites = await this.prisma.petFriendlyPlaceFavorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    const places = await this.prisma.petFriendlyPlace.findMany({ where: { id: { in: favorites.map((f) => f.placeId) } } });
    const byId = new Map(places.map((place) => [place.id, place]));
    return favorites.map((f) => byId.get(f.placeId)).filter((place): place is NonNullable<typeof place> => place !== undefined).map((place) => toPetFriendlyPlaceDto(place, { isFavorited: true }));
  }

  async addFavorite(userId: string, placeId: string) {
    const place = await this.prisma.petFriendlyPlace.findFirst({ where: { id: placeId, status: PetFriendlyPlaceStatus.VERIFIED, isPubliclyListed: true } });
    if (!place) throw new PetFriendlyPlaceNotFoundException({ placeId });
    await this.prisma.petFriendlyPlaceFavorite.upsert({
      where: { placeId_userId: { placeId, userId } },
      create: { placeId, userId },
      update: {},
    });
    return toPetFriendlyPlaceDto(place, { isFavorited: true });
  }

  async removeFavorite(userId: string, placeId: string) {
    await this.prisma.petFriendlyPlaceFavorite.deleteMany({ where: { placeId, userId } });
  }
}
