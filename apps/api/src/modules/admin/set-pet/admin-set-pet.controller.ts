import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";
import { AdminVertical, SetPetRequestStatus } from "@prisma/client";
import type { SetPetGarment, SetPetZone } from "@petlife/types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminVertical } from "../auth/require-admin-vertical.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminSetPetService } from "./admin-set-pet.service";

class ListDto {
  @IsOptional() @IsIn(Object.values(SetPetRequestStatus)) status?: SetPetRequestStatus;
  /** An order number (SP-000123 or 123) or the member's name. */
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}
class ProofTargetDto {
  @IsString() @Length(3, 60) contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) fileSizeBytes!: number;
}
class SendProofDto {
  /** Shown to the member with the proof. */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** Owner P28: staff set the pet print size. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(60) petPrintWidthCm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(60) petPrintHeightCm?: number;
}
class RejectDesignDto {
  /** Why the design can't be printed (unsuitable or copyrighted); the member reads it. */
  @IsString() @Length(3, 1000) reason!: string;
}
class StatusDto {
  @IsIn([SetPetRequestStatus.IN_PRODUCTION, SetPetRequestStatus.SHIPPED, SetPetRequestStatus.CANCELLED]) to!: SetPetRequestStatus;
  /** Required for a cancellation (the member reads it). */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** Carrier and tracking details for a shipment. */
  @IsOptional() @IsString() @MaxLength(500) shippingNote?: string;
  /** After printing started, a cancellation (with refund) is only for a print defect, confirmed here. */
  @IsOptional() @IsBoolean() printDefect?: boolean;
}
class NoteDto {
  @IsString() @MaxLength(2000) note!: string;
}
class DownloadDto {
  @IsString() @Length(5, 300) reason!: string;
}
class SettingsDto {
  @IsObject() garmentPricesIrr!: Partial<Record<SetPetGarment, number>>;
  @IsObject() zonePricesIrr!: Partial<Record<SetPetZone, number>>;
  @Type(() => Number) @IsInt() @Min(0) @Max(90) setDiscountPercent!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(60) productionWorkingDays!: number;
  @IsOptional() @IsString() @MaxLength(80) workshopCity?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() workshopLatitude?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() workshopLongitude?: number | null;
}

/** Admin «ست پت»: commerce.view reads orders and settings; commerce.manage sends proofs, moves orders and edits prices. */
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

  @Post("requests/:id/proofs/upload-target")
  @RequireAdminPermission("commerce.manage")
  proofTarget(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ProofTargetDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.setPet.proofUploadTarget(admin, id, dto);
  }

  @Post("requests/:id/proofs/:proofId/send")
  @RequireAdminPermission("commerce.manage")
  sendProof(@Param("id", ParseUUIDPipe) id: string, @Param("proofId", ParseUUIDPipe) proofId: string, @Body() dto: SendProofDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.sendProof(admin, id, proofId, dto, req.requestId);
  }

  @Get("requests/:id/proofs/:proofId")
  @RequireAdminPermission("commerce.view")
  proof(@Param("id", ParseUUIDPipe) id: string, @Param("proofId", ParseUUIDPipe) proofId: string) {
    return this.setPet.proofLink(id, proofId);
  }

  @Post("requests/:id/reject-design")
  @RequireAdminPermission("commerce.manage")
  rejectDesign(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RejectDesignDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.rejectDesign(admin, id, dto.reason, req.requestId);
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

  /** Audited private download of one design printed on this order (always an attachment). */
  @Post("requests/:id/files/:fileId/download")
  @RequireAdminPermission("commerce.view")
  download(@Param("id", ParseUUIDPipe) id: string, @Param("fileId", ParseUUIDPipe) fileId: string, @Body() dto: DownloadDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.downloadDesign(admin, id, fileId, dto.reason.trim(), req.requestId);
  }

  @Get("settings")
  @RequireAdminPermission("commerce.view")
  settings() {
    return this.setPet.settings();
  }

  @Put("settings")
  @RequireAdminPermission("commerce.manage")
  saveSettings(@Body() dto: SettingsDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    return this.setPet.saveSettings(admin, { ...dto, workshopCity: dto.workshopCity ?? null, workshopLatitude: dto.workshopLatitude ?? null, workshopLongitude: dto.workshopLongitude ?? null }, req.requestId);
  }
}
