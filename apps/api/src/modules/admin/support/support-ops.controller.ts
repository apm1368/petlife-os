import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { SupportAttachmentVisibility, SupportLinkEntityType } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { SupportOpsService } from "./support-ops.service";
import { DisputeOutcomeService } from "../dispute/dispute-outcome.service";

const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
class TagsDto { @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 40, { each: true }) tags!: string[]; }
class LinkDto { @IsIn(Object.values(SupportLinkEntityType)) entityType!: SupportLinkEntityType; @IsUUID() entityId!: string; }
class UploadDto { @IsIn(MIME) contentType!: string; @IsInt() @Min(1) @Max(20 * 1024 * 1024) fileSizeBytes!: number; }
class RegisterDto extends UploadDto { @IsString() @Length(10, 300) objectKey!: string; @IsOptional() @IsIn(Object.values(SupportAttachmentVisibility)) visibility?: SupportAttachmentVisibility; }
class SlaQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number; }
class RefundOutcomeDto { @IsInt() @Min(1) amount!: number; @IsString() @Length(5, 500) reason!: string; }

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSupportOpsController {
  constructor(
    private readonly ops: SupportOpsService,
    private readonly outcomes: DisputeOutcomeService,
  ) {}

  @Get("support/:id/extras")
  @RequireAdminPermission("support.view")
  extras(@Param("id", ParseUUIDPipe) id: string) { return this.ops.extras(id); }

  @Put("support/:id/tags")
  @RequireAdminPermission("support.manage")
  tags(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TagsDto) { return this.ops.setTags(admin, id, dto.tags); }

  @Post("support/:id/links")
  @RequireAdminPermission("support.manage")
  link(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: LinkDto) { return this.ops.addLink(admin, id, dto.entityType, dto.entityId); }

  @Delete("support/:id/links/:linkId")
  @RequireAdminPermission("support.manage")
  unlink(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Param("linkId", ParseUUIDPipe) linkId: string) { return this.ops.removeLink(admin, id, linkId); }

  @Post("support/:id/attachments/uploads")
  @RequireAdminPermission("support.manage")
  upload(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UploadDto) { return this.ops.uploadTarget(id, dto.contentType, dto.fileSizeBytes); }

  @Post("support/:id/attachments")
  @RequireAdminPermission("support.manage")
  register(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RegisterDto) { return this.ops.register(id, { ...dto, mimeType: dto.contentType }, { adminUserId: admin.adminUserId }); }

  @Post("support/:id/attachments/:attachmentId/download")
  @RequireAdminPermission("support.view")
  download(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) { return this.ops.download(id, attachmentId, { admin }); }

  @Get("queues/sla")
  @RequireAdminPermission("support.view", "task.manage", "audit.view")
  sla(@Query() q: SlaQueryDto) { return this.ops.queueSla(q.days ?? 30); }

  @Get("disputes/:id/outcome")
  @RequireAdminPermission("dispute.view")
  outcome(@Param("id", ParseUUIDPipe) id: string) { return this.outcomes.outcome(id); }

  /** Customer-favouring outcome with money back: opens a refund approval (finance workflow), then resolves the dispute. */
  @Post("disputes/:id/refund-outcome")
  @RequireAdminPermission("finance.refund.request")
  refundOutcome(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RefundOutcomeDto, @Req() req: AdminAuthedRequest) { return this.outcomes.resolveWithRefund(admin, id, dto.amount, dto.reason, req.requestId); }
}

/** Requester side: attach files to your own case and fetch the ones shared with you. */
@Controller("support/cases/:id/attachments")
@UseGuards(SessionAuthGuard)
export class UserSupportAttachmentsController {
  constructor(private readonly ops: SupportOpsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) { return this.ops.requesterAttachments(id, user.id); }

  @Post("uploads")
  upload(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UploadDto) { return this.ops.uploadTarget(id, dto.contentType, dto.fileSizeBytes, user.id); }

  @Post()
  register(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RegisterDto) { return this.ops.register(id, { ...dto, mimeType: dto.contentType }, { requesterUserId: user.id }); }

  @Post(":attachmentId/download")
  download(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) { return this.ops.download(id, attachmentId, { requesterUserId: user.id }); }
}
