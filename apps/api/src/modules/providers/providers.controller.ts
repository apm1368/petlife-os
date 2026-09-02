import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SearchVetsDto } from "./dto/search-vets.dto";
import { GetAvailabilityDto } from "./dto/get-availability.dto";
import { ProvidersService } from "./providers.service";

/** Vet discovery is public browsing (Handoff 12) — OptionalSessionAuthGuard personalizes the response for a signed-in caller but never requires one. */
@Controller("providers/vets")
@UseGuards(OptionalSessionAuthGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  search(@Query() query: SearchVetsDto) {
    return this.providersService.searchVets(query);
  }

  @Get(":providerId")
  getProfile(@Param("providerId") providerId: string, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.providersService.getVetProfile(providerId, user?.id);
  }

  @Get(":providerId/availability")
  getAvailability(@Param("providerId") providerId: string, @Query() query: GetAvailabilityDto) {
    return this.providersService.getAvailability(providerId, query);
  }
}
