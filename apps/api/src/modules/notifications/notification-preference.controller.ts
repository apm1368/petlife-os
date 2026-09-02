import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { UpdateNotificationPreferencesDto } from "./dto/notification-preference.dto";

@Controller("notification-preferences")
@UseGuards(SessionAuthGuard)
export class NotificationPreferenceController {
  constructor(private readonly preferences: NotificationPreferenceService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.preferences.getAll(user.id);
  }

  @Patch()
  update(@CurrentUser() user: SessionUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.preferences.update(user.id, dto);
  }
}
