import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminOrgService } from "./admin-org.service";
import { ListOrgsQueryDto } from "./dto/list-orgs-query.dto";

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminOrgController {
  constructor(private readonly orgs: AdminOrgService) {}

  @Get("providers")
  @RequireAdminPermission("verification.manage", "customer.view")
  listProviders(@Query() query: ListOrgsQueryDto) {
    return this.orgs.listProviders(query.q, query);
  }

  @Get("providers/:id")
  @RequireAdminPermission("verification.manage", "customer.view")
  getProvider(@Param("id") id: string) {
    return this.orgs.getProvider(id);
  }

  @Get("sellers")
  @RequireAdminPermission("verification.manage", "customer.view")
  listSellers(@Query() query: ListOrgsQueryDto) {
    return this.orgs.listSellers(query.q, query);
  }

  @Get("sellers/:id")
  @RequireAdminPermission("verification.manage", "customer.view")
  getSeller(@Param("id") id: string) {
    return this.orgs.getSeller(id);
  }
}
