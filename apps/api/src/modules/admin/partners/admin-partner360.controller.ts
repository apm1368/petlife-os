import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Min } from "class-validator";
import { SellerOfferStatus, SellerStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminPartner360Service } from "./admin-partner360.service";

class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}
class ClinicListDto extends PaginationQueryDto {
  @IsOptional() @IsString() @Length(1, 100) q?: string;
}
class ClinicOverrideDto extends ReasonDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.]{2,80}$/) key!: string;
  @IsOptional() @IsBoolean() boolValue?: boolean;
  @IsOptional() @IsInt() @Min(0) limitValue?: number;
  @IsOptional() @IsBoolean() unlimited?: boolean;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
class SellerStatusDto extends ReasonDto {
  @IsIn(Object.values(SellerStatus)) status!: SellerStatus;
}
class OfferStatusDto extends ReasonDto {
  @IsIn([SellerOfferStatus.SUSPENDED, SellerOfferStatus.PAUSED]) status!: SellerOfferStatus;
}

/** ERP-C partner 360s. Verification actions live on /admin/verification/* (PartnerVerificationService). */
@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPartner360Controller {
  constructor(private readonly partners: AdminPartner360Service) {}

  @Get("providers/:id/overview")
  @RequireAdminPermission("services.view", "verification.manage")
  provider(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) { return this.partners.providerOverview(admin, id); }

  @Get("clinics")
  @RequireAdminPermission("services.view", "verification.manage")
  clinics(@Query() q: ClinicListDto) { return this.partners.clinics(q); }

  @Get("clinics/:id/operations")
  @RequireAdminPermission("services.view", "verification.manage")
  clinic(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) { return this.partners.clinicOperations(admin, id); }

  /** Same policy as household overrides: subscription.entitlement.override is SUPER_ADMIN-only. */
  @Post("clinics/:id/entitlement-overrides")
  @RequireAdminPermission("subscription.entitlement.override")
  createOverride(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ClinicOverrideDto) { return this.partners.createClinicOverride(admin, id, dto); }

  @Post("clinics/:id/entitlement-overrides/:overrideId/revoke")
  @RequireAdminPermission("subscription.entitlement.override")
  revokeOverride(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Param("overrideId", ParseUUIDPipe) overrideId: string, @Body() dto: ReasonDto) { return this.partners.revokeClinicOverride(admin, id, overrideId, dto.reason); }

  @Get("sellers/:id/overview")
  @RequireAdminPermission("commerce.view", "verification.manage")
  seller(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) { return this.partners.sellerOverview(admin, id); }

  @Post("sellers/:id/status")
  @RequireAdminPermission("commerce.manage")
  sellerStatus(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SellerStatusDto) { return this.partners.setSellerStatus(admin, id, dto.status, dto.reason); }

  @Post("commerce/offers/:id/status")
  @RequireAdminPermission("commerce.manage")
  offerStatus(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OfferStatusDto) { return this.partners.setOfferStatus(admin, id, dto.status, dto.reason); }
}
