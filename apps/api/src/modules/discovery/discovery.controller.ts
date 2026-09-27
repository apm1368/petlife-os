import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { DiscoveryService } from "./discovery.service";
import { DiscoverProvidersDto } from "./discovery.dto";

/** Anonymous-readable discovery. Booking itself still requires sign-in. */
@Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get("providers")
  search(@Query() query: DiscoverProvidersDto) {
    return this.discovery.search(query);
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
