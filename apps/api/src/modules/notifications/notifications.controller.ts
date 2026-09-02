import { Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
@Controller("notifications")
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() query: PaginationQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: SessionUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: SessionUser) {
    return this.notifications.markAllRead(user.id);
  }
}
