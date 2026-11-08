import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsString, Length, Max, Min } from "class-validator";
import { PetMemorialStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminPetMemorialService } from "./admin-pet-memorial.service";

class ListMemorialsQuery {
  @IsEnum(PetMemorialStatus) status: PetMemorialStatus = PetMemorialStatus.PENDING_REVIEW;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) page = 1;
}

class ReviewMemorialDto {
  @IsIn(["APPROVE", "REJECT"]) action!: "APPROVE" | "REJECT";
  @IsString() @Length(3, 1000) reason!: string;
}

/** Uses existing Trust & Safety authorization; no new permission is introduced. */
@Controller("admin/pet-memorials")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPetMemorialController {
  constructor(private readonly memorials: AdminPetMemorialService) {}

  @Get()
  @RequireAdminPermission("trust.view")
  list(@Query() query: ListMemorialsQuery) {
    return this.memorials.list(query.status, query.page);
  }

  @Post(":id/review")
  @RequireAdminPermission("trust.manage")
  review(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewMemorialDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.memorials.review(admin, id, dto.action, dto.reason, request.requestId);
  }
}
