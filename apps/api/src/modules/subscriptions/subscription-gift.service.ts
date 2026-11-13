import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MembershipGiftOfferDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { IdentifierRateLimiter } from "../../common/rate-limit/identifier-rate-limiter.service";
import { SubscriptionGiftCodeNotApplicableException, SubscriptionGiftRateLimitedException } from "../../common/errors/api-exception";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { householdHasPaid, userHasPaid } from "./membership-history.util";

type QueryClient = PrismaService | Prisma.TransactionClient;

export interface ActiveGift {
  /** As the admin wrote it; matching ignores case. */
  code: string;
  percentOff: number;
  expiresOn: string | null;
}

/** A few tries a minute per account (on top of the per-IP throttler): enough for typos, useless for guessing. */
export const GIFT_ATTEMPTS = { bucket: "membership-gift-code", limit: 5, windowSeconds: 60 } as const;

/** The expiry setting names the last valid day in Tehran (UTC+03:30 all year since 2022). */
export function giftExpiryInstant(expiresOn: string): number {
  return Date.parse(`${expiresOn}T23:59:59.999+03:30`);
}

/**
 * The first-purchase gift (owner request 2026-11-13): a percentage off a member's first paid membership purchase,
 * configured only in the settings registry (decision T-04) and off by default. Single use per account and per
 * household (SubscriptionGiftRedemption's unique keys), only for the first paid purchase, never stacked with any other
 * discount and never paid out as cash or wallet credit: it only ever lowers the amount charged.
 */
@Injectable()
export class SubscriptionGiftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly limiter: IdentifierRateLimiter,
  ) {}

  /** The gift as configured right now; null when it is off, has no code, or has expired. */
  active(now = new Date()): ActiveGift | null {
    if (this.settings.get<boolean>("membership.firstPurchaseGift.enabled") !== true) return null;
    const code = this.settings.get<string | null>("membership.firstPurchaseGift.code");
    const percentOff = this.settings.getInt("membership.firstPurchaseGift.percentOff");
    const expiresOn = this.settings.get<string | null>("membership.firstPurchaseGift.expiresOn") || null;
    if (!code || !Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) return null;
    if (expiresOn && now.getTime() > giftExpiryInstant(expiresOn)) return null;
    return { code, percentOff, expiresOn };
  }

  /** The active gift when `code` is its code (any case, surrounding spaces ignored); otherwise null. */
  matching(code: string): ActiveGift | null {
    const gift = this.active();
    return gift && code.trim().toUpperCase() === gift.code.toUpperCase() ? gift : null;
  }

  /** Counts one gift-code attempt for this account; throws once the minute's budget is spent. */
  async countAttempt(userId: string): Promise<void> {
    const retryAfter = await this.limiter.consume(GIFT_ATTEMPTS.bucket, userId, GIFT_ATTEMPTS.limit, GIFT_ATTEMPTS.windowSeconds);
    if (retryAfter > 0) throw new SubscriptionGiftRateLimitedException(retryAfter);
  }

  /**
   * First paid purchase only, once: neither the account (in any household) nor the household ever paid for a
   * membership or redeemed the gift. A trial is not a purchase, so the gift still applies after one.
   */
  async isEligible(client: QueryClient, householdId: string | null, userId: string): Promise<boolean> {
    if (await userHasPaid(client, userId)) return false;
    if (await client.subscriptionGiftRedemption.count({ where: { userId } })) return false;
    if (!householdId) return true;
    if (await householdHasPaid(client, householdId)) return false;
    return (await client.subscriptionGiftRedemption.count({ where: { householdId } })) === 0;
  }

  /** Whole IRR, rounded down, so the member never pays more than the percentage promised. */
  discountFor(listAmount: number, percentOff: number): number {
    return Math.floor((listAmount * percentOff) / 100);
  }

  /**
   * "Apply" at checkout: rate-limited, and every refusal is the same 400 — wrong code, gift off or expired, or not
   * eligible — so a caller never learns whether a code exists or was used by someone else.
   */
  async check(householdId: string, userId: string, code: string): Promise<MembershipGiftOfferDto> {
    await this.countAttempt(userId);
    const gift = this.matching(code);
    if (!gift || !(await this.isEligible(this.prisma, householdId, userId))) throw new SubscriptionGiftCodeNotApplicableException();
    return toGiftOfferDto(gift);
  }

  /** The gift to show this viewer, or null (off, expired, or not their first paid purchase). */
  async offerFor(householdId: string | null, userId: string): Promise<MembershipGiftOfferDto | null> {
    const gift = this.active();
    if (!gift || !(await this.isEligible(this.prisma, householdId, userId))) return null;
    return toGiftOfferDto(gift);
  }
}

export function toGiftOfferDto(gift: ActiveGift): MembershipGiftOfferDto {
  return { code: gift.code, percentOff: gift.percentOff, expiresOn: gift.expiresOn };
}
