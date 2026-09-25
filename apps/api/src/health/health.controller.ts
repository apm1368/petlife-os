import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
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

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException({ status: "not-ready" });
    }
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
