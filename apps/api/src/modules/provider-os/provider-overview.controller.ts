import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderOverviewService } from "./provider-overview.service";

@Controller("provider/me")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderOverviewController {
  constructor(private readonly overview: ProviderOverviewService) {}

  @Get("overview")
  getOverview(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.overview.getOverview(ctx);
  }
}
