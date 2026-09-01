"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { ProductSummaryDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { ProductCard } from "./ProductCard";

/**
 * Product results (spec section 53) — category- or search-scoped listing.
 * A missing Active Pet never blocks browsing: compatibility is simply
 * omitted from each card until a pet is active.
 */
export function ProductResultsView({ category, search }: { category?: string; search?: string }) {
  const t = useTranslations("commerce.results");
  const router = useRouter();
  const locale = useLocale();
  const { activePet } = useActivePet();

  const [products, setProducts] = useState<ProductSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setProducts(null);
    try {
      setProducts(await commerceService.searchProducts({ category, search, petId: activePet?.id }));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search, activePet?.id]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!products) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {products.length === 0 ? <EmptyState title={t("empty")} /> : null}

      <div className="flex flex-col gap-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onClick={() => router.push(`/${locale}/shop/products/${product.id}`)} />
        ))}
      </div>
    </div>
  );
}
