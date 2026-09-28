"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, ShoppingBag, Skeleton, StatusLabel } from "@petlife/ui";
import type { CartDto, CartLineDto, CartLineIssue } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { ApiError } from "@/lib/api/client";
import { formatNumber, PriceBlock } from "./commerce-ui";

const COMPATIBILITY_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  COMPATIBLE: "success",
  LIKELY_COMPATIBLE: "success",
  NEEDS_REVIEW: "attention",
  NOT_RECOMMENDED: "attention",
  POTENTIAL_SAFETY_CONFLICT: "urgent",
  UNKNOWN: "neutral",
};

const BLOCKING: CartLineIssue[] = ["OFFER_UNAVAILABLE", "SELLER_UNAVAILABLE", "OUT_OF_STOCK", "QUANTITY_EXCEEDS_STOCK"];
const MAX_LINE_QUANTITY = 20;

/**
 * Cart (Cart/Checkout pattern) — grouped by seller. Every amount is the
 * server's live price; a line whose price or promotion changed since it was
 * added says so and the customer accepts the new price explicitly.
 * Blocking problems (unavailable, out of stock) must be fixed before
 * checkout is offered.
 */
export function CartView() {
  const t = useTranslations("commerce.cart");
  const tCompat = useTranslations("commerce.compatibility");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [cart, setCart] = useState<CartDto | null>(null);
  const [error, setError] = useState(false);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

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

  async function run(lineId: string | null, action: () => Promise<CartDto>) {
    setBusyLineId(lineId);
    setActionError(null);
    try {
      setCart(await action());
    } catch (err) {
      setActionError(err instanceof ApiError && err.status < 500 ? err.message : t("actionFailed"));
      void load();
    } finally {
      setBusyLineId(null);
    }
  }

  async function acceptPrices() {
    setAccepting(true);
    await run(null, () => commerceService.acceptCartPrices());
    setAccepting(false);
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!cart) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  if (cart.sellerGroups.length === 0) {
    return <EmptyState title={t("empty")} icon={<ShoppingBag size={28} />} actionLabel={t("browseShop")} onAction={() => router.push(`/${locale}/shop`)} />;
  }

  const lines = cart.sellerGroups.flatMap((g) => g.lines);
  const hasPriceChanges = lines.some((l) => l.issues.includes("PRICE_CHANGED") || l.issues.includes("PROMOTION_EXPIRED"));
  const grossSubtotal = cart.subtotalAmount + cart.discountAmount;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>

        {cart.hasSafetyConflict ? <StatusLabel tone="urgent">{t("safetyConflictBanner")}</StatusLabel> : null}
        {hasPriceChanges ? (
          <ContextSurface className="flex flex-col gap-2 border-state-attention">
            <p className="text-body text-text-primary">{t("pricesChangedBanner")}</p>
            <Button variant="secondary" isLoading={accepting} onClick={acceptPrices}>
              {t("acceptPrices")}
            </Button>
          </ContextSurface>
        ) : null}
        {actionError ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {actionError}
          </p>
        ) : null}

        {cart.sellerGroups.map((group) => (
          <ContextSurface key={group.sellerOrganization.id} className="flex flex-col gap-3">
            <p className="text-body font-medium text-text-primary">{t("soldBy", { seller: group.sellerOrganization.name })}</p>
            {group.lines.map((line) => (
              <CartLine
                key={line.id}
                line={line}
                busy={busyLineId === line.id}
                onQuantity={(q) => run(line.id, () => commerceService.updateCartItem(line.id, q))}
                onRemove={() => run(line.id, () => commerceService.removeCartItem(line.id))}
                onOpen={() => router.push(`/${locale}/shop/products/${line.productId}`)}
                compatibilityLabel={line.compatibility ? tCompat(`status.${line.compatibility.status}`) : null}
              />
            ))}
            <div className="flex items-center justify-between border-t border-border-subtle pt-3">
              <span className="text-metadata text-text-secondary">{t("sellerSubtotal")}</span>
              <span className="text-body text-text-primary">{formatCurrency(group.subtotalAmount, locale)}</span>
            </div>
          </ContextSurface>
        ))}
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <ContextSurface className="flex flex-col gap-2">
          <Row label={t("itemsTotal", { count: cart.totalItems })} value={formatCurrency(grossSubtotal, locale)} />
          {cart.discountAmount > 0 ? <Row label={t("promotions")} value={`− ${formatCurrency(cart.discountAmount, locale)}`} tone="success" /> : null}
          <Row label={t("delivery")} value={t("deliveryAtCheckout")} muted />
          <div className="border-t border-border-subtle pt-2">
            <Row label={t("subtotal")} value={formatCurrency(cart.subtotalAmount, locale)} strong />
          </div>
        </ContextSurface>
        {cart.hasBlockingIssues ? <p className="text-metadata text-state-attention">{t("fixIssuesFirst")}</p> : null}
        <Button variant="primary" disabled={cart.hasBlockingIssues} onClick={() => router.push(`/${locale}/checkout`)}>
          {t("proceedToCheckout")}
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/${locale}/shop/products`)}>
          {t("continueShopping")}
        </Button>
      </aside>
    </div>
  );
}


function CartLine({ line, busy, onQuantity, onRemove, onOpen, compatibilityLabel }: { line: CartLineDto; busy: boolean; onQuantity: (q: number) => void; onRemove: () => void; onOpen: () => void; compatibilityLabel: string | null }) {
  const t = useTranslations("commerce.cart");
  const locale = useLocale() as "fa" | "en";
  const max = Math.min(MAX_LINE_QUANTITY, Math.max(line.quantity, line.sellerOffer.availableQuantity));
  const blocking = line.issues.filter((i) => BLOCKING.includes(i));
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="text-start" onClick={onOpen}>
          <p className="text-body text-text-primary">{line.productTitle}</p>
          {line.variantTitle ? <p className="text-metadata text-text-secondary">{line.variantTitle}</p> : null}
          <p className="text-metadata text-text-secondary">{line.targetPetName ? t("forPet", { name: line.targetPetName }) : t("noTargetPet")}</p>
        </button>
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
          {t("remove")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {compatibilityLabel && line.compatibility ? <StatusLabel tone={COMPATIBILITY_TONE[line.compatibility.status] ?? "neutral"}>{compatibilityLabel}</StatusLabel> : null}
        {line.issues.map((issue) => (
          <StatusLabel key={issue} tone={BLOCKING.includes(issue) ? "urgent" : "attention"}>
            {t(`issue.${issue}`, { count: formatNumber(line.sellerOffer.availableQuantity, locale) })}
          </StatusLabel>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label={t("decrease")} onClick={() => onQuantity(line.quantity - 1)} disabled={busy || line.quantity <= 1}>
            −
          </Button>
          <span className="min-w-8 text-center text-body text-text-primary">{formatNumber(line.quantity, locale)}</span>
          <Button variant="secondary" size="sm" aria-label={t("increase")} onClick={() => onQuantity(line.quantity + 1)} disabled={busy || line.quantity >= max || blocking.length > 0}>
            +
          </Button>
        </div>
        <div className="text-end">
          <PriceBlock size="sm" unitPrice={line.lineTotal} listUnitPrice={line.unitDiscount > 0 ? line.listUnitPrice * line.quantity : null} promotionName={line.promotionName} />
          {line.quantity > 1 ? <p className="text-metadata text-text-secondary">{t("each", { price: formatCurrency(line.currentPriceAmount, locale) })}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, muted, tone }: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-metadata ${muted ? "text-text-secondary" : "text-text-primary"}`}>{label}</span>
      <span className={`${strong ? "text-section-title font-semibold" : "text-body"} ${tone === "success" ? "text-state-success" : muted ? "text-text-secondary" : "text-text-primary"}`}>{value}</span>
    </div>
  );
}
