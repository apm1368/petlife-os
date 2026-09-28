"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Repeat, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { CustomerAddressDto, ProductDetailDto, RepeatDeliveryDto, SellerOfferDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { addressesService } from "@/services/addresses.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { ApiError } from "@/lib/api/client";
import { formatNumber, ProductImage } from "./commerce-ui";

type Locale = "fa" | "en";

function day(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}

function statusTone(status: RepeatDeliveryDto["status"]): "success" | "neutral" | "attention" {
  return status === "ACTIVE" ? "success" : status === "PAUSED" ? "attention" : "neutral";
}

/**
 * Repeat delivery list. A schedule is a reminder plus a one-tap reorder at
 * the live price — PET LIFE never charges automatically, and says so.
 */
export function RepeatDeliveryListView() {
  const t = useTranslations("commerce.repeat");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [items, setItems] = useState<RepeatDeliveryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setItems(await commerceService.listRepeatDeliveries());
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
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("howItWorks")}</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyHint")} icon={<Repeat size={28} />} actionLabel={t("browse")} onAction={() => router.push(`/${locale}/shop/products`)} />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <button key={item.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/repeat-delivery/${item.id}`)}>
              <ContextSurface className="flex gap-3">
                <ProductImage src={item.product.imageUrl} alt={item.product.title} className="h-16 w-16 shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-body font-medium text-text-primary">{item.product.title}</p>
                    <StatusLabel tone={statusTone(item.status)}>{t(`status.${item.status}`)}</StatusLabel>
                  </div>
                  <p className="text-metadata text-text-secondary">{t("summary", { quantity: formatNumber(item.quantity, locale), days: formatNumber(item.intervalDays, locale), seller: item.sellerOrganization.name })}</p>
                  {item.status === "ACTIVE" ? <p className="text-metadata text-text-primary">{t("nextOn", { date: day(item.nextCycleAt, locale) })}</p> : null}
                  {item.priceChanged || !item.available ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.priceChanged ? <StatusLabel tone="attention">{t("priceChanged")}</StatusLabel> : null}
                      {!item.available ? <StatusLabel tone="attention">{t("unavailable")}</StatusLabel> : null}
                    </div>
                  ) : null}
                </div>
              </ContextSurface>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Create a schedule from a product offer (reached from the product page). */
