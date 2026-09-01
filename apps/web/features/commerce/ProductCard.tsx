"use client";

import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, StatusLabel } from "@petlife/ui";
import type { ProductSummaryDto } from "@petlife/types";
import { formatCurrency } from "@/lib/currency/format-currency";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  LIKELY_COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_RECOMMENDED: "attention",
  POTENTIAL_SAFETY_CONFLICT: "urgent",
  UNKNOWN: "neutral",
};

/** Product/Brand/price/compatibility/availability (spec section 52) — no fake ratings, no sponsored treatment. */
export function ProductCard({ product, onClick }: { product: ProductSummaryDto; onClick: () => void }) {
  const t = useTranslations("commerce.productCard");
  const tCompat = useTranslations("commerce.compatibility");
  const locale = useLocale() as "fa" | "en";

  return (
    <button type="button" onClick={onClick} className="w-full text-start">
      <ContextSurface className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body font-medium text-text-primary">{product.title}</p>
          {product.brand ? <p className="text-metadata text-text-secondary">{product.brand.name}</p> : null}
        </div>
        {product.bestOffer ? (
          <p className="text-metadata text-text-secondary">{t("fromPrice", { price: formatCurrency(product.bestOffer.priceAmount, locale) })}</p>
        ) : (
          <StatusLabel tone="attention">{t("noAvailability")}</StatusLabel>
        )}
        {product.compatibility ? (
          <StatusLabel tone={COMPATIBILITY_TONE[product.compatibility.status] ?? "neutral"}>{tCompat(`status.${product.compatibility.status}`)}</StatusLabel>
        ) : null}
      </ContextSurface>
    </button>
  );
}
