import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { AddressesService } from "../addresses/addresses.service";
import { DiscoveryService } from "./discovery.service";
import { DiscoverProvidersDto } from "./discovery.dto";

/** Anonymous-readable discovery. Booking itself still requires sign-in. */
@Controller("discovery")
export class DiscoveryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly addresses: AddressesService,
  ) {}

  /**
   * "Near me": either a point the browser sends for this one request (the web rounds it to ~1 km first; it is never
   * stored, and request logs carry the route template only), or `near=home` — the member's own pinned default
   * address, read here and used only to compute coarse distances.
   */
  @Get("providers")
  @UseGuards(OptionalSessionAuthGuard)
  async search(@Query() query: DiscoverProvidersDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    if (query.near !== "home") return { ...(await this.discovery.search(query)), origin: query.lat !== undefined && query.lng !== undefined ? ("POINT" as const) : null };
    const home = user ? await this.addresses.homePoint(user.id) : null;
    const result = await this.discovery.search(home ? { ...query, lat: home.latitude, lng: home.longitude } : { ...query, lat: undefined, lng: undefined, sort: query.sort === "NEAREST" ? undefined : query.sort });
    return { ...result, origin: home ? ("HOME" as const) : null };
  }

  @Get("providers/:providerId")
  profile(@Param("providerId", ParseUUIDPipe) providerId: string) {
    return this.discovery.profile(providerId);
  }

  @Get("cities")
  cities() {
    return this.discovery.cities();
  }
}
