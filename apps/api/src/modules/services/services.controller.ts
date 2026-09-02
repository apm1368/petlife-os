import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SearchServicesDto } from "./dto/search-services.dto";
import { GetServiceDetailDto } from "./dto/get-service-detail.dto";
import { GetServiceAvailabilityDto } from "./dto/get-service-availability.dto";
import { ServicesService } from "./services.service";

/** Services discovery is public browsing (Handoff 12) — OptionalSessionAuthGuard personalizes the response for a signed-in caller but never requires one. */
@UseGuards(OptionalSessionAuthGuard)
@Controller()
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get("services/categories")
  categories() {
    return this.servicesService.listCategories();
  }

  @Get("providers/services")
  search(@Query() query: SearchServicesDto) {
    return this.servicesService.search(query);
  }

  @Get("provider-services/:serviceId")
  getDetail(@Param("serviceId") serviceId: string, @Query() query: GetServiceDetailDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.servicesService.getServiceDetail(serviceId, query, user?.id);
  }

  @Get("provider-services/:serviceId/availability")
  getAvailability(@Param("serviceId") serviceId: string, @Query() query: GetServiceAvailabilityDto) {
    return this.servicesService.getServiceAvailability(serviceId, query);
  }
}
