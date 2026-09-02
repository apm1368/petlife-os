import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminCustomerService } from "./admin-customer.service";
import { RevealPiiDto } from "./dto/reveal-pii.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";

@Controller("admin/customers")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCustomerController {
  constructor(private readonly customers: AdminCustomerService) {}

  @Get()
  @RequireAdminPermission("customer.view")
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.search(query.q ?? "", query);
  }

  @Get(":id")
  @RequireAdminPermission("customer.view")
  get(@Param("id") id: string) {
    return this.customers.getCustomer360(id);
  }

  @Post(":id/reveal")
  @RequireAdminPermission("customer.pii.reveal")
  reveal(@Param("id") id: string, @Body() body: RevealPiiDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.customers.revealField(admin, id, body.field, body.reason, request.requestId);
  }
}
