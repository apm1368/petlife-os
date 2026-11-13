import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ValidationApiException } from "../../common/errors/api-exception";
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
   * "Near me" never travels in a URL (URLs land in access logs): a point from the browser goes to
   * POST /discovery/providers/near in the body; `near=home` uses the member's own pinned default address, read here
   * and used only to compute whole-kilometre distances. A point in this query string is refused.
   */
  @Get("providers")
  @UseGuards(OptionalSessionAuthGuard)
  async search(@Query() query: DiscoverProvidersDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    if (query.lat !== undefined || query.lng !== undefined) throw new ValidationApiException({ field: "lat", reason: "POINT_IN_QUERY" });
    if (query.near !== "home") return { ...(await this.discovery.search(query)), origin: null };
    const home = user ? await this.addresses.homePoint(user.id) : null;
    const result = await this.discovery.search(home ? { ...query, lat: home.latitude, lng: home.longitude } : { ...query, lat: undefined, lng: undefined, sort: query.sort === "NEAREST" ? undefined : query.sort });
    return { ...result, origin: home ? ("HOME" as const) : null };
  }

  /** Same search, from the browser's point sent in the body for this one request (never stored, never in a URL or log). */
  @Post("providers/near")
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async searchNear(@Body() body: DiscoverProvidersDto) {
    if (body.lat === undefined || body.lng === undefined) throw new ValidationApiException({ field: "lat", reason: "POINT_REQUIRED" });
    return { ...(await this.discovery.search({ ...body, near: undefined })), origin: "POINT" as const };
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
