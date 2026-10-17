import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type Redis from "ioredis";
import { of, tap, type Observable } from "rxjs";
import { REDIS_CLIENT } from "../redis/redis.module";
import type { AuthedRequest } from "../auth/current-user.decorator";

export const IDEMPOTENCY_RESOURCE_PARAM = "idempotency:resource-param";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Applied to create endpoints that must be retry-safe (pet creation,
 * onboarding completion). Caller sends `Idempotency-Key`; a repeated key for
 * the same user + route replays the first response instead of re-executing
 * the handler once its successful result has reached Redis. Concurrent cache misses
 * and loss of the cache write are not a durable exactly-once guarantee.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & AuthedRequest>();
    const idempotencyKey = request.headers["idempotency-key"];

    if (!idempotencyKey || Array.isArray(idempotencyKey)) {
      return next.handle();
    }

    const resourceParam: string | undefined = Reflect.getMetadata(IDEMPOTENCY_RESOURCE_PARAM, context.getHandler());
    const legacyKey = `idem:${request.route?.path ?? request.path}:${request.user?.id ?? "anon"}:${idempotencyKey}`;
    // Opt in per endpoint; leave financial and other existing cache namespaces unchanged.
    const cacheKey = resourceParam
      ? `idem:${request.path}:${request.user?.id ?? "anon"}:${idempotencyKey}`
      : legacyKey;
    let cached = await this.redis.get(cacheKey);
    if (!cached && resourceParam && cacheKey !== legacyKey) {
      const legacy = await this.redis.get(legacyKey);
      // Preserve pre-upgrade retries only when the response proves the same resource scope.
      if (legacy && JSON.parse(legacy)?.[resourceParam] === request.params[resourceParam]) cached = legacy;
    }
    if (cached) {
      return of(JSON.parse(cached));
    }

    return next.handle().pipe(
      tap((body) => {
        void this.redis.set(cacheKey, JSON.stringify(body), "EX", IDEMPOTENCY_TTL_SECONDS);
      }),
    );
  }
}
