import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type Redis from "ioredis";
import { of, tap, type Observable } from "rxjs";
import { REDIS_CLIENT } from "../redis/redis.module";
import type { AuthedRequest } from "../auth/current-user.decorator";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Applied to create endpoints that must be retry-safe (pet creation,
 * onboarding completion). Caller sends `Idempotency-Key`; a repeated key for
 * the same user + route replays the first response instead of re-executing
 * the handler, so a network retry can never create a duplicate record.
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

    const cacheKey = `idem:${request.route?.path ?? request.path}:${request.user?.id ?? "anon"}:${idempotencyKey}`;
    const cached = await this.redis.get(cacheKey);
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
