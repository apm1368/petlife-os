import { Injectable } from "@nestjs/common";
import { PartnerSubjectType, type ApprovalMode, type ApprovalScope } from "@prisma/client";
import type { PartnerApprovalModesDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { ApprovalPolicyService } from "../../approvals/approval-policy.service";
import { APPROVAL_SCOPES_BY_PARTNER } from "../../approvals/approval-policy";

/**
 * Per-partner approval overrides (approval modes). One row per (partner, scope); no row = inherit the vertical
 * setting. Every change and removal carries a reason and an audit-log entry, written in the same transaction.
 */
@Injectable()
export class AdminPartnerApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ApprovalPolicyService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async assertPartner(partnerType: PartnerSubjectType, organizationId: string): Promise<void> {
    const exists =
      partnerType === PartnerSubjectType.PROVIDER
        ? await this.prisma.providerOrganization.findUnique({ where: { id: organizationId }, select: { id: true } })
        : await this.prisma.sellerOrganization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!exists) throw new NotFoundApiException(partnerType === PartnerSubjectType.PROVIDER ? "Provider organization" : "Seller organization");
  }

  private assertScope(partnerType: PartnerSubjectType, scope: ApprovalScope): void {
    if (!APPROVAL_SCOPES_BY_PARTNER[partnerType].includes(scope)) throw new ValidationApiException({ field: "scope", reason: "SCOPE_NOT_FOR_PARTNER", partnerType, scope });
  }

  async get(partnerType: PartnerSubjectType, organizationId: string): Promise<PartnerApprovalModesDto> {
    await this.assertPartner(partnerType, organizationId);
    const rows = await this.prisma.partnerApprovalOverride.findMany({ where: { partnerType, organizationId } });
    const adminIds = [...new Set(rows.map((r) => r.updatedByAdminId).filter((id): id is string => !!id))];
    const admins = adminIds.length ? await this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, user: { select: { displayName: true } } } }) : [];
    const nameOf = new Map(admins.map((a) => [a.id, a.user.displayName ?? null]));
    return {
      partnerType,
      organizationId,
      items: APPROVAL_SCOPES_BY_PARTNER[partnerType].map((scope) => {
        const row = rows.find((r) => r.scope === scope);
        const vertical = this.policy.vertical(scope);
        return {
          scope,
          vertical,
          override: row ? { mode: row.mode, reason: row.reason, updatedAt: row.updatedAt.toISOString(), updatedByName: row.updatedByAdminId ? (nameOf.get(row.updatedByAdminId) ?? null) : null } : null,
          effective: row?.mode ?? vertical,
        };
      }),
    };
  }

  async set(admin: ResolvedAdminContext, partnerType: PartnerSubjectType, organizationId: string, scope: ApprovalScope, mode: ApprovalMode, reason: string, requestId?: string): Promise<PartnerApprovalModesDto> {
    this.assertScope(partnerType, scope);
    await this.assertPartner(partnerType, organizationId);
    await this.prisma.$transaction(async (tx) => {
      const key = { partnerType_organizationId_scope: { partnerType, organizationId, scope } };
      const before = await tx.partnerApprovalOverride.findUnique({ where: key });
      await tx.partnerApprovalOverride.upsert({
        where: key,
        create: { partnerType, organizationId, scope, mode, reason: reason.trim(), updatedByAdminId: admin.adminUserId },
        update: { mode, reason: reason.trim(), updatedByAdminId: admin.adminUserId },
      });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "partner_approval_override.set", entityType: partnerType === PartnerSubjectType.PROVIDER ? "ProviderOrganization" : "SellerOrganization", entityId: organizationId, reason: reason.trim(), beforeSummary: { scope, mode: before?.mode ?? "INHERIT" }, afterSummary: { scope, mode }, requestId, tx });
    });
    return this.get(partnerType, organizationId);
  }

  async remove(admin: ResolvedAdminContext, partnerType: PartnerSubjectType, organizationId: string, scope: ApprovalScope, reason: string, requestId?: string): Promise<PartnerApprovalModesDto> {
    this.assertScope(partnerType, scope);
    await this.assertPartner(partnerType, organizationId);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.partnerApprovalOverride.findUnique({ where: { partnerType_organizationId_scope: { partnerType, organizationId, scope } } });
      if (!before) return; // already inheriting: nothing changed, nothing to audit
      await tx.partnerApprovalOverride.delete({ where: { id: before.id } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "partner_approval_override.removed", entityType: partnerType === PartnerSubjectType.PROVIDER ? "ProviderOrganization" : "SellerOrganization", entityId: organizationId, reason: reason.trim(), beforeSummary: { scope, mode: before.mode }, afterSummary: { scope, mode: "INHERIT" }, requestId, tx });
    });
    return this.get(partnerType, organizationId);
  }
}
