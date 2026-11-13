import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { PetOwnershipTransferStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminOwnershipService } from "./admin-ownership.service";

class ListQuery {
  @IsOptional() @IsIn(Object.values(PetOwnershipTransferStatus)) status?: PetOwnershipTransferStatus;
  @IsOptional() @IsString() @Length(1, 80) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
class ReasonDto {
  @IsString() @Length(5, 1000) reason!: string;
}

/** Ownership transfers and disputes: reading needs customer.view; closing a dispute is customer.account.manage, with a reason. */
@Controller("admin/pet-ownership")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminOwnershipController {
  constructor(private readonly ownership: AdminOwnershipService) {}

  @Get("transfers")
  @RequireAdminPermission("customer.view")
  list(@Query() q: ListQuery) {
    return this.ownership.list(q);
  }

  @Get("transfers/:id")
  @RequireAdminPermission("customer.view")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.ownership.get(id);
  }

  @Post("transfers/:id/close-dispute")
  @RequireAdminPermission("customer.account.manage")
  close(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.ownership.closeDispute(admin, id, dto.reason.trim());
  }
}
