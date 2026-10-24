import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminSystemService } from "./admin-system.service";

@Controller("admin/system")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSystemController {
  constructor(private readonly system: AdminSystemService) {}

  @Get("health")
  @RequireAdminPermission("system.view")
  health() { return this.system.health(); }

  @Get("integrations")
  @RequireAdminPermission("system.view")
  integrations() { return this.system.integrations(); }
}
