"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { ProductCategoryDto, ProductSummaryDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { ProductCard } from "./ProductCard";

/**
 * Shop Home (spec section 51) — Active Pet, categories, a basic discovery
 * list. Deliberately no recommendation engine: the list below is just
 * "every active product", the same deterministic compatibility engine
 * every other Shop screen uses, never a ranked/personalized feed.
 */
export function ShopHomeView() {
  const t = useTranslations("commerce.shopHome");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const locale = useLocale();
  const { activePet } = useActivePet();

  const [categories, setCategories] = useState<ProductCategoryDto[] | null>(null);
  const [products, setProducts] = useState<ProductSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setProducts(null);
    void Promise.all([
      commerceService.listCategories(),
      commerceService.searchProducts({ petId: activePet?.id }),
    ])
      .then(([nextCategories, nextProducts]) => {
        if (cancelled) return;
        setCategories(nextCategories);
        setProducts(nextProducts);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activePet?.id, retry]);

  if (error)
    return (
      <ErrorRecovery
        title={tErrors("generic")}
        message=""
        retryLabel={tCommon("retry")}
        onRetry={() => setRetry((value) => value + 1)}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        {activePet ? (
          <p className="mt-1 text-body text-text-secondary">{t("subtitle", { name: activePet.name })}</p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-section-title text-text-primary">{t("categories")}</p>
        {!categories ? (
          <Skeleton className="h-20 w-full" aria-label={t("loading")} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="text-start"
                onClick={() => router.push(`/${locale}/shop/products?category=${category.id}`)}
              >
                <ContextSurface className="flex flex-col gap-1">
                  <p className="text-body font-medium text-text-primary">{category.name}</p>
                </ContextSurface>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-section-title text-text-primary">{t("browseAll")}</p>
        {!products ? (
          <Skeleton className="h-64 w-full" aria-label={t("loading")} />
        ) : (
          <div className="flex flex-col gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => router.push(`/${locale}/shop/products/${product.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
