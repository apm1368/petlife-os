import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminCustomerService } from "./admin-customer.service";

/** Operational search across customers/orders/support cases — Postgres pattern matching only (spec: "no Elasticsearch"). Kept as its own controller/route (/admin/search) since it spans multiple entity types, unlike /admin/customers which is scoped to one. */
@Controller("admin/search")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSearchController {
  constructor(private readonly customers: AdminCustomerService) {}

  @Get()
  @RequireAdminPermission("customer.view", "support.view")
  search(@Query("q") q: string | undefined) {
    return this.customers.globalSearch(q ?? "");
  }
}
