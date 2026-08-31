import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { AppEnv } from "../../config/env";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

/**
 * ioredis instances don't implement Nest's lifecycle hooks themselves, so
 * without this the connection is never closed on app shutdown — harmless in
 * a long-running server, but it leaves Jest's e2e process hanging on an
 * open handle after the test run finishes.
 */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => {
        return new Redis(config.get("REDIS_URL", { infer: true }));
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
