import { Body, Controller, Delete, Get, Put, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { LostPetAreaAlertService } from "./lost-pet-area-alert.service";
import { SetLostPetAreaAlertDto } from "./dto/lost-pet.dto";

/** #290 Q53: the signed-in member's own neighbourhood alert for new lost-pet reports. */
@Controller("me/lost-pet-alert")
@UseGuards(SessionAuthGuard)
export class LostPetAreaAlertController {
  constructor(private readonly alerts: LostPetAreaAlertService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.alerts.get(user.id);
  }

  @Put()
  set(@CurrentUser() user: SessionUser, @Body() dto: SetLostPetAreaAlertDto) {
    return this.alerts.set(user.id, dto);
  }

  @Delete()
  remove(@CurrentUser() user: SessionUser) {
    return this.alerts.remove(user.id);
  }
}
