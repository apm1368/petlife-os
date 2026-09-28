import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { OrderRefundRequestStatus, OrderStatus, ProductReviewStatus, ProductStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { PromotionManagementService, type PromotionActor } from "../../commerce/promotions/promotion-management.service";
import { ListPromotionsQueryDto, PromotionInputDto, PromotionTransitionDto, UpdatePromotionDto } from "../../commerce/promotions/dto/promotion.dto";
import { AdminCommerceService } from "./admin-commerce.service";

const toBool = ({ value }: { value: unknown }) => value === true || value === "true" || value === "1";

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}

class AdminOrderQueryDto extends PageDto {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsUUID() sellerId?: string;
  @IsOptional() @IsString() @MaxLength(40) q?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() refundRequested?: boolean;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class RefundRequestQueryDto extends PageDto {
  @IsOptional() @IsEnum(OrderRefundRequestStatus) status?: OrderRefundRequestStatus;
}

class ProductQueryDto extends PageDto {
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() categoryId?: string;
}

class ReviewQueryDto extends PageDto {
  @IsOptional() @IsEnum(ProductReviewStatus) status?: ProductReviewStatus;
}

class InventoryQueryDto extends PageDto {
  @IsOptional() @Transform(toBool) @IsBoolean() lowStock?: boolean;
  @IsOptional() @IsUUID() sellerId?: string;
}

class AnalyticsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

class DecisionNoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

class ProductStatusDto extends ReasonDto {
  @IsIn([ProductStatus.ACTIVE, ProductStatus.INACTIVE, ProductStatus.ARCHIVED]) status!: ProductStatus;
}

class ReviewVisibilityDto extends ReasonDto {
  @IsBoolean() hidden!: boolean;
}

function platformActor(admin: ResolvedAdminContext): PromotionActor {
  return { kind: "PLATFORM", userId: admin.userId };
}

/** Admin Commerce (Batch 4) — see AdminCommerceService for the permission model. */
@Controller("admin/commerce")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCommerceController {
  constructor(
    private readonly commerce: AdminCommerceService,
    private readonly promotions: PromotionManagementService,
  ) {}

  @Get("orders")
  @RequireAdminPermission("commerce.view")
  listOrders(@Query() query: AdminOrderQueryDto) {
    return this.commerce.listOrders(query);
  }

  @Get("orders/:id")
  @RequireAdminPermission("commerce.view")
  getOrder(@Param("id", ParseUUIDPipe) id: string) {
    return this.commerce.getOrder(id);
  }

  @Get("refund-requests")
  @RequireAdminPermission("commerce.view")
  listRefundRequests(@Query() query: RefundRequestQueryDto) {
    return this.commerce.listRefundRequests(query.status, query.page);
  }

  @Post("refund-requests/:id/approve")
  @RequireAdminPermission("finance.refund.request")
  approveRefundRequest(@Param("id", ParseUUIDPipe) id: string, @Body() dto: DecisionNoteDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.commerce.approveRefundRequest(admin, id, dto.note, req.requestId);
  }

  @Post("refund-requests/:id/reject")
  @RequireAdminPermission("finance.refund.request")
  rejectRefundRequest(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.commerce.rejectRefundRequest(admin, id, dto.reason, req.requestId);
  }

  @Get("products")
  @RequireAdminPermission("commerce.view")
  listProducts(@Query() query: ProductQueryDto) {
    return this.commerce.listProducts(query);
  }

  @Patch("products/:id/status")
  @RequireAdminPermission("commerce.manage")
  setProductStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ProductStatusDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.commerce.setProductStatus(admin, id, dto.status, dto.reason, req.requestId);
  }

  @Get("reviews")
  @RequireAdminPermission("commerce.view")
  listReviews(@Query() query: ReviewQueryDto) {
    return this.commerce.listReviews(query.status, query.page);
  }

  @Patch("reviews/:id/visibility")
  @RequireAdminPermission("commerce.manage")
  setReviewVisibility(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewVisibilityDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.commerce.setReviewVisibility(admin, id, dto.hidden, dto.reason, req.requestId);
  }

  @Get("inventory")
  @RequireAdminPermission("commerce.view")
  listInventory(@Query() query: InventoryQueryDto) {
    return this.commerce.listInventory(query);
  }

  @Get("sellers")
  @RequireAdminPermission("commerce.view")
  listSellers() {
    return this.commerce.listSellers();
  }

  @Get("analytics")
  @RequireAdminPermission("commerce.view")
  analytics(@Query() query: AnalyticsQueryDto) {
    return this.commerce.analytics(query.days ?? 30);
  }

  @Get("promotions")
  @RequireAdminPermission("commerce.view")
  listPromotions(@Query() query: ListPromotionsQueryDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.promotions.list(platformActor(admin), query.status);
  }

  @Get("promotions/:id")
  @RequireAdminPermission("commerce.view")
  getPromotion(@Param("id", ParseUUIDPipe) id: string, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.promotions.get(platformActor(admin), id);
  }

  @Post("promotions")
  @RequireAdminPermission("promotions.manage")
  async createPromotion(@Body() dto: PromotionInputDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const row = await this.promotions.create(platformActor(admin), dto);
    await this.commerce.auditPromotion(admin, "created", row.id, { name: row.name, scope: row.scope, discountType: row.discountType, value: row.value }, req.requestId);
    return row;
  }

  @Patch("promotions/:id")
  @RequireAdminPermission("promotions.manage")
  async updatePromotion(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const row = await this.promotions.update(platformActor(admin), id, dto);
    await this.commerce.auditPromotion(admin, "updated", id, { ...dto }, req.requestId);
    return row;
  }

  @Post("promotions/:id/status")
  @RequireAdminPermission("promotions.manage")
  async transitionPromotion(@Param("id", ParseUUIDPipe) id: string, @Body() dto: PromotionTransitionDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const row = await this.promotions.transition(platformActor(admin), id, dto.status);
    await this.commerce.auditPromotion(admin, "status_changed", id, { status: row.status }, req.requestId);
    return row;
  }
}