export function RepeatDeliveryCreateView() {
  const t = useTranslations("commerce.repeat");
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale() as Locale;
  const { householdId } = useActivePet();
  const offerId = params.get("offerId");
  const productId = params.get("productId");
  const initialQuantity = Math.min(20, Math.max(1, Number(params.get("quantity")) || 1));

  const [offer, setOffer] = useState<SellerOfferDto | null>(null);
  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [intervalDays, setIntervalDays] = useState<number | null>(null);
  const [addressId, setAddressId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!offerId || !productId) return;
    void (async () => {
      try {
        // Price and eligibility come from the public catalog, i.e. from the server.
        const detail = await commerceService.getProductDetail(productId);
        const found = detail.offers.find((o) => o.id === offerId && o.repeatDeliveryEligible);
        if (!found) {
          setLoadError(true);
          return;
        }
        setOffer(found);
        setProduct(detail);
        setIntervalDays(found.repeatIntervalsDays.includes(30) ? 30 : found.repeatIntervalsDays[0] ?? null);
      } catch {
        setLoadError(true);
      }
    })();
  }, [offerId, productId]);

  useEffect(() => {
    if (!householdId) return;
    void addressesService.list(householdId).then((list) => {
      setAddresses(list);
      setAddressId(list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? "");
    });
  }, [householdId]);

  async function submit() {
    if (!offer || !intervalDays || !addressId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await commerceService.createRepeatDelivery({ sellerOfferId: offer.id, quantity, intervalDays, addressId });
      router.replace(`/${locale}/repeat-delivery/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!offerId || !productId || loadError) return <ErrorRecovery title={t("notAvailableTitle")} message={t("notAvailableHint")} retryLabel={t("browse")} onRetry={() => router.push(`/${locale}/shop/products`)} />;
  if (!offer || !product) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const variant = product.variants.find((v) => v.id === offer.productVariantId);

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("createTitle")}</h1>
      <ContextSurface className="flex gap-3">
        <ProductImage src={product.media[0]?.url ?? null} alt={product.title} className="h-16 w-16 shrink-0 rounded-md" />
        <div className="flex flex-col gap-0.5">
          <p className="text-body font-medium text-text-primary">{product.title}</p>
          {variant?.title ? <p className="text-metadata text-text-secondary">{variant.title}</p> : null}
          <p className="text-metadata text-text-secondary">{t("soldBy", { seller: offer.sellerOrganization.name })}</p>
          <p className="text-body text-text-primary">{t("currentPrice", { price: formatCurrency(offer.effectiveUnitPrice, locale) })}</p>
        </div>
      </ContextSurface>

      <Select label={t("interval")} value={intervalDays ? String(intervalDays) : ""} onChange={(e) => setIntervalDays(Number(e.target.value))} options={offer.repeatIntervalsDays.map((d) => ({ value: String(d), label: t("everyDays", { days: formatNumber(d, locale) }) }))} />
      <Select label={t("quantity")} value={String(quantity)} onChange={(e) => setQuantity(Number(e.target.value))} options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: formatNumber(i + 1, locale) }))} />
      {addresses && addresses.length ? (
        <Select label={t("address")} value={addressId} onChange={(e) => setAddressId(e.target.value)} options={addresses.map((a) => ({ value: a.id, label: `${a.label ?? a.city} — ${a.addressLine}`.slice(0, 80) }))} />
      ) : (
        <p className="text-body text-text-secondary">{t("needAddress")}</p>
      )}

      <ContextSurface className="flex flex-col gap-1">
        <p className="text-body text-text-primary">{t("noAutopayTitle")}</p>
        <p className="text-metadata text-text-secondary">{t("noAutopay")}</p>
      </ContextSurface>

      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <Button isLoading={saving} disabled={!intervalDays || !addressId} onClick={submit}>
        {t("create")}
      </Button>
    </div>
  );
}

export function RepeatDeliveryDetailView({ id }: { id: string }) {
  const t = useTranslations("commerce.repeat");
  const router = useRouter();
  const locale = useLocale() as Locale;
  const { householdId } = useActivePet();
  const [item, setItem] = useState<RepeatDeliveryDto | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDto[]>([]);
  const [error, setError] = useState<"notFound" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setItem(await commerceService.getRepeatDelivery(id));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "notFound" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (householdId) void addressesService.list(householdId).then(setAddresses).catch(() => setAddresses([]));
  }, [householdId]);

  async function run(action: () => Promise<RepeatDeliveryDto | unknown>, success: string, after?: () => void) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await action();
      if (result && typeof result === "object" && "nextCycleAt" in result) setItem(result as RepeatDeliveryDto);
      setNotice(success);
      after?.();
    } catch (err) {
      setActionError(err instanceof ApiError && err.status < 500 ? err.message : t("saveFailed"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error === "notFound") return <ErrorRecovery title={t("notFound")} message="" retryLabel={t("backToList")} onRetry={() => router.push(`/${locale}/repeat-delivery`)} />;
  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!item) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const cancelled = item.status === "CANCELLED";
  const due = item.status === "ACTIVE" && new Date(item.nextCycleAt).getTime() - Date.now() <= 2 * 86_400_000;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <button type="button" className="self-start text-metadata text-text-secondary hover:text-text-primary" onClick={() => router.push(`/${locale}/repeat-delivery`)}>
        {t("backToList")}
      </button>
      <ContextSurface className="flex gap-3">
        <ProductImage src={item.product.imageUrl} alt={item.product.title} className="h-20 w-20 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-section-title text-text-primary">{item.product.title}</h1>
            <StatusLabel tone={statusTone(item.status)}>{t(`status.${item.status}`)}</StatusLabel>
          </div>
          {item.variantTitle ? <p className="text-metadata text-text-secondary">{item.variantTitle}</p> : null}
          <p className="text-metadata text-text-secondary">{t("soldBy", { seller: item.sellerOrganization.name })}</p>
          {item.status === "ACTIVE" ? <p className="text-body text-text-primary">{t("nextOn", { date: day(item.nextCycleAt, locale) })}</p> : null}
        </div>
      </ContextSurface>

      {notice ? (
        <p role="status" className="rounded-md bg-surface-subtle p-3 text-body text-text-primary">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {actionError}
        </p>
      ) : null}

      {!cancelled && item.priceChanged && item.currentUnitPrice !== null ? (
        <ContextSurface className="flex flex-col gap-2 border-state-attention">
          <p className="text-body text-text-primary">{t("priceChangedExplain", { from: formatCurrency(item.acceptedUnitPrice, locale), to: formatCurrency(item.currentUnitPrice, locale) })}</p>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => commerceService.repeatDeliveryAction(id, "accept-price"), t("priceAccepted"))}>
            {t("acceptPrice")}
          </Button>
        </ContextSurface>
      ) : null}
      {!cancelled && !item.available ? <StatusLabel tone="attention">{t("unavailableExplain")}</StatusLabel> : null}

      {item.status === "ACTIVE" ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-body text-text-primary">{due ? t("dueNow") : t("orderEarly")}</p>
          <Button
            disabled={busy || item.priceChanged || !item.available}
            onClick={() => run(() => commerceService.orderRepeatCycle(id), t("addedToCart"), () => router.push(`/${locale}/cart`))}
          >
            {t("orderCycle", { price: formatCurrency((item.currentUnitPrice ?? item.acceptedUnitPrice) * item.quantity, locale) })}
          </Button>
          <p className="text-metadata text-text-secondary">{t("noAutopay")}</p>
        </ContextSurface>
      ) : null}

      {!cancelled ? (
        <ContextSurface className="flex flex-col gap-3">
          <p className="text-section-title text-text-primary">{t("settings")}</p>
          <Select
            label={t("interval")}
            value={String(item.intervalDays)}
            disabled={busy}
            onChange={(e) => run(() => commerceService.updateRepeatDelivery(id, { intervalDays: Number(e.target.value) }), t("saved"))}
            options={item.allowedIntervalsDays.map((d) => ({ value: String(d), label: t("everyDays", { days: formatNumber(d, locale) }) }))}
          />
          <Select
            label={t("quantity")}
            value={String(item.quantity)}
            disabled={busy}
            onChange={(e) => run(() => commerceService.updateRepeatDelivery(id, { quantity: Number(e.target.value) }), t("saved"))}
            options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: formatNumber(i + 1, locale) }))}
          />
          {addresses.length ? (
            <Select
              label={t("address")}
              value={item.addressId ?? ""}
              disabled={busy}
              onChange={(e) => run(() => commerceService.updateRepeatDelivery(id, { addressId: e.target.value }), t("saved"))}
              options={addresses.map((a) => ({ value: a.id, label: `${a.label ?? a.city} — ${a.addressLine}`.slice(0, 80) }))}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            {item.status === "ACTIVE" ? (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => run(() => commerceService.repeatDeliveryAction(id, "skip"), t("skipped"))}>
                  {t("skip")}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run(() => commerceService.repeatDeliveryAction(id, "pause"), t("paused"))}>
                  {t("pause")}
                </Button>
              </>
            ) : null}
            {item.status === "PAUSED" ? (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => commerceService.repeatDeliveryAction(id, "resume"), t("resumed"))}>
                {t("resume")}
              </Button>
            ) : null}
            <Button variant="ghost" disabled={busy} onClick={() => run(() => commerceService.repeatDeliveryAction(id, "cancel"), t("cancelled"))}>
              {t("cancel")}
            </Button>
          </div>
        </ContextSurface>
      ) : null}

      {item.lastOrderId ? (
        <Button variant="ghost" onClick={() => router.push(`/${locale}/orders/${item.lastOrderId}`)}>
          {t("lastOrder")}
        </Button>
      ) : null}

      {item.events.length ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-section-title text-text-primary">{t("history")}</p>
          <ol className="flex flex-col gap-1.5">
            {item.events.map((event, i) => (
              <li key={`${event.createdAt}-${i}`} className="flex items-center justify-between gap-3 text-metadata">
                <span className="text-text-primary">{t(`event.${event.type}` as "event.CREATED")}</span>
                <span className="text-text-secondary">{day(event.createdAt, locale)}</span>
              </li>
            ))}
          </ol>
        </ContextSurface>
      ) : null}
    </div>
  );
}
