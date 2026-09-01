import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ProviderContextService } from "./provider-context.service";
import { SetProviderContextDto } from "./dto/set-provider-context.dto";

/**
 * Deliberately guarded by SessionAuthGuard only (not ProviderAuthGuard) —
 * this is how the Provider Shell discovers whether the user is a provider at
 * all, and (when ambiguous) lets them choose an organization, so it must
 * work before an active organization can be resolved.
 */
@Controller("provider/me/context")
@UseGuards(SessionAuthGuard)
export class ProviderContextController {
  constructor(private readonly providerContext: ProviderContextService) {}

  @Get()
  getContext(@CurrentUser() user: SessionUser) {
    return this.providerContext.getContextDto(user.id);
  }

  @Put()
  setContext(@CurrentUser() user: SessionUser, @Body() dto: SetProviderContextDto) {
    return this.providerContext.setContext(user.id, dto.providerOrganizationId);
  }
}
