import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PublicPlacesReadService } from "./public-places-read.service";
import { AddressesService } from "../addresses/addresses.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { ListPetFriendlyPlacesQueryDto, NearbyPetFriendlyPlacesQueryDto } from "./dto/places.dto";

/** Public directory — no guard by design, mirroring PublicAnimalSupportController/CommunityController. OptionalSessionAuthGuard only personalizes isFavorited, never gates access. */
@Controller("places")
export class PublicPlacesController {
  constructor(
    private readonly reads: PublicPlacesReadService,
    private readonly addresses: AddressesService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(OptionalSessionAuthGuard)
  list(@Query() query: ListPetFriendlyPlacesQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.reads.list(query, user?.id);
  }

  @Get("nearby")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(OptionalSessionAuthGuard)
  async nearby(@Query() query: NearbyPetFriendlyPlacesQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    if (query.near !== "home") return this.reads.nearby(query, user?.id);
    // The member's own pin, read server-side: it is used for the distance query and never echoed back.
    const home = user ? await this.addresses.homePoint(user.id) : null;
    if (!home) throw new ValidationApiException({ field: "near", reason: "HOME_PIN_MISSING" });
    return this.reads.nearby({ ...query, latitude: home.latitude, longitude: home.longitude }, user?.id);
  }

  @Get(":placeId")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(OptionalSessionAuthGuard)
  get(@Param("placeId") placeId: string, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.reads.get(placeId, user?.id);
  }
}
