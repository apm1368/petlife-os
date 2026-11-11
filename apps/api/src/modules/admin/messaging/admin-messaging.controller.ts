import { Body, Controller, Get, Header, Post, Query, Req, UseGuards } from "@nestjs/common";
import { NotificationDeliveryStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminMessagingService } from "./admin-messaging.service";

class DeliveryQueryDto {
  @IsOptional() @IsIn(["SMS", "EMAIL"]) channel?: "SMS" | "EMAIL";
  @IsOptional() @IsEnum(NotificationDeliveryStatus) status?: NotificationDeliveryStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class TestSmsDto {
  @IsString() @Length(8, 20) phone!: string;
}

class TestEmailDto {
  @IsEmail() to!: string;
  @IsOptional() @IsIn(["fa", "en", "de", "es"]) locale?: "fa" | "en" | "de" | "es";
}

/** Messaging console. Reading needs system.view; sending a test needs settings.manage and is audited. */
@Controller("admin/messaging")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminMessagingController {
  constructor(private readonly messaging: AdminMessagingService) {}

  @Get("status")
  @RequireAdminPermission("system.view")
  @Header("Cache-Control", "no-store")
  status() {
    return this.messaging.status();
  }

  @Get("deliveries")
  @RequireAdminPermission("system.view")
  @Header("Cache-Control", "no-store")
  deliveries(@Query() query: DeliveryQueryDto) {
    return this.messaging.deliveries(query);
  }

  @Post("test-sms")
  @RequireAdminPermission("settings.manage")
  testSms(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: TestSmsDto, @Req() req: AdminAuthedRequest) {
    return this.messaging.testSms(admin, dto.phone, req.requestId);
  }

  @Post("test-email")
  @RequireAdminPermission("settings.manage")
  testEmail(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: TestEmailDto, @Req() req: AdminAuthedRequest) {
    return this.messaging.testEmail(admin, dto.to, dto.locale ?? "fa", req.requestId);
  }

  @Post("verify-email")
  @RequireAdminPermission("settings.manage")
  verifyEmail() {
    return this.messaging.verifyEmail();
  }
}
