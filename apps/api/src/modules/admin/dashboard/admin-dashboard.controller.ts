import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AdminDashboardService } from "./admin-dashboard.service";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/** Every active admin can open the dashboard; each count is independently permission-gated. */
@Controller("admin/dashboard")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  getSummary(@CurrentAdmin() admin: ResolvedAdminContext) {
    return this.dashboard.getSummary(admin);
  }
}
