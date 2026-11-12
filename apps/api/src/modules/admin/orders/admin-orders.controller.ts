import { Controller, Get, Header, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsDate, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from "class-validator";
import type { Response } from "express";
import type { AdminOrderPaymentState, AdminOrderSection, AdminOrderStage } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminOrdersService, ORDER_SECTIONS } from "./admin-orders.service";

const STAGES: AdminOrderStage[] = ["OPEN", "COMPLETED", "CANCELLED"];
const PAYMENT_STATES: AdminOrderPaymentState[] = ["PAID", "PENDING", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED", "NOT_REQUIRED", "ON_ARRIVAL", "UNKNOWN"];

class OrdersQueryDto {
  @IsOptional() @IsIn(["ALL", ...ORDER_SECTIONS]) section?: AdminOrderSection | "ALL";
  @IsOptional() @IsString() @Length(1, 60) q?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z_]{2,40}$/) status?: string;
  @IsOptional() @IsIn(STAGES) stage?: AdminOrderStage;
  @IsOptional() @IsIn(PAYMENT_STATES) payment?: AdminOrderPaymentState;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @Length(1, 60) city?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @IsString() @Length(10, 80) before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
class DetailParam {
  @IsIn(ORDER_SECTIONS) section!: AdminOrderSection;
  @IsUUID() id!: string;
}

/**
 * Admin → Orders. Reaching the controller needs any section's view permission; each section then applies its own
 * (commerce.view + SHOP, services.view with provider-type scope, travel.view + ACCOMMODATION, animalSupport.view,
 * subscription.view). Export additionally needs orders.export and is audited.
 */
@Controller("admin/orders")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
@RequireAdminPermission("commerce.view", "services.view", "travel.view", "animalSupport.view", "subscription.view")
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@CurrentAdmin() admin: ResolvedAdminContext, @Query() q: OrdersQueryDto) {
    return this.orders.list(admin, { ...q, section: q.section ?? "ALL" });
  }

  @Get("export")
  @RequireAdminPermission("orders.export")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Cache-Control", "no-store")
  async export(@CurrentAdmin() admin: ResolvedAdminContext, @Query() q: OrdersQueryDto, @Res({ passthrough: true }) res: Response) {
    const file = await this.orders.export(admin, { ...q, section: q.section ?? "ALL" });
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("X-Export-Rows", String(file.rows));
    return file.csv;
  }

  @Get(":section/:id")
  @Header("Cache-Control", "no-store")
  detail(@CurrentAdmin() admin: ResolvedAdminContext, @Param() p: DetailParam) {
    return this.orders.detail(admin, p.section, p.id);
  }
}
