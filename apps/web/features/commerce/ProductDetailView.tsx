"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useStickyTop } from "@/features/shared/use-sticky-top";
import { BadgeCheck, Button, ContextSurface, ErrorRecovery, Heart, Repeat, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProductDetailDto, ProductReviewDto, SellerOfferDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { ApiError } from "@/lib/api/client";
import { buildLoginUrl } from "@/lib/auth/return-to";
import { formatNumber, PriceBlock, ProductImage, RatingInline, StarRow, StockBadge } from "./commerce-ui";
import { ProductCard } from "./ProductCard";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  LIKELY_COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_RECOMMENDED: "attention",
  POTENTIAL_SAFETY_CONFLICT: "urgent",
  UNKNOWN: "neutral",
};

const MAX_LINE_QUANTITY = 20;

/**
 * Product Detail (Product Detail pattern). Hierarchy: pet context →
 * compatibility → product → variant → offer → quantity → add to cart /
 * repeat delivery. Compatibility is always above the CTA. The default offer
 * is the server's deterministic choice (available → lowest price the
 * customer pays → id); every other offer stays visible and selectable.
 */
export function ProductDetailView({ productId }: { productId: string }) {
  const t = useTranslations("commerce.detail");
  const tCompat = useTranslations("commerce.compatibility");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const { activePet } = useActivePet();

  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [error, setError] = useState<"notFound" | "failed" | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const buyPanelRef = useStickyTop();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [reviews, setReviews] = useState<ProductReviewDto[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewsTotal, setReviewsTotal] = useState(0);

  async function load() {
    setError(null);
    setProduct(null);
    try {
      const detail = await commerceService.getProductDetail(productId, activePet?.id);
      setProduct(detail);
      const defaultOffer = detail.offers.find((o) => o.id === detail.defaultOfferId) ?? null;
      const initialVariant = defaultOffer?.productVariantId ?? detail.variants.find((v) => v.isActive)?.id ?? detail.variants[0]?.id ?? null;
      setVariantId(initialVariant);
      setOfferId(defaultOffer?.id ?? detail.offers.find((o) => o.productVariantId === initialVariant)?.id ?? null);
      setFavorited(detail.favorited);
      setReviews(detail.reviews);
      setReviewsTotal(detail.rating.count);
      setReviewPage(1);
      setQuantity(1);
      setImageIndex(0);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "notFound" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, activePet?.id]);

  const offersForVariant = useMemo(() => {
    if (!product) return [];
    const list = product.offers.filter((o) => o.productVariantId === variantId);
    // Available first, then the price the customer pays, then id — the same rule as the server default.
    return [...list].sort((a, b) => Number(b.availableQuantity > 0) - Number(a.availableQuantity > 0) || a.effectiveUnitPrice - b.effectiveUnitPrice || a.id.localeCompare(b.id));
  }, [product, variantId]);
  const selectedOffer: SellerOfferDto | undefined = offersForVariant.find((o) => o.id === offerId) ?? offersForVariant[0];
  const images = useMemo(() => {
    if (!product) return [];
    const forVariant = product.media.filter((m) => m.variantId === variantId);
    const general = product.media.filter((m) => !m.variantId);
    return forVariant.length ? [...forVariant, ...general] : general.length ? general : product.media;
  }, [product, variantId]);
  const maxQuantity = selectedOffer ? Math.min(selectedOffer.availableQuantity, MAX_LINE_QUANTITY) : 0;

  function selectVariant(newVariantId: string) {
    setVariantId(newVariantId);
    const next = product?.offers.filter((o) => o.productVariantId === newVariantId) ?? [];
    setOfferId(next.find((o) => o.availableQuantity > 0)?.id ?? next[0]?.id ?? null);
    setQuantity(1);
    setAdded(false);
    setImageIndex(0);
  }

  function requireLogin(err: unknown): boolean {
    if (err instanceof ApiError && err.status === 401) {
      router.push(buildLoginUrl(locale, window.location.pathname));
      return true;
    }
    return false;
  }

  async function addToCart() {
    if (!selectedOffer) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await commerceService.addCartItem(selectedOffer.id, quantity, activePet?.id ?? null);
      setAdded(true);
    } catch (err) {
      if (requireLogin(err)) return;
      setAddError(err instanceof ApiError && err.status < 500 ? err.message : t("addFailed"));
    } finally {
      setIsAdding(false);
    }
  }

  async function toggleFavorite() {
    const next = !favorited;
    setFavorited(next);
    try {
      await commerceService.setFavorite(productId, next);
    } catch (err) {
      setFavorited(!next);
      requireLogin(err);
    }
  }

  async function loadMoreReviews() {
    const next = reviewPage + 1;
    const page = await commerceService.listProductReviews(productId, next);
    setReviews((current) => [...current, ...page.items.filter((r) => !current.some((c) => c.id === r.id))]);
    setReviewPage(next);
    setReviewsTotal(page.total);
  }

  if (error === "notFound") return <ErrorRecovery title={t("notFound")} message={t("notFoundHint")} retryLabel={t("backToShop")} onRetry={() => router.push(`/${locale}/shop/products`)} />;
  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!product) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;

  const variant = product.variants.find((v) => v.id === variantId);
  const suitability = [
    product.supportsDog && product.supportsCat ? t("suits.both") : product.supportsDog ? t("suits.dog") : product.supportsCat ? t("suits.cat") : null,
    product.maxAgeMonths !== null
      ? t("suits.age", { min: formatNumber(product.minAgeMonths ?? 0, locale), max: formatNumber(product.maxAgeMonths, locale) })
      : product.minAgeMonths !== null
        ? t("suits.ageFrom", { min: formatNumber(product.minAgeMonths, locale) })
        : null,
    product.maxWeightKg !== null
      ? t("suits.weight", { min: formatNumber(product.minWeightKg ?? 0, locale), max: formatNumber(product.maxWeightKg, locale) })
      : product.minWeightKg !== null
        ? t("suits.weightFrom", { min: formatNumber(product.minWeightKg, locale) })
        : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-10 pb-24 lg:pb-0">
      <nav aria-label={t("breadcrumb")} className="flex flex-wrap items-center gap-1 text-metadata text-text-secondary">
        <button type="button" className="hover:text-text-primary" onClick={() => router.push(`/${locale}/shop`)}>
          {t("shop")}
        </button>
        <span aria-hidden="true">/</span>
        <button type="button" className="hover:text-text-primary" onClick={() => router.push(`/${locale}/shop/products?category=${product.category.id}`)}>
          {product.category.name}
        </button>
      </nav>

      <div className="product-layout">
        <div className="product-layout__gallery flex flex-col gap-3">
          <ProductImage src={images[imageIndex]?.url ?? null} alt={images[imageIndex]?.alt ?? product.title} className="aspect-square w-full rounded-lg border border-border-subtle" />
          {images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={t("gallery")}>
              {images.map((m, i) => (
                <button key={m.id} type="button" role="tab" aria-selected={i === imageIndex} onClick={() => setImageIndex(i)} className={`shrink-0 overflow-hidden rounded-md border ${i === imageIndex ? "border-brand-natural" : "border-border-subtle"}`}>
                  <ProductImage src={m.url} alt={m.alt ?? ""} className="h-16 w-16" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div ref={buyPanelRef} className="product-layout__buy flex flex-col gap-5">
          {activePet ? <p className="text-metadata text-text-secondary">{t("shoppingFor", { name: activePet.name })}</p> : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              {product.brand ? <p className="text-metadata text-text-secondary">{product.brand.name}</p> : null}
              <h1 className="text-page-title text-text-primary">{product.title}</h1>
              <div className="mt-1">
                {product.rating.count ? (
                  <a href="#reviews">
                    <RatingInline rating={product.rating} />
                  </a>
                ) : (
                  <span className="text-metadata text-text-secondary">{t("noReviewsYet")}</span>
                )}
              </div>
            </div>
            <button type="button" onClick={toggleFavorite} aria-pressed={favorited} aria-label={favorited ? t("unfavorite") : t("favorite")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle hover:border-border-strong">
              <Heart size={20} aria-hidden="true" className={favorited ? "fill-current text-state-urgent" : "text-text-secondary"} />
            </button>
          </div>

          {product.compatibility ? (
            <div className="calm-note flex flex-col gap-2">
              <StatusLabel tone={COMPATIBILITY_TONE[product.compatibility.status] ?? "neutral"}>{tCompat(`status.${product.compatibility.status}`)}</StatusLabel>
              {product.compatibility.reasons.map((reason) => (
                <p key={reason} className="text-metadata text-text-secondary">
                  {tCompat(`reason.${reason}`)}
                </p>
              ))}
            </div>
          ) : null}

          {product.variants.length > 1 || variant?.title ? (
            <div>
              <p className="mb-2 text-section-title text-text-primary">{t("variant")}</p>
              <div className="flex flex-wrap gap-2">
                {product.variants
                  .filter((v) => v.isActive)
                  .map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={v.id === variantId}
                      onClick={() => selectVariant(v.id)}
                      className={`min-h-11 rounded-md border px-3 py-2 text-metadata ${v.id === variantId ? "border-brand-natural bg-brand-natural/10 text-text-primary" : "border-border-subtle text-text-secondary"}`}
                    >
                      {v.title ?? v.sku}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-section-title text-text-primary">{offersForVariant.length > 1 ? t("offersCount", { count: offersForVariant.length }) : t("offer")}</p>
            {offersForVariant.length === 0 ? (
              <StatusLabel tone="attention">{t("noOffers")}</StatusLabel>
            ) : (
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("offer")}>
                {offersForVariant.map((offer) => (
                  <button key={offer.id} type="button" role="radio" aria-checked={offer.id === selectedOffer?.id} className="w-full text-start" onClick={() => { setOfferId(offer.id); setQuantity(1); }}>
                    <ContextSurface className={`flex flex-col gap-2 ${offer.id === selectedOffer?.id ? "border-brand-natural" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="inline-flex items-center gap-1.5 text-body font-medium text-text-primary">
                          {offer.sellerOrganization.name}
                          {offer.sellerOrganization.verificationStatus === "VERIFIED" ? <BadgeCheck size={16} aria-label={t("verified")} className="text-state-success" /> : null}
                        </p>
                        <StockBadge state={offer.stockState} available={offer.availableQuantity} />
                      </div>
                      <PriceBlock unitPrice={offer.effectiveUnitPrice} listUnitPrice={offer.unitDiscount > 0 ? offer.priceAmount : null} promotionName={offer.promotion?.name ?? null} />
                      {offer.repeatDeliveryEligible ? (
                        <span className="inline-flex items-center gap-1 text-metadata text-text-secondary">
                          <Repeat size={14} aria-hidden="true" />
                          {t("repeatAvailable")}
                        </span>
                      ) : null}
                    </ContextSurface>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedOffer && maxQuantity > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-metadata text-text-secondary">{t("quantity")}</span>
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" aria-label={t("decrease")} onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
                  −
                </Button>
                <span className="min-w-8 text-center text-body text-text-primary" aria-live="polite">
                  {formatNumber(quantity, locale)}
                </span>
                <Button variant="secondary" size="sm" aria-label={t("increase")} onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} disabled={quantity >= maxQuantity}>
                  +
                </Button>
              </div>
            </div>
          ) : null}

          {addError ? (
            <p role="alert" className="text-metadata text-state-urgent">
              {addError}
            </p>
          ) : null}

          <div className="product-buy-bar flex gap-3">
            <Button variant="primary" className="flex-1" isLoading={isAdding} disabled={!selectedOffer || maxQuantity === 0} onClick={addToCart}>
              {selectedOffer && maxQuantity === 0 ? t("outOfStock") : t("addToCart")}
            </Button>
            {added ? (
              <Button variant="secondary" onClick={() => router.push(`/${locale}/cart`)}>
                {t("goToCart")}
              </Button>
            ) : null}
          </div>

          {selectedOffer?.repeatDeliveryEligible && maxQuantity > 0 ? (
            <div className="split-panel flex flex-col gap-2">
              <p className="inline-flex items-center gap-2 text-body font-medium text-text-primary">
                <Repeat size={18} aria-hidden="true" />
                {t("repeatTitle")}
              </p>
              <p className="text-metadata text-text-secondary">{t("repeatExplain")}</p>
              <Button variant="secondary" onClick={() => router.push(`/${locale}/repeat-delivery/new?productId=${product.id}&offerId=${selectedOffer.id}&quantity=${quantity}`)}>
                {t("repeatCta")}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="product-layout__details flex flex-col gap-10">
      {product.description || suitability.length || product.specifications.length ? (
        <section className="grid gap-6 xl:grid-cols-2">
          {product.description ? (
            <div>
              <h2 className="mb-2 text-section-title text-text-primary">{t("about")}</h2>
              <p className="whitespace-pre-line text-body text-text-secondary">{product.description}</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-4">
            {suitability.length ? (
              <div>
                <h2 className="mb-2 text-section-title text-text-primary">{t("suitability")}</h2>
                <ul className="flex flex-wrap gap-2">
                  {suitability.map((s) => (
                    <li key={s} className="rounded-full bg-surface-subtle px-3 py-1 text-metadata text-text-secondary">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {product.specifications.length || variant?.attributes ? (
              <div>
                <h2 className="mb-2 text-section-title text-text-primary">{t("specifications")}</h2>
                <dl className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {[...Object.entries(variant?.attributes ?? {}).map(([label, value]) => ({ label, value })), ...product.specifications].map((spec) => (
                    <div key={`${spec.label}-${spec.value}`} className="grid grid-cols-2 gap-3 px-3 py-2 text-metadata">
                      <dt className="text-text-secondary">{spec.label}</dt>
                      <dd className="text-text-primary">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section id="reviews" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-section-title text-text-primary">{t("reviewsTitle")}</h2>
          <p className="text-metadata text-text-secondary">{t("reviewsVerifiedOnly")}</p>
        </div>
        {reviews.length === 0 ? (
          <p className="text-body text-text-secondary">{t("noReviewsYet")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
            {reviews.map((review) => (
              <li key={review.id}>
                <div className="flex flex-col gap-1.5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <StarRow value={review.rating} />
                      <span className="text-metadata text-text-primary">{review.authorName}</span>
                    </span>
                    <span className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(review.createdAt))}</span>
                  </div>
                  {review.variantTitle ? <p className="text-metadata text-text-secondary">{review.variantTitle}</p> : null}
                  {review.body ? <p className="text-body text-text-primary">{review.body}</p> : null}
                  <p className="text-metadata text-state-success">{t("verifiedPurchase")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {reviews.length < reviewsTotal ? (
          <Button variant="secondary" onClick={loadMoreReviews}>
            {t("moreReviews")}
          </Button>
        ) : null}
      </section>
        </div>
      </div>

      {product.related.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-section-title text-text-primary">{t("related")}</h2>
          <div className="product-grid">
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} onClick={() => router.push(`/${locale}/shop/products/${p.id}`)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
