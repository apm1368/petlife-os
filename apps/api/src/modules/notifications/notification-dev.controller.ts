import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import type { AppEnv } from "../../config/env";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { MessagingProviderDisabledException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "./notification-orchestrator.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { NotificationDeliveryWorkerService } from "./notification-delivery-worker.service";

interface SimulateNotifyBody {
  userId: string;
  type: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  templateParams?: Record<string, string | number>;
  smsSimMode?: "SUCCESS" | "FAILURE_TRANSIENT" | "FAILURE_PERMANENT" | "PENDING";
  sellerOrganizationId?: string;
  domainEventId?: string;
}

/**
 * Dev/test-only (spec Flow C/E/F/G) — hard-disabled outside development/test
 * via a NODE_ENV check, mirroring MarketplaceDevController/
 * ShippingWebhooksController's own dev-simulate gates exactly. Every route
 * still drives the real NotificationOrchestrator/NotificationDeliveryService
 * pipeline — never a shortcut that mutates a Notification/NotificationDelivery
 * row directly.
 */
@Controller("dev/notifications")
@UseGuards(SessionAuthGuard)
export class NotificationDevController {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly delivery: NotificationDeliveryService,
    private readonly worker: NotificationDeliveryWorkerService,
  ) {}

  private assertDevAllowed(): void {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") throw new MessagingProviderDisabledException({ reason: "Dev simulation is never available in production" });
    if (!this.config.get("DEV_MESSAGING_ENABLED", { infer: true })) throw new MessagingProviderDisabledException({ provider: "DEV" });
  }

  @Post("simulate")
  async simulate(@Body() body: SimulateNotifyBody) {
    this.assertDevAllowed();
    return this.orchestrator.notify({
      userId: body.userId,
      type: body.type,
      category: body.category,
      priority: body.priority,
      templateParams: body.templateParams,
      smsSimMode: body.smsSimMode,
      sellerOrganizationId: body.sellerOrganizationId,
      domainEventId: body.domainEventId,
    });
  }

  /** Fast-forwards a specific QUEUED/PENDING delivery (bypassing its scheduledAt backoff/quiet-hours wait) — the deterministic alternative to sleeping in a test. */
  @Post("deliveries/:deliveryId/force-attempt")
  async forceAttempt(@Param("deliveryId") deliveryId: string) {
    this.assertDevAllowed();
    const attempted = await this.delivery.attempt(deliveryId);
    return { attempted };
  }

  /** Runs one worker tick immediately — for asserting real due-row processing without waiting for the interval. */
  @Post("deliveries/process-due")
  async processDue() {
    this.assertDevAllowed();
    const processedCount = await this.worker.processDueDeliveries();
    return { processedCount };
  }
}
