"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Bone, EmptyState, ErrorRecovery, HeartPulse, PackageCheck, Repeat, Search, ShoppingBag, Skeleton, Sparkles } from "@petlife/ui";
import type { ProductCategoryDto, ProductSummaryDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { CinematicPageHero } from "@/features/experience/CinematicPageHero";
import { ProductCard } from "./ProductCard";

/** Icons are chosen from the category's own slug, never by list position. */
function categoryIcon(slug: string) {
  if (/food|treat|غذا|nutrition/i.test(slug)) return Bone;
  if (/health|pharm|supplement|vet|سلامت/i.test(slug)) return HeartPulse;
  if (/groom|care|hygiene|clean|مراقبت/i.test(slug)) return Sparkles;
  return ShoppingBag;
}

/**
 * Shop home (Commerce Discovery pattern). Everything shown comes from the
 * catalog API: real categories, real products with server-computed prices
 * and stock. When the catalog is empty the page says so — no preview
 * products, no invented prices or delivery promises.
 */
export function ShopHomeView() {
  const t = useTranslations("commerce.shopHome");
  const router = useRouter();
  const locale = useLocale();
  const { activePet } = useActivePet();
  const [categories, setCategories] = useState<ProductCategoryDto[] | null>(null);
  const [picks, setPicks] = useState<ProductSummaryDto[] | null>(null);
  const [deals, setDeals] = useState<ProductSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setPicks(null);
    const species = activePet?.species === "DOG" || activePet?.species === "CAT" ? activePet.species : undefined;
    void Promise.all([
      commerceService.listCategories(),
      commerceService.searchProducts({ petId: activePet?.id, species, sort: "RECOMMENDED", pageSize: 8 }),
      commerceService.searchProducts({ petId: activePet?.id, species, onPromotion: true, inStock: true, sort: "RECOMMENDED", pageSize: 4 }),
    ])
      .then(([nextCategories, recommended, promoted]) => {
        if (cancelled) return;
        setCategories(nextCategories);
        setPicks(recommended.items);
        setDeals(promoted.items);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activePet?.id, activePet?.species, retry]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(`/${locale}/shop/products${q ? `?search=${encodeURIComponent(q)}` : ""}`);
  }

  if (error) return <ErrorRecovery title={t("unavailable")} message="" retryLabel={t("retry")} onRetry={() => setRetry((value) => value + 1)} />;

  const topCategories = (categories ?? []).filter((c) => !c.parentId);
  const openProduct = (id: string) => router.push(`/${locale}/shop/products/${id}`);

  return (
    <div className="experience-stack">
      <CinematicPageHero image="/images/experience/shop-hero.png" eyebrow={t("eyebrow")} title={t("heroTitle")} description={t("heroDescription")}>
        <form className="experience-search" onSubmit={submitSearch} role="search">
          <label>
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">{t("searchLabel")}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
          </label>
          <button type="submit">{t("searchButton")}</button>
        </form>
      </CinematicPageHero>

      <section className="experience-section">
        <div className="experience-section__head">
          <div>
            <h2>{t("categories")}</h2>
            <p>{t("categoriesHint")}</p>
          </div>
        </div>
        {categories === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="experience-grid experience-grid--five">
            {topCategories.map((category) => {
              const Icon = categoryIcon(category.slug);
              return (
                <button key={category.id} type="button" className="experience-tile" onClick={() => router.push(`/${locale}/shop/products?category=${category.id}`)}>
                  <span className="experience-tile__icon">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{category.name}</h3>
                  </div>
                </button>
              );
            })}
            <button type="button" className="experience-tile" onClick={() => router.push(`/${locale}/repeat-delivery`)}>
              <span className="experience-tile__icon">
                <Repeat size={23} aria-hidden="true" />
              </span>
              <div>
                <h3>{t("repeatTitle")}</h3>
                <p>{t("repeatHint")}</p>
              </div>
            </button>
          </div>
        )}
      </section>

      {deals && deals.length ? (
        <section className="experience-section">
          <div className="experience-section__head">
            <div>
              <h2>{t("dealsTitle")}</h2>
              <p>{t("dealsHint")}</p>
            </div>
            <button type="button" className="text-cta text-brand-natural" onClick={() => router.push(`/${locale}/shop/products?onPromotion=true`)}>
              {t("seeAll")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {deals.map((product) => (
              <ProductCard key={product.id} product={product} onClick={() => openProduct(product.id)} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="experience-section">
        <div className="experience-section__head">
          <div>
            <h2>{t("picksTitle")}</h2>
            <p>{activePet ? t("subtitle", { name: activePet.name }) : t("picksHint")}</p>
          </div>
          <button type="button" className="text-cta text-brand-natural" onClick={() => router.push(`/${locale}/shop/products`)}>
            {t("seeAll")}
          </button>
        </div>
        {picks === null ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full" />
            ))}
          </div>
        ) : picks.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} icon={<PackageCheck size={28} aria-hidden="true" />} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {picks.map((product) => (
              <ProductCard key={product.id} product={product} onClick={() => openProduct(product.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
