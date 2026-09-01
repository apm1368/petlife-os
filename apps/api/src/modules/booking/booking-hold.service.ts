import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import { HoldExpiredException, SlotUnavailableException } from "../../common/errors/api-exception";
import type { AppEnv } from "../../config/env";

export interface BookingHoldRecord {
  holdId: string;
  petId: string;
  householdId: string;
  userId: string;
  providerOrganizationId: string;
  providerLocationId: string;
  providerUserId: string | null;
  providerServiceId: string;
  slotStart: string;
  slotEnd: string;
  timezone: string;
  createdAt: string;
  expiresAt: string;
}

export type CreateHoldInput = Omit<BookingHoldRecord, "holdId" | "createdAt" | "expiresAt">;

/**
 * Slot holds are Redis-only and never authoritative for booking history —
 * PostgreSQL's unique constraints on `bookings` are the real defense against
 * a double-confirm race (see the migration's raw SQL). A hold is just the
 * "reserve this while you fill out the form" UX layer: it (a) blocks a second
 * user from holding the identical slot for BOOKING_HOLD_TTL_SECONDS, via a
 * short-lived NX lock keyed on the slot itself, and (b) remembers what the
 * holder was booking so POST /bookings doesn't have to re-collect it.
 */
@Injectable()
export class BookingHoldService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private holdKey(holdId: string): string {
    return `booking-hold:${holdId}`;
  }

  private slotLockKey(providerLocationId: string, providerUserId: string | null, slotStart: string): string {
    return `booking-slot-lock:${providerLocationId}:${providerUserId ?? "any"}:${slotStart}`;
  }

  async createHold(input: CreateHoldInput): Promise<BookingHoldRecord> {
    const ttlSeconds = this.config.get("BOOKING_HOLD_TTL_SECONDS", { infer: true });
    const lockKey = this.slotLockKey(input.providerLocationId, input.providerUserId, input.slotStart);
    const holdId = randomUUID();

    // NX: only one hold can exist for this exact slot at a time.
    const acquired = await this.redis.set(lockKey, holdId, "EX", ttlSeconds, "NX");
    if (acquired !== "OK") {
      throw new SlotUnavailableException({ slotStart: input.slotStart });
    }

    const now = Date.now();
    const record: BookingHoldRecord = {
      ...input,
      holdId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    };
    await this.redis.set(this.holdKey(holdId), JSON.stringify(record), "EX", ttlSeconds);
    return record;
  }

  async getHold(holdId: string): Promise<BookingHoldRecord | null> {
    const raw = await this.redis.get(this.holdKey(holdId));
    return raw ? (JSON.parse(raw) as BookingHoldRecord) : null;
  }

  /** Fetches and atomically removes a hold — the same hold can never be consumed twice. */
  async consumeHold(holdId: string): Promise<BookingHoldRecord> {
    const record = await this.getHold(holdId);
    if (!record) throw new HoldExpiredException({ holdId });

    await this.redis.del(this.holdKey(holdId));
    await this.redis.del(this.slotLockKey(record.providerLocationId, record.providerUserId, record.slotStart));
    return record;
  }

  async releaseHold(holdId: string): Promise<void> {
    const record = await this.getHold(holdId);
    if (!record) return;
    await this.redis.del(this.holdKey(holdId));
    await this.redis.del(this.slotLockKey(record.providerLocationId, record.providerUserId, record.slotStart));
  }
}
