import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetFriendlyPlaceFavoriteService } from "./pet-friendly-place-favorite.service";

/** Authenticated favorites surface — user-scoped, not pet-scoped (spec: "favorites-saved places" requires auth). */
@Controller("places/favorites")
@UseGuards(SessionAuthGuard)
export class PlacesController {
  constructor(private readonly favorites: PetFriendlyPlaceFavoriteService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.favorites.listFavorites(user.id);
  }

  @Post(":placeId")
  add(@CurrentUser() user: SessionUser, @Param("placeId") placeId: string) {
    return this.favorites.addFavorite(user.id, placeId);
  }

  @Delete(":placeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: SessionUser, @Param("placeId") placeId: string) {
    return this.favorites.removeFavorite(user.id, placeId);
  }
}
