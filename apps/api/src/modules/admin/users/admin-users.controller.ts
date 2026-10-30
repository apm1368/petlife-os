import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminUsersService } from "./admin-users.service";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";

class SendUserMessageDto {
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsString() @MinLength(3) @MaxLength(700) message!: string;
  /** When false, write only the in-app message; default honours the recipient's SMS preferences. */
  @IsOptional() @IsBoolean() attemptSms?: boolean;
}

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

  @Post(":id/message")
  @RequireAdminPermission("support.manage")
  sendMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SendUserMessageDto,
    @CurrentAdmin() admin: ResolvedAdminContext,
    @Req() req: AdminAuthedRequest,
  ) {
    return this.users.sendMessage(admin, id, dto, req.requestId);
  }
}
