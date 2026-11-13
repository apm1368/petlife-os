import { Injectable } from "@nestjs/common";
import type { SponsoredCpcRate } from "@prisma/client";
import { SPONSORED_DEFAULT_CPC_IRR, type SponsoredRateDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";

const CACHE_MS = 30_000;

/**
 * The flat price per billable click (F-10: the same for everyone; T-01: 2,000 toman until staff set one). Staff set
 * it with settings.manage; every change is a new, effective-dated row, so the price at any moment and its whole
 * history can always be read back. Nothing is ever edited.
 */
@Injectable()
export class SponsoredRateService {
  private cache: { at: number; rows: SponsoredCpcRate[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async rows(): Promise<SponsoredCpcRate[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.rows;
    const rows = await this.prisma.sponsoredCpcRate.findMany({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 100 });
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** The price in effect at `at` (default: now). */
  async rateAt(at = new Date()): Promise<number> {
    return (await this.rows()).find((r) => r.effectiveFrom <= at)?.rateIrr ?? SPONSORED_DEFAULT_CPC_IRR;
  }

  /** The current price and the next scheduled change, if any. */
  async overview(now = new Date()): Promise<SponsoredRateDto> {
    const future = (await this.rows()).filter((r) => r.effectiveFrom > now).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
    return { currentIrr: await this.rateAt(now), next: future ? { rateIrr: future.rateIrr, effectiveFrom: future.effectiveFrom.toISOString() } : null };
  }
}
