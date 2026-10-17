import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { LostPetIncidentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminLostPetService } from "./admin-lost-pet.service";

class ListQueryDto {
  @IsOptional() @IsEnum(LostPetIncidentStatus) status?: LostPetIncidentStatus;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}

/** Lost Pet operations — trust.view to see, customer.pii.reveal to reveal the exact location, trust.manage to close. */
@Controller("admin/lost-pets")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminLostPetController {
  constructor(private readonly lostPets: AdminLostPetService) {}

  @Get()
  @RequireAdminPermission("trust.view")
  list(@Query() query: ListQueryDto) {
    return this.lostPets.list(query);
  }

  @Get(":incidentId")
  @RequireAdminPermission("trust.view")
  get(@Param("incidentId", ParseUUIDPipe) incidentId: string) {
    return this.lostPets.get(incidentId);
  }

  @Post(":incidentId/reveal-location")
  @HttpCode(200)
  @RequireAdminPermission("customer.pii.reveal")
  reveal(@Param("incidentId", ParseUUIDPipe) incidentId: string, @Body() dto: ReasonDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.lostPets.revealLocation(admin, incidentId, dto.reason, req.requestId);
  }

  @Post(":incidentId/close")
  @HttpCode(200)
  @RequireAdminPermission("trust.manage")
  close(@Param("incidentId", ParseUUIDPipe) incidentId: string, @Body() dto: ReasonDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.lostPets.close(admin, incidentId, dto.reason, req.requestId);
  }
}
