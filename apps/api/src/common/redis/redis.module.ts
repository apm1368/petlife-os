import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from "@nestjs/common";
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
        // OPTIONAL_AT_BOOT: ioredis reconnects on its own, so the API boots and serves while Redis is down (OTP,
        // download tokens and rate-limit state fail until it is back; /health/ready reports it). Log each outage
        // once instead of every reconnect attempt.
        const client = new Redis(config.get("REDIS_URL", { infer: true }));
        const logger = new Logger("Redis");
        let down = false;
        client.on("error", (error: Error) => {
          if (down) return;
          down = true;
          logger.warn(`Redis unavailable (${error.message}); reconnecting in the background`);
        });
        client.on("ready", () => {
          if (down) logger.log("Redis reconnected");
          down = false;
        });
        return client;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
