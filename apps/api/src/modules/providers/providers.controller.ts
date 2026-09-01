import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SearchVetsDto } from "./dto/search-vets.dto";
import { GetAvailabilityDto } from "./dto/get-availability.dto";
import { ProvidersService } from "./providers.service";

@Controller("providers/vets")
@UseGuards(SessionAuthGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  search(@Query() query: SearchVetsDto) {
    return this.providersService.searchVets(query);
  }

  @Get(":providerId")
  getProfile(@Param("providerId") providerId: string, @CurrentUser() user: SessionUser) {
    return this.providersService.getVetProfile(providerId, user.id);
  }

  @Get(":providerId/availability")
  getAvailability(@Param("providerId") providerId: string, @Query() query: GetAvailabilityDto) {
    return this.providersService.getAvailability(providerId, query);
  }
}
