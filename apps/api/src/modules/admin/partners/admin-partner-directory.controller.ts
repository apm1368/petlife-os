import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import { ProviderType, ProviderVerificationStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminPartnerDirectoryService } from "./admin-partner-directory.service";

class DirectoryQueryDto extends PaginationQueryDto {
  /** Name, phone or city. */
  @IsOptional() @IsString() @Length(1, 100) q?: string;
  @IsOptional() @IsString() @Length(1, 60) province?: string;
}
class ServiceDirectoryQueryDto extends DirectoryQueryDto {
  @IsOptional() @IsIn(Object.values(ProviderVerificationStatus)) verification?: ProviderVerificationStatus;
  @IsOptional() @IsIn(Object.values(ProviderType)) kind?: ProviderType;
}
class ShopDirectoryQueryDto extends DirectoryQueryDto {
  @IsOptional() @IsIn(Object.values(SellerVerificationStatus)) verification?: SellerVerificationStatus;
  @IsOptional() @IsIn(Object.values(SellerStatus)) status?: SellerStatus;
}

/**
 * Admin Partners: Services (vet, groomer, boarding, sitter, trainer, taxi…) and
 * Shops as two directories with a full profile each. Readable by partner ops
 * (verification.manage), customer care (customer.view) and each side's own
 * team (services.view / commerce.view). Read-only.
 */
@Controller("admin/partners")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPartnerDirectoryController {
  constructor(private readonly directory: AdminPartnerDirectoryService) {}

  @Get("services")
  @RequireAdminPermission("services.view", "verification.manage", "customer.view")
  listServices(@CurrentAdmin() admin: ResolvedAdminContext, @Query() query: ServiceDirectoryQueryDto) {
    return this.directory.listServices(admin, query);
  }

  @Get("services/:id")
  @RequireAdminPermission("services.view", "verification.manage", "customer.view")
  service(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.directory.serviceDetail(admin, id);
  }

  @Get("shops")
  @RequireAdminPermission("commerce.view", "verification.manage", "customer.view")
  listShops(@Query() query: ShopDirectoryQueryDto) {
    return this.directory.listShops(query);
  }

  @Get("shops/:id")
  @RequireAdminPermission("commerce.view", "verification.manage", "customer.view")
  shop(@Param("id", ParseUUIDPipe) id: string) {
    return this.directory.shopDetail(id);
  }
}
