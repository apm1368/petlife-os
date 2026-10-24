import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import type Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../common/redis/redis.module";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** LIVE: the process is up and its HTTP listener answers (boot exits instead of running without one). */
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /**
   * READY: the dependencies requests need are usable. PostgreSQL is required; Redis backs OTP, download tokens and
   * rate limits, so it is checked too. Each check is time-bounded (a down Redis queues commands instead of failing).
   * Only up/down per dependency is exposed — never hosts or error text.
   */
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`),
      withTimeout(this.redis.ping()),
    ]);
    const checks = { database: database ? "up" : "down", redis: redis ? "up" : "down" };
    if (!database || !redis) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: "not-ready", checks };
    }
    return { status: "ok", checks };
  }

  @Get("version")
  version() {
    return {
      version: this.config.get("APP_VERSION", { infer: true }),
      sha: this.config.get("BUILD_SHA", { infer: true }),
      buildTime: this.config.get("BUILD_TIME", { infer: true }),
      environment: this.config.get("DEPLOYMENT_ENVIRONMENT", { infer: true }),
      deploymentId: this.config.get("DEPLOYMENT_ID", { infer: true }),
    };
  }
}

async function withTimeout(work: Promise<unknown>, ms = 2000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([work.then(() => true, () => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
