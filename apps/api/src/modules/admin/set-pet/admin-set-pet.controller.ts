import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { AdminVertical, SetPetRequestStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminVertical } from "../auth/require-admin-vertical.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminSetPetService } from "./admin-set-pet.service";

class ListDto {
  @IsOptional() @IsIn(Object.values(SetPetRequestStatus)) status?: SetPetRequestStatus;
  /** A request number (SP-000123 or 123) or the member's name. */
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}
class QuoteDto {
  /** IRR; at least 10,000 IRR (1,000 toman). */
  @IsInt() @Min(10_000) @Max(2_000_000_000) amountIrr!: number;
  @IsISO8601() estimatedReadyAt!: string;
  /** What the price covers and anything the member should know; shown to the member. */
  @IsString() @Length(3, 1000) note!: string;
}
class StatusDto {
  @IsIn([SetPetRequestStatus.IN_PRODUCTION, SetPetRequestStatus.SHIPPED, SetPetRequestStatus.CANCELLED]) to!: SetPetRequestStatus;
  /** Required for a cancellation (the member reads it). */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** Carrier and tracking details for a shipment. */
  @IsOptional() @IsString() @MaxLength(500) shippingNote?: string;
}
class NoteDto {
  @IsString() @MaxLength(2000) note!: string;
}
class DownloadDto {
  @IsString() @Length(5, 300) reason!: string;
}

/** Admin «ست پت» (owner, 2026-11-13): commerce.view reads requests; commerce.manage quotes and moves them. */
@Controller("admin/set-pet")
@RequireAdminVertical(AdminVertical.SHOP)
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSetPetController {
  constructor(private readonly setPet: AdminSetPetService) {}

  @Get("requests")
  @RequireAdminPermission("commerce.view")
  list(@Query() query: ListDto) {
    return this.setPet.list(query);
  }

  @Get("requests/:id")
  @RequireAdminPermission("commerce.view")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.setPet.detail(id);
  }

  @Post("requests/:id/quote")
  @RequireAdminPermission("commerce.manage")
  quote(@Param("id", ParseUUIDPipe) id: string, @Body() dto: QuoteDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.quote(admin, id, dto, req.requestId);
  }

  @Post("requests/:id/status")
  @RequireAdminPermission("commerce.manage")
  status(@Param("id", ParseUUIDPipe) id: string, @Body() dto: StatusDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.changeStatus(admin, id, dto, req.requestId);
  }

  @Put("requests/:id/admin-note")
  @RequireAdminPermission("commerce.manage")
  note(@Param("id", ParseUUIDPipe) id: string, @Body() dto: NoteDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.saveAdminNote(admin, id, dto.note, req.requestId);
  }

  /** Audited private download of one design (always an attachment). */
  @Post("files/:id/download")
  @RequireAdminPermission("commerce.view")
  download(@Param("id", ParseUUIDPipe) id: string, @Body() dto: DownloadDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.downloadDesign(admin, id, dto.reason.trim(), req.requestId);
  }
}
