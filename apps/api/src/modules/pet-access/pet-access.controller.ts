import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, Length } from "class-validator";
import type { PetAccessFlags } from "@petlife/types";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import type { SessionUser } from "../../common/session/session.service";
import { PetAccessService } from "./pet-access.service";

class GrantAccessDto {
  @IsUUID()
  userId!: string;

  @IsBoolean() canViewIdentity!: boolean;
  @IsBoolean() canEditIdentity!: boolean;
  @IsBoolean() canViewHealth!: boolean;
  @IsBoolean() canEditHealth!: boolean;
  @IsBoolean() canBookCare!: boolean;
  @IsBoolean() canViewCareProfile!: boolean;
  @IsBoolean() canEditCareProfile!: boolean;
  @IsBoolean() canViewLocation!: boolean;
  @IsBoolean() canManageAccess!: boolean;
  @IsBoolean() canRecordClinicalData!: boolean;

  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @Length(0, 240) reason?: string;
}

class UpdateGrantDto {
  @IsOptional() @IsBoolean() canViewIdentity?: boolean;
  @IsOptional() @IsBoolean() canEditIdentity?: boolean;
  @IsOptional() @IsBoolean() canViewHealth?: boolean;
  @IsOptional() @IsBoolean() canEditHealth?: boolean;
  @IsOptional() @IsBoolean() canBookCare?: boolean;
  @IsOptional() @IsBoolean() canViewCareProfile?: boolean;
  @IsOptional() @IsBoolean() canEditCareProfile?: boolean;
  @IsOptional() @IsBoolean() canViewLocation?: boolean;
  @IsOptional() @IsBoolean() canManageAccess?: boolean;
  @IsOptional() @IsBoolean() canRecordClinicalData?: boolean;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @Length(0, 240) reason?: string;
}

@Controller("pets/:petId/access-grants")
@UseGuards(SessionAuthGuard, PetAccessGuard)
@RequirePetAccess("canManageAccess")
export class PetAccessController {
  constructor(private readonly access: PetAccessService) {}

  @Get()
  list(@Param("petId") petId: string) { return this.access.listManagedForPet(petId); }

  @Post()
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: GrantAccessDto) {
    const { userId, startsAt, expiresAt, reason, ...flags } = dto;
    return this.access.createGrant(petId, userId, user.id, flags as PetAccessFlags, { startsAt, expiresAt, reason });
  }

  @Patch(":grantId")
  update(@Param("petId") petId: string, @Param("grantId") grantId: string, @CurrentUser() user: SessionUser, @Body() dto: UpdateGrantDto) {
    return this.access.updateGrant(petId, grantId, user.id, dto);
  }

  @Delete(":grantId")
  revoke(@Param("petId") petId: string, @Param("grantId") grantId: string, @CurrentUser() user: SessionUser) {
    return this.access.revokeGrant(petId, grantId, user.id);
  }
}
