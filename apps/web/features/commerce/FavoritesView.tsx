"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Heart, Skeleton } from "@petlife/ui";
import type { ProductSummaryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { CommercePage } from "./CommercePage";
import { ProductCard } from "./ProductCard";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";

/** Saved products, with live price and stock (never a cached copy). */
export function FavoritesView() {
  const t = useTranslations("commerce.favorites");
  const router = useRouter();
  const locale = useLocale() as RouteLocale;
  const [items, setItems] = useState<ProductSummaryDto[] | null>(null);
  const [error, setError] = useState<"failed" | "offline" | "noAccess" | null>(null);

  async function load() {
    setError(null);
    try {
      setItems(await commerceService.listFavorites());
    } catch (err) {
      setError(navigator.onLine === false ? "offline" : err instanceof ApiError && (err.status === 401 || err.status === 403) ? "noAccess" : "failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={t(error === "noAccess" ? "accessDeniedTitle" : error === "offline" ? "offlineTitle" : "title")} message={t(error === "noAccess" ? "accessDeniedHint" : error === "offline" ? "offlineHint" : "loadFailed")} retryLabel={t("retry")} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <CommercePage>
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {items.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyHint")} icon={<Heart size={28} />} actionLabel={t("browse")} onAction={() => router.push(`/${locale}/shop/products`)} />
      ) : (
        <div className="product-grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} onClick={() => router.push(`/${locale}/shop/products/${product.id}`)} />
          ))}
        </div>
      )}
    </CommercePage>
  );
}
