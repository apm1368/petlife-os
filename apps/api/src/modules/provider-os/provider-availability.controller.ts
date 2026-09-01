import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderAvailabilityService } from "./provider-availability.service";
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import { CreateAvailabilityExceptionDto, UpdateAvailabilityExceptionDto } from "./dto/availability-exception.dto";

@Controller("provider/availability")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderAvailabilityController {
  constructor(private readonly availability: ProviderAvailabilityService) {}

  @Get("rules")
  listRules(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.availability.listRules(ctx);
  }

  @Post("rules")
  createRule(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateAvailabilityRuleDto) {
    return this.availability.createRule(ctx, dto);
  }

  @Patch("rules/:id")
  updateRule(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string, @Body() dto: UpdateAvailabilityRuleDto) {
    return this.availability.updateRule(ctx, id, dto);
  }

  @Delete("rules/:id")
  deleteRule(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.availability.deleteRule(ctx, id);
  }

  @Get("exceptions")
  listExceptions(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.availability.listExceptions(ctx);
  }

  @Post("exceptions")
  createException(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateAvailabilityExceptionDto) {
    return this.availability.createException(ctx, dto);
  }

  @Patch("exceptions/:id")
  updateException(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string, @Body() dto: UpdateAvailabilityExceptionDto) {
    return this.availability.updateException(ctx, id, dto);
  }

  @Delete("exceptions/:id")
  deleteException(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id") id: string) {
    return this.availability.deleteException(ctx, id);
  }
}
