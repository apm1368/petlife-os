import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AppEnv } from "../../config/env";
import { SETTING_DEFINITIONS, settingDefinition } from "./setting-definitions";

const REFRESH_MS = 30_000;

/**
 * Read side of the settings registry. Values are cached in memory (the API is a single PM2 fork process) and
 * refreshed every 30 s and immediately after any change made through this process, so hot paths — including ones
 * inside a DB transaction, like the refund threshold — read synchronously.
 */
@Injectable()
export class PlatformSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private overrides = new Map<string, { value: unknown; version: number; updatedAt: Date; updatedByAdminId: string | null }>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async onModuleInit() {
    await this.refresh().catch((e) => this.logger.error("Initial settings load failed; using defaults", e instanceof Error ? e.stack : undefined));
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.refresh().catch(() => undefined), REFRESH_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh() {
    const rows = await this.prisma.platformSetting.findMany();
    this.overrides = new Map(rows.filter((r) => settingDefinition(r.key)).map((r) => [r.key, { value: r.value, version: r.version, updatedAt: r.updatedAt, updatedByAdminId: r.updatedByAdminId }]));
  }

  private fallback(key: string): unknown {
    const def = settingDefinition(key);
    if (!def) throw new Error(`Unknown setting ${key}`);
    return def.fallback((k) => this.config.get(k, { infer: true }));
  }

  get<T = unknown>(key: string): T {
    const override = this.overrides.get(key);
    return (override ? override.value : this.fallback(key)) as T;
  }

  getInt(key: string): number {
    return Number(this.get<number>(key));
  }

  /** Every registered setting with its effective value and where it comes from. */
  describeAll() {
    return SETTING_DEFINITIONS.map((def) => {
      const override = this.overrides.get(def.key);
      return {
        key: def.key,
        category: def.category,
        type: def.type,
        scope: def.scope,
        highImpact: def.highImpact,
        constraints: { min: def.min ?? null, max: def.max ?? null, maxLength: def.maxLength ?? null },
        description: def.description,
        value: override ? override.value : this.fallback(def.key),
        defaultValue: this.fallback(def.key),
        source: override ? ("OVERRIDE" as const) : ("DEFAULT" as const),
        version: override?.version ?? 0,
        updatedAt: override?.updatedAt.toISOString() ?? null,
        updatedByAdminId: override?.updatedByAdminId ?? null,
      };
    });
  }

  publicSettings() {
    return Object.fromEntries(SETTING_DEFINITIONS.filter((d) => d.scope === "PUBLIC").map((d) => [d.key, this.get(d.key)]));
  }
}
