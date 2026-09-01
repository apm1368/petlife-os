import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderTeamService } from "./provider-team.service";

@Controller("provider/team")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderTeamController {
  constructor(private readonly team: ProviderTeamService) {}

  @Get()
  list(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.team.list(ctx);
  }
}
