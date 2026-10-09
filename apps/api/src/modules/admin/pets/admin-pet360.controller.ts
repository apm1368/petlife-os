import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import { PetSpecies } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminPet360Service } from "./admin-pet360.service";

class PetSearchDto extends PaginationQueryDto {
  @IsOptional() @IsString() @Length(1, 100) q?: string;
  @IsOptional() @IsIn(Object.values(PetSpecies)) species?: PetSpecies;
}
class RevokeGrantDto {
  @IsString() @Length(5, 500) reason!: string;
}

@Controller("admin/pets")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPet360Controller {
  constructor(private readonly pets: AdminPet360Service) {}

  @Get()
  @RequireAdminPermission("customer.view")
  search(@Query() q: PetSearchDto) { return this.pets.search(q); }

  @Get(":id")
  @RequireAdminPermission("customer.view")
  get(@Param("id", ParseUUIDPipe) id: string) { return this.pets.get(id); }

  @Post(":id/grants/:grantId/revoke")
  @RequireAdminPermission("pet.access.manage")
  revoke(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Param("grantId", ParseUUIDPipe) grantId: string, @Body() dto: RevokeGrantDto) {
    return this.pets.revokeGrant(admin, id, grantId, dto.reason);
  }
}
