import { Injectable } from "@nestjs/common";
import type { Locale, SmsPatternTemplate } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export type ResolvedSmsPattern = Pick<
  SmsPatternTemplate,
  "key" | "locale" | "farazPatternCode" | "bodyAttributeKey"
>;

/**
 * Read-side resolver for AD-13. It deliberately returns only the code and
 * one safe body attribute name; Faraz credentials and the approved pattern
 * text never enter the database, audit history or API response.
 */
@Injectable()
export class SmsPatternTemplateService {
  private cache = new Map<string, { expiresAt: number; value: ResolvedSmsPattern | null }>();
  private readonly cacheMs = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    key: string | undefined,
    locale: "fa" | "en" | undefined,
  ): Promise<ResolvedSmsPattern | null> {
    if (!key || !locale) return null;
    const cacheKey = `${key}:${locale}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const row = await this.prisma.smsPatternTemplate.findFirst({
      where: { key, locale: locale as Locale, isActive: true },
      select: { key: true, locale: true, farazPatternCode: true, bodyAttributeKey: true },
    });
    const value = row ?? null;
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + this.cacheMs });
    return value;
  }

  invalidate(key: string, locale: Locale) {
    this.cache.delete(`${key}:${locale}`);
  }
}
