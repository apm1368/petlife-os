import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { AdminAccessService } from "./admin-access.service";

/**
 * Deliberately behind SessionAuthGuard only, never AdminAuthGuard — a
 * non-admin authenticated user must get a normal 200 response with
 * `isAdmin: false`, not a 403, so the Admin Shell can render a friendly
 * "you are not an admin" screen instead of treating every ordinary
 * consumer session as an error case.
 */
@Controller("admin/me")
@UseGuards(SessionAuthGuard)
export class AdminMeController {
  constructor(private readonly adminAccess: AdminAccessService) {}

  @Get()
  getMe(@CurrentUser() user: SessionUser) {
    return this.adminAccess.getSessionContext(user.id);
  }
}
