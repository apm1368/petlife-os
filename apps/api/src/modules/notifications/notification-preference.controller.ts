import { Body, Controller, Get, Patch, Put, UseGuards } from "@nestjs/common";
import { IsIn } from "class-validator";
import { NOTIFICATION_GROUPS, type NotificationGroup } from "./notification-groups";
import { NotificationsService } from "./notifications.service";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { UpdateNotificationPreferencesDto } from "./dto/notification-preference.dto";

class DigestPreferenceDto {
  @IsIn(NOTIFICATION_GROUPS) group!: NotificationGroup;
  @IsIn(["INSTANT", "DAILY", "OFF"]) mode!: "INSTANT" | "DAILY" | "OFF";
}

@Controller("notification-preferences")
@UseGuards(SessionAuthGuard)
export class NotificationPreferenceController {
  constructor(
    private readonly preferences: NotificationPreferenceService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.preferences.getAll(user.id);
  }

  @Patch()
  update(@CurrentUser() user: SessionUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.preferences.update(user.id, dto);
  }

  /** INSTANT / DAILY / OFF per group — stored only (deliveryStatus STORED_ONLY) until a digest channel exists. */
  @Get("digest")
  digest(@CurrentUser() user: SessionUser) {
    return this.notifications.digestPreferences(user.id);
  }

  @Put("digest")
  setDigest(@CurrentUser() user: SessionUser, @Body() dto: DigestPreferenceDto) {
    return this.notifications.setDigestPreference(user.id, dto.group, dto.mode);
  }
}
