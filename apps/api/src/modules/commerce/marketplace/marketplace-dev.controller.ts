import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MarketplaceProvider } from "@prisma/client";
import type { AppEnv } from "../../../config/env";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "../../seller-os/auth/seller-auth.guard";
import { CurrentSellerContext } from "../../seller-os/auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "../../seller-os/auth/seller-context.types";
import { MarketplaceProviderDisabledException } from "../../../common/errors/api-exception";
import { MarketplaceChannelAccountService } from "./marketplace-channel-account.service";
import { MarketplaceOrderIngestionService } from "./marketplace-order-ingestion.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { DevMarketplaceAdapter } from "./dev-marketplace.adapter";

interface SimulateOrderItemInput {
  externalListingId?: string;
  sellerSku?: string;
  quantity: number;
  unitPriceAmount: number;
}

interface SimulateOrderBody {
  externalOrderId: string;
  items: SimulateOrderItemInput[];
  rawStatus?: string;
}

interface SimulateCancellationBody {
  externalOrderId: string;
}

interface SimulateMismatchBody {
  externalListingId: string;
  priceIrr?: number;
  availableQuantity?: number;
}

interface SimulatePublishRejectionBody {
  listingId: string;
}

/**
 * Dev/test-only marketplace simulation (spec section 21, 54, 68 Flows C/D/F)
 * — hard-disabled outside development/test (NODE_ENV check, not just a soft
 * config flag) so it can never be reached in production regardless of
 * misconfiguration, mirroring ShippingWebhooksController's dev simulate
 * endpoint (Handoff 08) exactly. Every method here still routes through the
 * real DevMarketplaceAdapter.verifyWebhook -> MarketplaceOrderIngestionService
 * pipeline (or MarketplaceListingService.publish for the rejection case),
 * never mutating MarketplaceOrder/InventoryItem state directly.
 */
@Controller("seller-organizations/:sellerId/channels/:channelAccountId/dev/simulate")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class MarketplaceDevController {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly channelAccounts: MarketplaceChannelAccountService,
    private readonly ingestion: MarketplaceOrderIngestionService,
    private readonly listings: MarketplaceListingService,
    private readonly devAdapter: DevMarketplaceAdapter,
  ) {}

  private assertDevSimulationAllowed(): void {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") throw new MarketplaceProviderDisabledException({ reason: "Dev simulation is never available in production" });
    if (!this.config.get("DEV_MARKETPLACE_ENABLED", { infer: true })) throw new MarketplaceProviderDisabledException({ provider: "DEV" });
  }

  private async loadDevAccount(ctx: ResolvedSellerContext, channelAccountId: string) {
    const account = await this.channelAccounts.getById(ctx, channelAccountId);
    if (account.provider !== MarketplaceProvider.DEV) throw new MarketplaceProviderDisabledException({ reason: "Simulation is only available for a DEV channel account" });
    return account;
  }

  @Post("order")
  async simulateOrder(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string, @Body() body: SimulateOrderBody) {
    this.assertDevSimulationAllowed();
    const account = await this.loadDevAccount(ctx, channelAccountId);
    const payload = this.devAdapter.buildSimulatedOrderPayload(body.externalOrderId, body.items, body.rawStatus);
    const result = await this.devAdapter.verifyWebhook({ rawBody: payload, signatureHeader: undefined });
    return this.ingestion.processWebhookResult(account, result);
  }

  @Post("cancellation")
  async simulateCancellation(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string, @Body() body: SimulateCancellationBody) {
    this.assertDevSimulationAllowed();
    const account = await this.loadDevAccount(ctx, channelAccountId);
    const payload = this.devAdapter.buildSimulatedCancellationPayload(body.externalOrderId);
    const result = await this.devAdapter.verifyWebhook({ rawBody: payload, signatureHeader: undefined });
    return this.ingestion.processWebhookResult(account, result);
  }

  @Post("mismatch")
  async simulateMismatch(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string, @Body() body: SimulateMismatchBody) {
    this.assertDevSimulationAllowed();
    await this.loadDevAccount(ctx, channelAccountId);
    this.devAdapter.injectObservedMismatch(body.externalListingId, { priceIrr: body.priceIrr, availableQuantity: body.availableQuantity });
    return { injected: true };
  }

  @Post("publish-rejection")
  async simulatePublishRejection(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("channelAccountId") channelAccountId: string, @Body() body: SimulatePublishRejectionBody) {
    this.assertDevSimulationAllowed();
    await this.loadDevAccount(ctx, channelAccountId);
    return this.listings.publish(ctx, body.listingId, "FAILURE");
  }
}
