import { HttpStatus, Inject, Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type Redis from "ioredis";
import { defer, lastValueFrom, of, tap, type Observable } from "rxjs";
import { randomUUID } from "node:crypto";
import { ApiException } from "../errors/api-exception";
import { REDIS_CLIENT } from "../redis/redis.module";
import type { AuthedRequest } from "../auth/current-user.decorator";

export const IDEMPOTENCY_RESOURCE_PARAM = "idempotency:resource-param";

const PET_CREATE_LEASE_MS = 30_000;
const PET_CREATE_REPLAY_WAIT_MS = 10_000;

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Applied to create endpoints that must be retry-safe (pet creation,
 * onboarding completion). Caller sends `Idempotency-Key`; a repeated key for
 * the same user + route replays the first response instead of re-executing
 * the handler once its successful result has reached Redis. The scoped pet endpoint coalesces concurrent misses with a bounded Redis lease.
 * Lease expiry and loss of the cache write are not a durable exactly-once guarantee.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

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

    if (resourceParam) return this.coalescePetCreate(cacheKey, next);

    return next.handle().pipe(
      tap((body) => {
        void this.redis.set(cacheKey, JSON.stringify(body), "EX", IDEMPOTENCY_TTL_SECONDS);
      }),
    );
  }

  /** Only the explicitly scoped pet endpoint opts in; other create/financial contracts stay unchanged. */
  private async coalescePetCreate(cacheKey: string, next: CallHandler): Promise<Observable<unknown>> {
    const lockKey = `pet-create-lease:${cacheKey}`;
    const owner = randomUUID();
    const acquired = await this.redis.set(lockKey, owner, "PX", PET_CREATE_LEASE_MS, "NX");
    if (acquired) {
      // Another request may have completed between our first GET and SET NX.
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        await this.releasePetLease(lockKey, owner);
        return of(JSON.parse(cached));
      }
      return defer(async () => {
        try {
          const body = await lastValueFrom(next.handle());
          try {
            await this.redis.set(cacheKey, JSON.stringify(body), "EX", IDEMPOTENCY_TTL_SECONDS);
          } catch {
            throw new ApiException("IDEMPOTENCY_RESULT_UNCERTAIN", "The pet may have been created. Reload onboarding progress before retrying.", HttpStatus.SERVICE_UNAVAILABLE);
          }
          return body;
        } finally {
          await this.releasePetLease(lockKey, owner);
        }
      });
    }
    // A concurrent cache miss must not open another DB transaction behind the same household lock.
    const deadline = Date.now() + PET_CREATE_REPLAY_WAIT_MS;
    while (Date.now() < deadline) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return of(JSON.parse(cached));
      if (!(await this.redis.exists(lockKey))) {
        // Close the GET-miss / owner-cache-write / owner-unlock race.
        const completed = await this.redis.get(cacheKey);
        if (completed) return of(JSON.parse(completed));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // Do not automatically re-execute an operation whose outcome is not known.
    throw new ApiException("IDEMPOTENCY_IN_PROGRESS", "Pet creation is still in progress or its result is uncertain. Reload onboarding progress before retrying.", HttpStatus.CONFLICT);
  }

  private async releasePetLease(lockKey: string, owner: string): Promise<void> {
    try {
      await this.redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, owner);
    } catch {
      this.logger.warn("Could not release the pet-create lease; it will expire automatically.");
    }
  }

}
