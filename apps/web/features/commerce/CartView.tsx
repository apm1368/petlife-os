"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { CartDto, CartLineDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  LIKELY_COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_RECOMMENDED: "attention",
  POTENTIAL_SAFETY_CONFLICT: "urgent",
  UNKNOWN: "neutral",
};

/** Cart (spec section 55) — grouped by seller; never trusts the stale price snapshot for the shown total. */
export function CartView() {
  const t = useTranslations("commerce.cart");
  const tCompat = useTranslations("commerce.compatibility");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [cart, setCart] = useState<CartDto | null>(null);
  const [error, setError] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      setCart(await commerceService.getCart());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateQuantity(line: CartLineDto, quantity: number) {
    if (quantity < 1) return;
    setBusyLineId(line.id);
    try {
      setCart(await commerceService.updateCartItem(line.id, quantity));
    } finally {
      setBusyLineId(null);
    }
  }

  async function removeLine(line: CartLineDto) {
    setBusyLineId(line.id);
    try {
      setCart(await commerceService.removeCartItem(line.id));
    } finally {
      setBusyLineId(null);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!cart) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  if (cart.sellerGroups.length === 0) {
    return <EmptyState title={t("empty")} actionLabel={t("browseShop")} onAction={() => router.push(`/${locale}/shop`)} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {cart.hasSafetyConflict ? <StatusLabel tone="urgent">{t("safetyConflictBanner")}</StatusLabel> : null}

      {cart.sellerGroups.map((group) => (
        <ContextSurface key={group.sellerOrganization.id} className="flex flex-col gap-3">
          <p className="text-body font-medium text-text-primary">{group.sellerOrganization.name}</p>

          {group.lines.map((line) => (
            <div key={line.id} className="flex flex-col gap-2 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body text-text-primary">{line.productTitle}</p>
                  {line.variantTitle ? <p className="text-metadata text-text-secondary">{line.variantTitle}</p> : null}
                  <p className="text-metadata text-text-secondary">{line.targetPetName ? t("forPet", { name: line.targetPetName }) : t("noTargetPet")}</p>
                </div>
                <Button variant="ghost" onClick={() => removeLine(line)} disabled={busyLineId === line.id}>
                  {t("remove")}
                </Button>
              </div>

              {line.compatibility ? (
                <StatusLabel tone={COMPATIBILITY_TONE[line.compatibility.status] ?? "neutral"}>
                  {tCompat(`status.${line.compatibility.status}`)}
                </StatusLabel>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" onClick={() => updateQuantity(line, line.quantity - 1)} disabled={busyLineId === line.id || line.quantity <= 1}>
                    −
                  </Button>
                  <span className="text-body text-text-primary">{line.quantity}</span>
                  <Button variant="ghost" onClick={() => updateQuantity(line, line.quantity + 1)} disabled={busyLineId === line.id}>
                    +
                  </Button>
                </div>
                <div className="text-end">
                  <p className="text-body text-text-primary">{formatCurrency(line.lineTotal, locale)}</p>
                  {line.priceChanged ? <StatusLabel tone="attention">{t("priceChanged")}</StatusLabel> : null}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="text-metadata text-text-secondary">{t("sellerSubtotal")}</span>
            <span className="text-body text-text-primary">{formatCurrency(group.subtotalAmount, locale)}</span>
          </div>
        </ContextSurface>
      ))}

      <ContextSurface className="flex items-center justify-between">
        <span className="text-body font-medium text-text-primary">{t("subtotal")}</span>
        <span className="text-body font-medium text-text-primary">{formatCurrency(cart.subtotalAmount, locale)}</span>
      </ContextSurface>

      <Button variant="primary" onClick={() => router.push(`/${locale}/checkout`)}>
        {t("proceedToCheckout")}
      </Button>
    </div>
  );
}
