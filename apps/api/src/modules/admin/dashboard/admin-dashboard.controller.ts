import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AdminDashboardService } from "./admin-dashboard.service";

/** Any ACTIVE admin may see the dashboard counts (no @RequireAdminPermission) — mirrors how a read-only summary is the one thing every role needs regardless of their specific permissions. */
@Controller("admin/dashboard")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  getSummary() {
    return this.dashboard.getSummary();
  }
}
