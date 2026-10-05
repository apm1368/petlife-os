import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import { NOTIFICATION_GROUPS, type NotificationGroup } from "./notification-groups";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PaginationQueryDto } from "../../common/pagination/pagination.dto";
import { NotificationsService } from "./notifications.service";

/**
 * Every route is scoped to the caller's own `userId` (spec Flow I: "User A
 * cannot read/update User B notifications/preferences") — there is no
 * `:userId` path param anywhere in this controller to get wrong.
 */
class GroupQueryDto {
  @IsOptional() @IsIn(NOTIFICATION_GROUPS) group?: NotificationGroup;
}
class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(NOTIFICATION_GROUPS) group?: NotificationGroup;
}
class ReadGroupKeyDto {
  @IsString() @Length(3, 200) groupKey!: string;
}

@Controller("notifications")
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, query);
  }

  /** Server-computed groups of the recent inbox (same type + same entity collapse; unrelated never merge). */
  @Get("grouped")
  grouped(@CurrentUser() user: SessionUser) {
    return this.notifications.grouped(user.id);
  }

  @Post("groups/read")
  readGroupKey(@CurrentUser() user: SessionUser, @Body() dto: ReadGroupKeyDto) {
    return this.notifications.markGroupKeyRead(user.id, dto.groupKey);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: SessionUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id);
  }

  /** Everything, or only one group with ?group=CARE etc. Always the caller's own notifications. */
  @Post("read-all")
  markAllRead(@CurrentUser() user: SessionUser, @Query() query: GroupQueryDto) {
    return this.notifications.markAllRead(user.id, query.group);
  }
}
