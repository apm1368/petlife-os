import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { PartnerDocumentKind, PartnerSubjectType, ProviderUserRole, ProviderVerificationStatus, SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { AdminGovernanceRuleException } from "../../common/errors/api-exception";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { SellerAuthGuard } from "../seller-os/auth/seller-auth.guard";
import { RequireSellerRole } from "../seller-os/auth/require-seller-role.decorator";
import { CurrentSellerContext } from "../seller-os/auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "../seller-os/auth/seller-context.types";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { PartnerVerificationService } from "./partner-verification.service";
import { TransitionProviderVerificationDto, TransitionSellerVerificationDto } from "../admin/verification/dto/verification.dto";

const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
class UploadDto {
  @IsIn(MIME) contentType!: string;
  @IsInt() @Min(1) @Max(20 * 1024 * 1024) fileSizeBytes!: number;
}
class RegisterDocumentDto extends UploadDto {
  @IsString() @Length(10, 300) objectKey!: string;
  @IsIn(Object.values(PartnerDocumentKind)) kind!: PartnerDocumentKind;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
class QueueQueryDto {
  @IsOptional() @IsIn(Object.values(PartnerSubjectType)) subjectType?: PartnerSubjectType;
  @IsOptional() @IsIn(Object.values(ProviderVerificationStatus)) status?: ProviderVerificationStatus;
}
class TransitionDto {
  @IsIn(Object.values(ProviderVerificationStatus)) to!: ProviderVerificationStatus;
  @IsOptional() @IsString() @Length(3, 1000) reason?: string;
}
class ReviewDocumentDto {
  @IsIn(["ACCEPTED", "REJECTED"]) decision!: "ACCEPTED" | "REJECTED";
  @IsOptional() @IsString() @Length(3, 1000) note?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}
class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}

/** Provider portal: only the organisation OWNER uploads and submits; any member may read the status. */
@Controller("provider/verification")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderVerificationController {
  constructor(private readonly verification: PartnerVerificationService) {}
  private subject(ctx: ResolvedProviderContext) { return { type: PartnerSubjectType.PROVIDER, id: ctx.organizationId }; }
  private owner(ctx: ResolvedProviderContext) { if (ctx.role !== ProviderUserRole.OWNER) throw new AdminGovernanceRuleException({ rule: "OWNER_ONLY" }); }

  @Get()
  status(@CurrentProviderContext() ctx: ResolvedProviderContext) { return this.verification.status(this.subject(ctx)); }

  @Post("uploads")
  upload(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: UploadDto) { this.owner(ctx); return this.verification.requestUpload(this.subject(ctx), dto.contentType, dto.fileSizeBytes); }

  @Post("documents")
  register(@CurrentProviderContext() ctx: ResolvedProviderContext, @CurrentUser() user: SessionUser, @Body() dto: RegisterDocumentDto) { this.owner(ctx); return this.verification.registerDocument(this.subject(ctx), user.id, { ...dto, mimeType: dto.contentType }); }

  @Post("submit")
  submit(@CurrentProviderContext() ctx: ResolvedProviderContext, @CurrentUser() user: SessionUser) { this.owner(ctx); return this.verification.submit(this.subject(ctx), user.id); }
}

/** Seller portal: OWNER/ADMIN memberships manage verification. */
@Controller("seller-organizations/:sellerId/verification")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerVerificationController {
  constructor(private readonly verification: PartnerVerificationService) {}
  private subject(ctx: ResolvedSellerContext) { return { type: PartnerSubjectType.SELLER, id: ctx.sellerOrganizationId }; }

  @Get()
  status(@CurrentSellerContext() ctx: ResolvedSellerContext) { return this.verification.status(this.subject(ctx)); }

  @Post("uploads")
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  upload(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: UploadDto) { return this.verification.requestUpload(this.subject(ctx), dto.contentType, dto.fileSizeBytes); }

  @Post("documents")
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  register(@CurrentSellerContext() ctx: ResolvedSellerContext, @CurrentUser() user: SessionUser, @Body() dto: RegisterDocumentDto) { return this.verification.registerDocument(this.subject(ctx), user.id, { ...dto, mimeType: dto.contentType }); }

  @Post("submit")
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  submit(@CurrentSellerContext() ctx: ResolvedSellerContext, @CurrentUser() user: SessionUser) { return this.verification.submit(this.subject(ctx), user.id); }
}

/** Staff side: verification.manage (ADMIN, SUPER_ADMIN, VERIFICATION, PARTNER_OPERATIONS, CLINIC_OPERATIONS). */
@Controller("admin")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPartnerVerificationController {
  constructor(private readonly verification: PartnerVerificationService) {}

  @Get("verification/queue")
  @RequireAdminPermission("verification.manage")
  queue(@Query() q: QueueQueryDto) { return this.verification.queue(q); }

  @Get("verification/:subjectType/:id")
  @RequireAdminPermission("verification.manage")
  detail(@Param("subjectType") subjectType: string, @Param("id", ParseUUIDPipe) id: string) { return this.verification.adminDetail({ type: parseSubject(subjectType), id }); }

  @Post("verification/:subjectType/:id/transition")
  @RequireAdminPermission("verification.manage")
  transition(@CurrentAdmin() admin: ResolvedAdminContext, @Param("subjectType") subjectType: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TransitionDto, @Req() req: AdminAuthedRequest) {
    return this.verification.transition(admin, { type: parseSubject(subjectType), id }, dto.to, dto.reason, req.requestId);
  }

  @Post("verification/documents/:documentId/review")
  @RequireAdminPermission("verification.manage")
  review(@CurrentAdmin() admin: ResolvedAdminContext, @Param("documentId", ParseUUIDPipe) documentId: string, @Body() dto: ReviewDocumentDto) { return this.verification.reviewDocument(admin, documentId, dto); }

  @Post("verification/documents/:documentId/download")
  @RequireAdminPermission("verification.manage")
  download(@CurrentAdmin() admin: ResolvedAdminContext, @Param("documentId", ParseUUIDPipe) documentId: string, @Body() dto: ReasonDto) { return this.verification.documentDownload(admin, documentId, dto.reason); }

  /** Pre-existing contract (web admin uses it): now goes through the same transition table and evidence rule. */
  @Patch("providers/:id/verification")
  @RequireAdminPermission("verification.manage")
  patchProvider(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TransitionProviderVerificationDto, @Req() req: AdminAuthedRequest) {
    return this.verification.transition(admin, { type: PartnerSubjectType.PROVIDER, id }, dto.status, dto.reason, req.requestId);
  }

  @Patch("sellers/:id/verification")
  @RequireAdminPermission("verification.manage")
  patchSeller(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: TransitionSellerVerificationDto, @Req() req: AdminAuthedRequest) {
    return this.verification.transition(admin, { type: PartnerSubjectType.SELLER, id }, dto.status as unknown as ProviderVerificationStatus, dto.reason, req.requestId);
  }
}

function parseSubject(raw: string): PartnerSubjectType {
  const v = raw.toUpperCase();
  if (v === "PROVIDER" || v === "PROVIDERS") return PartnerSubjectType.PROVIDER;
  if (v === "SELLER" || v === "SELLERS") return PartnerSubjectType.SELLER;
  throw new AdminGovernanceRuleException({ rule: "UNKNOWN_SUBJECT_TYPE" });
}
