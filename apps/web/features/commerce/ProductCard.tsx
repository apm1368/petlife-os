"use client";

import { useTranslations } from "next-intl";
import { StatusLabel } from "@petlife/ui";
import type { ProductSummaryDto } from "@petlife/types";
import { PriceBlock, ProductImage, RatingInline, StockBadge } from "./commerce-ui";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  LIKELY_COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_RECOMMENDED: "attention",
  POTENTIAL_SAFETY_CONFLICT: "urgent",
  UNKNOWN: "neutral",
};

/**
 * Product card (Commerce Discovery pattern): image, title, brand, the price
 * the customer actually pays (server-computed), real stock state,
 * verified-purchase rating only when reviews exist, and pet compatibility
 * when an active pet is known. No sponsored treatment, no invented badges.
 */
export function ProductCard({ product, onClick }: { product: ProductSummaryDto; onClick: () => void }) {
  const t = useTranslations("commerce.productCard");
  const tCompat = useTranslations("commerce.compatibility");
  const offer = product.bestOffer;

  return (
    <button type="button" onClick={onClick} className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-elevated text-start transition hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      <ProductImage src={product.imageUrl} alt={product.title} className="aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand ? <p className="text-metadata text-text-secondary">{product.brand.name}</p> : null}
        <p className="line-clamp-2 text-body font-medium text-text-primary">{product.title}</p>
        {product.variantTitle ? <p className="text-metadata text-text-secondary">{product.variantTitle}</p> : null}
        <RatingInline rating={product.rating} />
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {offer ? (
            <PriceBlock size="sm" unitPrice={offer.effectiveUnitPrice} listUnitPrice={offer.unitDiscount > 0 ? offer.priceAmount : null} promotionName={offer.promotion?.name ?? null} />
          ) : (
            <StatusLabel tone="attention">{t("noAvailability")}</StatusLabel>
          )}
          <div className="flex flex-wrap gap-1.5">
            {offer ? <StockBadge state={product.stockState} /> : null}
            {product.compatibility ? (
              <StatusLabel tone={COMPATIBILITY_TONE[product.compatibility.status] ?? "neutral"}>{tCompat(`status.${product.compatibility.status}`)}</StatusLabel>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
