import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { AnimalSupportOrgRole } from "@prisma/client";
import { IsEmail, IsEnum, IsString, Length } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AnimalSupportOrganizationNotFoundException, NotFoundApiException } from "../../../common/errors/api-exception";
import { StorageService } from "../../storage/storage.service";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

class GrantDto {
  @IsEmail() email!: string;
  @IsEnum(AnimalSupportOrgRole) role!: AnimalSupportOrgRole;
}
class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}

/** Batch 6 — NGO staff and verification documents, for PET LIFE operators. Every change and every document open is audited. */
@Controller("admin/animal-support/organizations/:organizationId")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminNgoMembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly storage: StorageService,
  ) {}

  private async org(id: string) {
    const org = await this.prisma.animalSupportOrganization.findUnique({ where: { id }, select: { id: true, verificationDocumentKeys: true } });
    if (!org) throw new AnimalSupportOrganizationNotFoundException({ organizationId: id });
    return org;
  }

  @Get("members")
  @RequireAdminPermission("animalSupport.view")
  async members(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    await this.org(organizationId);
    const rows = await this.prisma.animalSupportOrgMembership.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({ id: r.id, userId: r.userId, displayName: byId.get(r.userId)?.displayName ?? null, email: byId.get(r.userId)?.email ?? null, role: r.role, isActive: r.isActive }));
  }

  @Post("members")
  @RequireAdminPermission("animalSupport.manage")
  async grant(@Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: GrantDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    await this.org(organizationId);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, select: { id: true } });
    if (!user) throw new NotFoundApiException("User");
    const row = await this.prisma.animalSupportOrgMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      create: { organizationId, userId: user.id, role: dto.role },
      update: { role: dto.role, isActive: true },
    });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "animal_support_org_membership.granted", entityType: "ANIMAL_SUPPORT_ORG_MEMBERSHIP", entityId: row.id, afterSummary: { organizationId, role: row.role }, requestId: req.requestId });
    return { id: row.id, role: row.role, isActive: row.isActive };
  }

  @Delete("members/:membershipId")
  @HttpCode(200)
  @RequireAdminPermission("animalSupport.manage")
  async revoke(@Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("membershipId", ParseUUIDPipe) membershipId: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const res = await this.prisma.animalSupportOrgMembership.updateMany({ where: { id: membershipId, organizationId }, data: { isActive: false } });
    if (res.count === 0) throw new NotFoundApiException("Membership");
    await this.audit.record({ adminUserId: admin.adminUserId, action: "animal_support_org_membership.revoked", entityType: "ANIMAL_SUPPORT_ORG_MEMBERSHIP", entityId: membershipId, requestId: req.requestId });
    return { id: membershipId, isActive: false };
  }

  /** Short-lived signed links to the private verification documents; the reason is audited. */
  @Post("verification-documents")
  @HttpCode(200)
  @RequireAdminPermission("animalSupport.manage")
  async documents(@Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: ReasonDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const org = await this.org(organizationId);
    const links = await Promise.all(org.verificationDocumentKeys.map((key) => this.storage.createPrivateDownloadTarget(key)));
    await this.audit.record({ adminUserId: admin.adminUserId, action: "animal_support_organization.verification_documents_opened", entityType: "AnimalSupportOrganization", entityId: organizationId, reason: dto.reason, requestId: req.requestId });
    return links.map((l, i) => ({ index: i + 1, downloadUrl: l.downloadUrl, expiresInSeconds: l.expiresInSeconds }));
  }
}
