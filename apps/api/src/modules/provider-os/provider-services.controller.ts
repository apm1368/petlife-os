import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ProviderUserRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { RequireProviderRole } from "./auth/require-provider-role.decorator";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderServicesService } from "./provider-services.service";
import { UpdateProviderServiceDto } from "./dto/update-provider-service.dto";

@Controller("provider/services")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderServicesController {
  constructor(private readonly services: ProviderServicesService) {}

  @Get()
  list(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.services.list(ctx);
  }

  @Get(":id")
  getById(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.services.getById(ctx, id);
  }

  @Patch(":id")
  @RequireProviderRole(ProviderUserRole.OWNER)
  update(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string, @Body() dto: UpdateProviderServiceDto) {
    return this.services.update(ctx, id, dto);
  }
}
