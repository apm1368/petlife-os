import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderOrigin, type CommissionRule } from "@prisma/client";
import type { CommissionRuleDto } from "@petlife/types";
import type { AppEnv } from "../../config/env";
import { PrismaService } from "../../common/prisma/prisma.service";

export function toCommissionRuleDto(row: CommissionRule): CommissionRuleDto {
  return {
    id: row.id,
    sellerOrganizationId: row.sellerOrganizationId,
    channel: row.channel as never,
    basisPoints: row.basisPoints,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Resolves the effective commission for one (seller, channel) pair at a
 * point in time (spec: "commission may vary by seller, channel... MVP can
 * start with default platform commission, seller override"). Category-level
 * matching is a documented non-goal this phase (see README "Commission
 * model") — `channel` is the only override axis besides seller.
 *
 * Resolution always prefers the most specific currently-effective row:
 * (seller + channel) > (seller only) > (channel only) > the platform
 * default (both null), which `onModuleInit` guarantees always exists so
 * `resolve()` can never come back empty.
 */
@Injectable()
export class CommissionRuleService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existingDefault = await this.prisma.commissionRule.findFirst({ where: { sellerOrganizationId: null, channel: null } });
    if (existingDefault) return;
    await this.prisma.commissionRule.create({
      data: { sellerOrganizationId: null, channel: null, basisPoints: this.config.get("DEFAULT_PLATFORM_COMMISSION_BPS", { infer: true }) },
    });
  }

  async resolve(sellerOrganizationId: string, channel: OrderOrigin, at: Date = new Date()): Promise<{ rule: CommissionRule; basisPoints: number }> {
    const candidates = await this.prisma.commissionRule.findMany({
      where: {
        AND: [
          {
            OR: [
              { sellerOrganizationId, channel },
              { sellerOrganizationId, channel: null },
              { sellerOrganizationId: null, channel },
              { sellerOrganizationId: null, channel: null },
            ],
          },
          { effectiveFrom: { lte: at } },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
        ],
      },
    });

    // Most specific wins: seller-match (2) + channel-match (1); ties broken
    // by the most recently created rule (spec: "later commission changes
    // must not retroactively alter old order economics" is satisfied by
    // effectiveFrom/effectiveTo, not by this tie-break, which only matters
    // among rules simultaneously effective at the same specificity).
    const best = candidates
      .map((rule) => ({ rule, score: (rule.sellerOrganizationId ? 2 : 0) + (rule.channel ? 1 : 0) }))
      .sort((a, b) => b.score - a.score || b.rule.effectiveFrom.getTime() - a.rule.effectiveFrom.getTime())[0];

    // Unreachable once onModuleInit's platform-default row exists — kept as
    // an explicit failure (never a silent 0%) rather than assumed away.
    if (!best) throw new Error(`CommissionRuleService.resolve: no effective commission rule for seller ${sellerOrganizationId} / channel ${channel}`);
    return { rule: best.rule, basisPoints: best.rule.basisPoints };
  }

  async list(sellerOrganizationId?: string): Promise<CommissionRuleDto[]> {
    const rows = await this.prisma.commissionRule.findMany({ where: sellerOrganizationId ? { sellerOrganizationId } : undefined, orderBy: { effectiveFrom: "desc" } });
    return rows.map(toCommissionRuleDto);
  }

  async create(adminUserId: string, input: { sellerOrganizationId?: string; channel?: OrderOrigin; basisPoints: number; effectiveFrom?: Date; effectiveTo?: Date }): Promise<CommissionRuleDto> {
    const row = await this.prisma.commissionRule.create({
      data: {
        sellerOrganizationId: input.sellerOrganizationId ?? null,
        channel: input.channel ?? null,
        basisPoints: input.basisPoints,
        effectiveFrom: input.effectiveFrom ?? new Date(),
        effectiveTo: input.effectiveTo ?? null,
        createdByAdminId: adminUserId,
      },
    });
    return toCommissionRuleDto(row);
  }
}
