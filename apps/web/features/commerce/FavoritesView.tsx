"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Heart, Skeleton } from "@petlife/ui";
import type { ProductSummaryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { ProductCard } from "./ProductCard";

/** Saved products, with live price and stock (never a cached copy). */
export function FavoritesView() {
  const t = useTranslations("commerce.favorites");
  const router = useRouter();
  const locale = useLocale();
  const [items, setItems] = useState<ProductSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setItems(await commerceService.listFavorites());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {items.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyHint")} icon={<Heart size={28} />} actionLabel={t("browse")} onAction={() => router.push(`/${locale}/shop/products`)} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} onClick={() => router.push(`/${locale}/shop/products/${product.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
