import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { registerWorker, trackWorker } from "../../../common/workers/worker-heartbeat";
import { CatalogImportService } from "./catalog-import.service";

const INTERVAL_MS = 15_000;

/** Claims one persisted import at a time; the database state survives process restarts. */
@Injectable()
export class CatalogImportWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogImportWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly imports: CatalogImportService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("catalog-import", INTERVAL_MS);
    this.timer = setInterval(() => void trackWorker("catalog-import", INTERVAL_MS, () => this.imports.processNext()).catch((error) => this.logger.error("Catalog import worker failed", error)), INTERVAL_MS);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
