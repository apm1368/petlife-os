import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { InsuranceApplicationStatus, InsurerRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEmail, IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

class ApplicationsQueryDto {
  @IsOptional() @IsEnum(InsuranceApplicationStatus) status?: InsuranceApplicationStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}

class GrantMembershipDto {
  @IsEmail() email!: string;
  @IsOptional() @IsEnum(InsurerRole) role?: InsurerRole;
}

/**
 * Admin view of insurance applications (read-only: PET LIFE never decides an
 * application) and insurer team memberships (who may use the insurer portal).
 */
@Controller("admin/insurance")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminInsuranceApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  @Get("applications")
  @RequireAdminPermission("insurance.applications.view")
  async applications(@Query() query: ApplicationsQueryDto) {
    const page = query.page ?? 1;
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.insuranceApplication.findMany({
        where,
        include: { product: { select: { name: true, provider: { select: { name: true } } } }, pet: { select: { species: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * 25,
        take: 25,
      }),
      this.prisma.insuranceApplication.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        productName: r.product.name,
        providerName: r.product.provider.name,
        petSpecies: r.pet.species,
        status: r.status,
        eligibilityStatus: r.eligibilityStatus,
        consentAt: r.consentAt?.toISOString() ?? null,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize: 25,
    };
  }

  @Get("providers/:providerId/members")
  @RequireAdminPermission("insurance.view")
  async members(@Param("providerId", ParseUUIDPipe) providerId: string) {
    const rows = await this.prisma.insurerMembership.findMany({ where: { providerId }, orderBy: { createdAt: "asc" } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({ id: r.id, userId: r.userId, displayName: byId.get(r.userId)?.displayName ?? null, email: byId.get(r.userId)?.email ?? null, role: r.role, isActive: r.isActive }));
  }

  @Post("providers/:providerId/members")
  @RequireAdminPermission("insurance.manage")
  async grant(@Param("providerId", ParseUUIDPipe) providerId: string, @Body() dto: GrantMembershipDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const provider = await this.prisma.insuranceProvider.findUnique({ where: { id: providerId }, select: { id: true } });
    if (!provider) throw new NotFoundApiException("Insurance provider");
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() }, select: { id: true } });
    if (!user) throw new NotFoundApiException("User");
    const row = await this.prisma.insurerMembership.upsert({
      where: { providerId_userId: { providerId, userId: user.id } },
      create: { providerId, userId: user.id, role: dto.role ?? InsurerRole.UNDERWRITING },
      update: { role: dto.role ?? InsurerRole.UNDERWRITING, isActive: true },
    });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "insurer_membership.granted", entityType: "INSURER_MEMBERSHIP", entityId: row.id, afterSummary: { providerId, role: row.role }, requestId: req.requestId });
    return { id: row.id, role: row.role, isActive: row.isActive };
  }

  @Delete("providers/:providerId/members/:membershipId")
  @HttpCode(200)
  @RequireAdminPermission("insurance.manage")
  async revoke(@Param("providerId", ParseUUIDPipe) providerId: string, @Param("membershipId", ParseUUIDPipe) membershipId: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const res = await this.prisma.insurerMembership.updateMany({ where: { id: membershipId, providerId }, data: { isActive: false } });
    if (res.count === 0) throw new NotFoundApiException("Membership");
    await this.audit.record({ adminUserId: admin.adminUserId, action: "insurer_membership.revoked", entityType: "INSURER_MEMBERSHIP", entityId: membershipId, requestId: req.requestId });
    return { id: membershipId, isActive: false };
  }
}
