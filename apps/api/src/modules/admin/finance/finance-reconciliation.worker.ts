import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { registerWorker, trackWorker } from "../../../common/workers/worker-heartbeat";
import { FinanceReconciliationService } from "./finance-reconciliation.service";

const INTERVAL_MS = 6 * 3600e3;

/** Every 6 h: re-run reconciliation so findings appear (and clear) without anyone pressing a button. Read-only over money. */
@Injectable()
export class FinanceReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceReconciliationWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly reconciliation: FinanceReconciliationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("finance-reconciliation", INTERVAL_MS);
    this.timer = setInterval(() => void trackWorker("finance-reconciliation", INTERVAL_MS, () => this.reconciliation.run()).catch((e) => this.logger.error("Reconciliation tick failed", e)), INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
