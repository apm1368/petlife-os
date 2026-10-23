"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Bone, EmptyState, ErrorRecovery, HeartPulse, PackageCheck, Repeat, ShoppingBag, Skeleton, Sparkles } from "@petlife/ui";
import type { ProductCategoryDto, ProductSummaryDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import Image from "next/image";
import Link from "next/link";
import { CommercePage, CommerceArrow } from "./CommercePage";
import { ShopSidebar } from "./ShopSidebar";
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
  const design = useTranslations("commerce.design");

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setPicks(null);
    setDeals(null);
    setCategories(null);
    const species = activePet?.species;
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

  if (error) return <ErrorRecovery title={t("unavailable")} message="" retryLabel={t("retry")} onRetry={() => setRetry((value) => value + 1)} />;

  const topCategories = (categories ?? []).filter((c) => !c.parentId);
  const openProduct = (id: string) => router.push(`/${locale}/shop/products/${id}`);

  return (
    <CommercePage className="shop-home">
      <div className="shop-layout">
      <ShopSidebar categories={topCategories} />
      <div className="shop-content">
      <section className="shop-hero">
        <div className="shop-hero__copy"><p className="commerce-eyebrow">{t("eyebrow")}</p><h1>{t("heroTitle")}</h1><p>{t("heroDescription")}</p><Link className="commerce-cta" href={`/${locale}/shop/products`}>{design("browse")}<CommerceArrow /></Link></div>
        <div className="shop-hero__photo"><Image src="/images/experience/shop-companions.webp" alt="" fill priority sizes="(max-width: 700px) 100vw, 650px" /></div>
      </section>

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
          <div className="shop-category-grid">
            {topCategories.map((category) => {
              const Icon = categoryIcon(category.slug);
              return (
                <button key={category.id} type="button" className="shop-category" onClick={() => router.push(`/${locale}/shop/products?category=${category.id}`)}>
                  <span className="shop-category__icon">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{category.name}</h3>
                  </div>
                </button>
              );
            })}
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
          <div className="product-grid">
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
          <div className="product-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full" />
            ))}
          </div>
        ) : picks.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} icon={<PackageCheck size={28} aria-hidden="true" />} />
        ) : (
          <div className="product-grid">
            {picks.map((product) => (
              <ProductCard key={product.id} product={product} onClick={() => openProduct(product.id)} />
            ))}
          </div>
        )}
      </section>
      <section className="shop-repeat"><Repeat size={38} aria-hidden="true" /><div><h2>{design("repeatTitle")}</h2><p>{design("repeatDescription")}</p></div><Link href={`/${locale}/repeat-delivery`}>{design("repeatCta")}<CommerceArrow /></Link></section>
      </div></div>
    </CommercePage>
  );
}
