import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { InsuranceProviderService } from "../../insurance/insurance-provider.service";
import { InsuranceProductService } from "../../insurance/insurance-product.service";
import {
  CreateInsuranceProductDto,
  CreateInsuranceProviderDto,
  ListInsuranceProductsQueryDto,
  ListInsuranceProvidersQueryDto,
  RequestInsuranceMediaUploadDto,
  SetInsuranceListedDto,
  SetInsuranceVerificationStatusDto,
  UpdateInsuranceProductDto,
  UpdateInsuranceProviderDto,
} from "../../insurance/dto/insurance.dto";

@Controller("admin/insurance")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminInsuranceController {
  constructor(
    private readonly providers: InsuranceProviderService,
    private readonly products: InsuranceProductService,
  ) {}

  // -- Providers -------------------------------------------------------------

  @Get("providers")
  @RequireAdminPermission("insurance.view")
  listProviders(@Query() query: ListInsuranceProvidersQueryDto) {
    return this.providers.adminList(query);
  }

  @Get("providers/:providerId")
  @RequireAdminPermission("insurance.view")
  getProvider(@Param("providerId") providerId: string) {
    return this.providers.adminGet(providerId);
  }

  @Post("providers")
  @RequireAdminPermission("insurance.manage")
  createProvider(@Body() dto: CreateInsuranceProviderDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.providers.create(admin, dto);
  }

  @Patch("providers/:providerId")
  @RequireAdminPermission("insurance.manage")
  updateProvider(@Param("providerId") providerId: string, @Body() dto: UpdateInsuranceProviderDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.providers.update(admin, providerId, dto);
  }

  @Post("providers/:providerId/verification")
  @RequireAdminPermission("insurance.manage")
  setProviderVerification(@Param("providerId") providerId: string, @Body() dto: SetInsuranceVerificationStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.providers.setVerificationStatus(admin, providerId, dto);
  }

  @Post("providers/:providerId/listing")
  @RequireAdminPermission("insurance.manage")
  setProviderListed(@Param("providerId") providerId: string, @Body() dto: SetInsuranceListedDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.providers.setPubliclyListed(admin, providerId, dto);
  }

  @Post("providers/:providerId/logo-upload-url")
  @RequireAdminPermission("insurance.manage")
  requestProviderLogoUpload(@Param("providerId") providerId: string, @Body() dto: RequestInsuranceMediaUploadDto) {
    return this.providers.requestLogoUpload(providerId, dto.contentType, dto.fileSizeBytes);
  }

  // -- Products ----------------------------------------------------------------

  @Get("products")
  @RequireAdminPermission("insurance.view")
  listProducts(@Query() query: ListInsuranceProductsQueryDto) {
    return this.products.adminList(query);
  }

  @Get("products/:productId")
  @RequireAdminPermission("insurance.view")
  getProduct(@Param("productId") productId: string) {
    return this.products.adminGet(productId);
  }

  @Post("providers/:providerId/products")
  @RequireAdminPermission("insurance.manage")
  createProduct(@Param("providerId") providerId: string, @Body() dto: CreateInsuranceProductDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.products.create(admin, providerId, dto);
  }

  @Patch("products/:productId")
  @RequireAdminPermission("insurance.manage")
  updateProduct(@Param("productId") productId: string, @Body() dto: UpdateInsuranceProductDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.products.update(admin, productId, dto);
  }

  @Post("products/:productId/verification")
  @RequireAdminPermission("insurance.manage")
  setProductVerification(@Param("productId") productId: string, @Body() dto: SetInsuranceVerificationStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.products.setVerificationStatus(admin, productId, dto);
  }

  @Post("products/:productId/listing")
  @RequireAdminPermission("insurance.manage")
  setProductListed(@Param("productId") productId: string, @Body() dto: SetInsuranceListedDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.products.setPubliclyListed(admin, productId, dto);
  }
}
