import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SearchServicesDto } from "./dto/search-services.dto";
import { GetServiceDetailDto } from "./dto/get-service-detail.dto";
import { GetServiceAvailabilityDto } from "./dto/get-service-availability.dto";
import { ServicesService } from "./services.service";

@UseGuards(SessionAuthGuard)
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
  getDetail(@Param("serviceId") serviceId: string, @Query() query: GetServiceDetailDto, @CurrentUser() user: SessionUser) {
    return this.servicesService.getServiceDetail(serviceId, query, user.id);
  }

  @Get("provider-services/:serviceId/availability")
  getAvailability(@Param("serviceId") serviceId: string, @Query() query: GetServiceAvailabilityDto) {
    return this.servicesService.getServiceAvailability(serviceId, query);
  }
}
