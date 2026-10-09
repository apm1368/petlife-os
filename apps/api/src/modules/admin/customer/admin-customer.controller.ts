import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { UserAccountStatus } from "@prisma/client";
import { AdminCustomerOverviewService } from "./admin-customer-overview.service";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminCustomerService } from "./admin-customer.service";
import { RevealPiiDto } from "./dto/reveal-pii.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";

class AccountActionDto {
  @IsString() @Length(5, 500) reason!: string;
}

@Controller("admin/customers")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCustomerController {
  constructor(
    private readonly customers: AdminCustomerService,
    private readonly overviews: AdminCustomerOverviewService,
  ) {}

  @Get()
  @RequireAdminPermission("customer.view")
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.search(query.q ?? "", query);
  }

  @Get(":id")
  @RequireAdminPermission("customer.view")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.customers.getCustomer360(id);
  }

  @Post(":id/reveal")
  @RequireAdminPermission("customer.pii.reveal")
  reveal(@Param("id", ParseUUIDPipe) id: string, @Body() body: RevealPiiDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.customers.revealField(admin, id, body.field, body.reason, request.requestId);
  }

  /** ERP-B Customer 360 overview: every domain as counts/states; finance only with finance.view. */
  @Get(":id/overview")
  @RequireAdminPermission("customer.view")
  overview(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.overviews.overview(admin, id);
  }

  @Post(":id/suspend")
  @RequireAdminPermission("customer.account.manage")
  suspend(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AccountActionDto) {
    return this.overviews.setAccountStatus(admin, id, UserAccountStatus.SUSPENDED, dto.reason);
  }

  @Post(":id/unsuspend")
  @RequireAdminPermission("customer.account.manage")
  unsuspend(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AccountActionDto) {
    return this.overviews.setAccountStatus(admin, id, UserAccountStatus.ACTIVE, dto.reason);
  }

  @Post(":id/sessions/revoke")
  @RequireAdminPermission("customer.sessions.revoke")
  revokeSessions(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AccountActionDto) {
    return this.overviews.revokeSessions(admin, id, dto.reason);
  }
}
