import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../common/redis/redis.module";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
}
