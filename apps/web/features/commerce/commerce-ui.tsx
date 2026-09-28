"use client";

import { useLocale, useTranslations } from "next-intl";
import { PackageCheck, Star, StatusLabel } from "@petlife/ui";
import type { RatingSummaryDto, StockState } from "@petlife/types";
import { formatCurrency } from "@/lib/currency/format-currency";

type Locale = "fa" | "en";

/**
 * The customer-facing price. The struck-through amount is only ever the
 * seller's own current price when a real, server-applied promotion lowers
 * it — never a seller-typed "compare at" figure.
 */
export function PriceBlock({ unitPrice, listUnitPrice, promotionName, size = "md" }: { unitPrice: number; listUnitPrice?: number | null; promotionName?: string | null; size?: "sm" | "md" | "lg" }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("commerce.price");
  const discounted = listUnitPrice !== undefined && listUnitPrice !== null && listUnitPrice > unitPrice;
  const priceClass = size === "lg" ? "text-page-title" : size === "sm" ? "text-body" : "text-section-title";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`${priceClass} font-semibold text-text-primary`}>{formatCurrency(unitPrice, locale)}</span>
        {discounted ? (
          <span className="text-metadata text-text-secondary line-through" aria-label={t("was", { price: formatCurrency(listUnitPrice!, locale) })}>
            {formatCurrency(listUnitPrice!, locale)}
          </span>
        ) : null}
      </div>
      {discounted && promotionName ? (
        <span className="text-metadata text-state-success">
          {t("promotion", { name: promotionName, percent: Math.round(((listUnitPrice! - unitPrice) / listUnitPrice!) * 100).toLocaleString(locale === "fa" ? "fa-IR" : "en-US") })}
        </span>
      ) : null}
    </div>
  );
}

export function StockBadge({ state, available }: { state: StockState; available?: number }) {
  const t = useTranslations("commerce.stock");
  const locale = useLocale() as Locale;
  if (state === "OUT_OF_STOCK") return <StatusLabel tone="attention">{t("out")}</StatusLabel>;
  if (state === "LOW_STOCK") return <StatusLabel tone="attention">{available !== undefined ? t("lowCount", { count: available.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") }) : t("low")}</StatusLabel>;
  return <StatusLabel tone="success">{t("in")}</StatusLabel>;
}

/** Verified-purchase rating. Nothing is rendered without real reviews — no placeholder stars. */
export function RatingInline({ rating }: { rating: RatingSummaryDto }) {
  const t = useTranslations("commerce.rating");
  const locale = useLocale() as Locale;
  if (!rating.count || rating.average === null) return null;
  const nf = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 1 });
  return (
    <span className="inline-flex items-center gap-1 text-metadata text-text-secondary" aria-label={t("aria", { average: nf.format(rating.average), count: rating.count })}>
      <Star size={14} aria-hidden="true" className="fill-current text-brand-gold" />
      {nf.format(rating.average)}
      <span>({t("count", { count: rating.count })})</span>
    </span>
  );
}

export function StarRow({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} className={n <= value ? "fill-current text-brand-gold" : "text-border-strong"} />
      ))}
    </span>
  );
}

/** Product image, or a neutral tile — never an unrelated stock photo standing in for the product. */
export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface-subtle text-text-disabled ${className}`} aria-hidden="true">
        <PackageCheck size={32} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={`bg-surface-subtle object-contain ${className}`} />;
}

export function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
}
