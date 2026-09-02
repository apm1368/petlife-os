import { Injectable } from "@nestjs/common";
import { MarketplaceChannelAccountStatus, MarketplaceProvider, type Prisma } from "@prisma/client";
import type { MarketplaceChannelAccountDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { MarketplaceChannelAccountNotFoundException } from "../../../common/errors/api-exception";
import type { ResolvedSellerContext } from "../../seller-os/auth/seller-context.types";
import { MarketplaceChannelRegistry } from "./marketplace-channel-registry.service";
import { toChannelAccountDto } from "./marketplace-dto.mapper";

/**
 * Seller-facing marketplace channel connections (spec section 13, 44). No
 * OAuth flow and no credential-paste form exist — "do not build fake OAuth"
 * / "do not ask seller to paste secret credentials into a normal form
 * unless secure storage is implemented" (spec section 44). Connecting a
 * channel this phase is a same-project operational toggle (this project
 * holds no per-seller Torob/Digikala credentials at all — see README
 * "Credential handling"); a later handoff introducing real per-seller
 * credential storage would extend `connect` rather than replace it.
 */
@Injectable()
export class MarketplaceChannelAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly registry: MarketplaceChannelRegistry,
  ) {}

  async list(ctx: ResolvedSellerContext): Promise<MarketplaceChannelAccountDto[]> {
    const accounts = await this.prisma.marketplaceChannelAccount.findMany({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, orderBy: { createdAt: "asc" } });
    return accounts.map((a) => toChannelAccountDto(a, this.registry));
  }

  async getById(ctx: ResolvedSellerContext, channelAccountId: string) {
    const account = await this.prisma.marketplaceChannelAccount.findUnique({ where: { id: channelAccountId } });
    if (!account || account.sellerOrganizationId !== ctx.sellerOrganizationId) throw new MarketplaceChannelAccountNotFoundException({ channelAccountId });
    return account;
  }

  async getByIdDto(ctx: ResolvedSellerContext, channelAccountId: string): Promise<MarketplaceChannelAccountDto> {
    return toChannelAccountDto(await this.getById(ctx, channelAccountId), this.registry);
  }

  async connect(ctx: ResolvedSellerContext, provider: MarketplaceProvider, displayName?: string): Promise<MarketplaceChannelAccountDto> {
    this.registry.resolve(provider); // throws if disabled/unavailable — never "connect" a channel that can't actually be used

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.marketplaceChannelAccount.upsert({
        where: { sellerOrganizationId_provider: { sellerOrganizationId: ctx.sellerOrganizationId, provider } },
        update: { status: MarketplaceChannelAccountStatus.CONNECTED, displayName },
        create: { sellerOrganizationId: ctx.sellerOrganizationId, provider, status: MarketplaceChannelAccountStatus.CONNECTED, displayName },
      });
      await this.events.publish(
        "MarketplaceChannelAccountConnected",
        { marketplaceChannelAccountId: created.id, sellerOrganizationId: ctx.sellerOrganizationId, provider },
        { tx, aggregateType: "MarketplaceChannelAccount", aggregateId: created.id },
      );
      return created;
    });

    return toChannelAccountDto(account, this.registry);
  }

  async updateSyncFlags(
    ctx: ResolvedSellerContext,
    channelAccountId: string,
    flags: { syncEnabled?: boolean; inventorySyncEnabled?: boolean; priceSyncEnabled?: boolean; orderSyncEnabled?: boolean },
  ): Promise<MarketplaceChannelAccountDto> {
    await this.getById(ctx, channelAccountId);
    const account = await this.prisma.marketplaceChannelAccount.update({ where: { id: channelAccountId }, data: flags });
    return toChannelAccountDto(account, this.registry);
  }

  /** Bookkeeping only — called by MarketplaceSyncOrchestrator after every sync attempt (spec section 13's lastSuccessfulSyncAt/lastAttemptedSyncAt/lastError* fields). */
  async recordSyncOutcome(tx: Prisma.TransactionClient, channelAccountId: string, outcome: { success: boolean; errorCode?: string; errorMessage?: string }): Promise<void> {
    await tx.marketplaceChannelAccount.update({
      where: { id: channelAccountId },
      data: {
        lastAttemptedSyncAt: new Date(),
        ...(outcome.success
          ? { lastSuccessfulSyncAt: new Date(), status: MarketplaceChannelAccountStatus.CONNECTED, lastErrorCode: null, lastErrorMessage: null }
          : { status: MarketplaceChannelAccountStatus.DEGRADED, lastErrorCode: outcome.errorCode, lastErrorMessage: outcome.errorMessage }),
      },
    });
  }
}
