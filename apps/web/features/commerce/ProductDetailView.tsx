"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProductDetailDto, SellerOfferDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { ApiError } from "@/lib/api/client";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  LIKELY_COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_RECOMMENDED: "attention",
  POTENTIAL_SAFETY_CONFLICT: "urgent",
  UNKNOWN: "neutral",
};

/**
 * Product Detail (spec section 54) — hierarchy is Pet Context ->
 * Compatibility -> Product -> Variant -> Offer -> Add to Cart. Compatibility
 * is always shown above the CTA, never below it, when it is anything other
 * than a plain COMPATIBLE.
 */
export function ProductDetailView({ productId }: { productId: string }) {
  const t = useTranslations("commerce.detail");
  const tCompat = useTranslations("commerce.compatibility");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const { activePet } = useActivePet();

  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [error, setError] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function load() {
    setError(false);
    setProduct(null);
    try {
      const detail = await commerceService.getProductDetail(productId, activePet?.id);
      setProduct(detail);
      const firstVariant = detail.variants[0] ?? null;
      setVariantId(firstVariant?.id ?? null);
      const firstOffer = detail.offers.find((o) => o.productVariantId === firstVariant?.id) ?? null;
      setOfferId(firstOffer?.id ?? null);
      setQuantity(1);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, activePet?.id]);

  const offersForVariant = useMemo(
    () => (product ? product.offers.filter((o) => o.productVariantId === variantId) : []),
    [product, variantId],
  );
  const selectedOffer: SellerOfferDto | undefined = offersForVariant.find((o) => o.id === offerId);

  function selectVariant(newVariantId: string) {
    setVariantId(newVariantId);
    const nextOffers = product?.offers.filter((o) => o.productVariantId === newVariantId) ?? [];
    setOfferId(nextOffers[0]?.id ?? null);
    setQuantity(1);
    setAdded(false);
  }

  async function addToCart() {
    if (!selectedOffer) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await commerceService.addCartItem(selectedOffer.id, quantity, activePet?.id ?? null);
      setAdded(true);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : t("addFailed"));
    } finally {
      setIsAdding(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!product) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      {activePet ? <p className="text-metadata text-text-secondary">{t("shoppingFor", { name: activePet.name })}</p> : null}

      <div>
        <h1 className="text-page-title text-text-primary">{product.title}</h1>
        {product.brand ? <p className="text-body text-text-secondary">{product.brand.name}</p> : null}
      </div>

      {product.compatibility ? (
        <ContextSurface className="flex flex-col gap-2">
          <StatusLabel tone={COMPATIBILITY_TONE[product.compatibility.status] ?? "neutral"}>
            {tCompat(`status.${product.compatibility.status}`)}
          </StatusLabel>
          {product.compatibility.reasons.map((reason) => (
            <p key={reason} className="text-metadata text-text-secondary">
              {tCompat(`reason.${reason}`)}
            </p>
          ))}
        </ContextSurface>
      ) : null}

      {product.description ? <p className="text-body text-text-secondary">{product.description}</p> : null}

      <div>
        <p className="mb-2 text-section-title text-text-primary">{t("variant")}</p>
        <div className="flex flex-wrap gap-2">
          {product.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => selectVariant(variant.id)}
              className={`rounded-md border px-3 py-2 text-metadata ${
                variant.id === variantId ? "border-brand-mint bg-brand-mint/10 text-text-primary" : "border-border-subtle text-text-secondary"
              }`}
            >
              {variant.title ?? variant.sku}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-section-title text-text-primary">{t("offer")}</p>
        {offersForVariant.length === 0 ? (
          <StatusLabel tone="attention">{t("noOffers")}</StatusLabel>
        ) : (
          <div className="flex flex-col gap-2">
            {offersForVariant.map((offer) => (
              <button key={offer.id} type="button" className="w-full text-start" onClick={() => setOfferId(offer.id)}>
                <ContextSurface className={offer.id === offerId ? "border-brand-mint" : ""}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-body font-medium text-text-primary">{offer.sellerOrganization.name}</p>
                    {offer.sellerOrganization.verificationStatus === "VERIFIED" ? (
                      <StatusLabel tone="success">{t("verified")}</StatusLabel>
                    ) : null}
                  </div>
                  <p className="text-body text-text-primary">{formatCurrency(offer.priceAmount, locale)}</p>
                  <p className="text-metadata text-text-secondary">
                    {offer.availableQuantity > 0 ? t("inStock", { count: offer.availableQuantity }) : t("outOfStock")}
                  </p>
                  <p className="text-metadata text-text-secondary">{t("deliveryPlaceholder")}</p>
                </ContextSurface>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedOffer ? (
        <ContextSurface className="flex items-center justify-between gap-3">
          <span className="text-metadata text-text-secondary">{t("quantity")}</span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
              −
            </Button>
            <span className="text-body text-text-primary">{quantity}</span>
            <Button
              variant="ghost"
              onClick={() => setQuantity((q) => Math.min(selectedOffer.availableQuantity, q + 1))}
              disabled={quantity >= selectedOffer.availableQuantity}
            >
              +
            </Button>
          </div>
        </ContextSurface>
      ) : null}

      {addError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {addError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          variant="primary"
          className="flex-1"
          isLoading={isAdding}
          disabled={!selectedOffer || selectedOffer.availableQuantity === 0}
          onClick={addToCart}
        >
          {t("addToCart")}
        </Button>
        {added ? (
          <Button variant="secondary" onClick={() => router.push(`/${locale}/cart`)}>
            {t("goToCart")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
