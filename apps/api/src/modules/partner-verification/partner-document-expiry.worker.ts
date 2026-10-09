import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { PartnerVerificationService } from "./partner-verification.service";

const INTERVAL_MS = 3600e3;

/** Hourly: expires accepted partner documents past their expiry and raises 30-day expiry alerts (tasks + partner notice). Never suspends anyone. */
@Injectable()
export class PartnerDocumentExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartnerDocumentExpiryWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly verification: PartnerVerificationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("partner-document-expiry", INTERVAL_MS);
    this.timer = setInterval(() => void trackWorker("partner-document-expiry", INTERVAL_MS, () => this.verification.sweepExpiry()).catch((e) => this.logger.error("Partner document expiry tick failed", e)), INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
