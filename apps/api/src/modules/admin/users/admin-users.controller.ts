import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminUsersService } from "./admin-users.service";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";

/**
 * W2-5 unified users directory. Gated on `customer.view` — the existing "may look people up" grant,
 * held by SUPER_ADMIN, ADMIN, SUPPORT, VERIFICATION and the operational roles — so the directory
 * reaches the same staff who can already open a Customer 360, and no new permission is minted. It
 * carries no vertical decorator on purpose: a cross-role directory is not one vertical's data.
 */
@Controller("admin/users")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequireAdminPermission("customer.view")
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(":id")
  @RequireAdminPermission("customer.view")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.users.getProfile(id);
  }
}
