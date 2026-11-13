"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { AdminProductDetailDto, AdminProductOfferDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { intlLocale } from "@/features/admin/admin-copy";
import { DemoRecordTag } from "../DemoRecordTag";
import { Panel, PanelTitle, TableWrap, Tag, Td, Th, type Tone } from "../console-ui";

type Locale = "fa" | "en" | "de" | "es" | "ar" | "nl";

const OFFER_TONE: Record<string, Tone> = { ACTIVE: "success", PAUSED: "attention", OUT_OF_STOCK: "attention", SUSPENDED: "concern" };
const MODERATION_TONE: Record<string, Tone> = { APPROVED: "success", PENDING_REVIEW: "attention", REJECTED: "concern" };

/**
 * One catalog product for staff: identity, variants, and every seller's offer
 * with price, stock and whether a customer can buy it right now. Changes stay
 * on the existing screens (product status on the list, offer moderation,
 * inventory); this page is where staff see the whole picture first.
 */
export function AdminProductDetailView({ productId }: { productId: string }) {
  const t = useTranslations("admin.productDetail");
  const locale = useLocale() as Locale;
  const [data, setData] = useState<AdminProductDetailDto | null>(null);
  const [error, setError] = useState<"forbidden" | "notFound" | "load" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminCommerceService.getProduct(productId));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : e instanceof ApiError && e.status === 404 ? "notFound" : "load");
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (amount: number) => formatCurrency(amount, locale);
  const num = (value: number) => value.toLocaleString(intlLocale(locale));
  const when = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  if (error === "forbidden") return <EmptyState title={t("forbidden")} description="commerce.view" />;
  if (error === "notFound") return <EmptyState title={t("notFound")} />;
  if (error === "load") return <ErrorRecovery title={t("title")} message={t("loadFailed")} retryLabel={t("retry")} onRetry={() => void load()} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const sellers = new Set(data.offers.map((o) => o.seller.id)).size;
  const buyable = data.offers.filter((o) => o.buyable).length;

  return (
    <div className="flex flex-col gap-4">
      <Link className="text-metadata text-brand-natural underline" href={`/${locale}/admin/commerce/products`}>
        {t("back")}
      </Link>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-page-title text-text-primary">{data.title}</h1>
          <Tag tone={data.status === "ACTIVE" ? "success" : "attention"}>{t(`productStatus.${data.status}`)}</Tag>
          <DemoRecordTag isDemoRecord={data.isDemoRecord} />
        </div>
        <p className="text-metadata text-text-secondary">
          {data.category.name}
          {data.brand ? ` · ${data.brand.name}` : ""} · {t("media", { count: data.mediaCount })} ·{" "}
          <Link className="underline" href={`/${locale}/shop/products/${data.id}`}>
            {t("publicPage")}
          </Link>
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-4">
        <Fact label={t("facts.sellers")} value={num(sellers)} />
        <Fact label={t("facts.buyable")} value={`${num(buyable)} / ${num(data.offers.length)}`} />
        <Fact label={t("facts.lowestPrice")} value={data.lowestBuyablePrice === null ? t("facts.noneBuyable") : money(data.lowestBuyablePrice)} />
        <Fact label={t("facts.rating")} value={data.rating.average === null ? "—" : `${data.rating.average} (${num(data.rating.count)})`} />
      </dl>

      <Panel>
        <PanelTitle title={t("offers.title")} hint={t("offers.hint")} />
        {data.offers.length === 0 ? (
          <EmptyState title={t("offers.empty")} />
        ) : (
          <TableWrap>
            <table className="w-full">
            <thead>
              <tr>
                <Th>{t("offers.seller")}</Th>
                <Th>{t("offers.variant")}</Th>
                <Th>{t("offers.price")}</Th>
                <Th>{t("offers.stock")}</Th>
                <Th>{t("offers.status")}</Th>
                <Th>{t("offers.updated")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.offers.map((o) => (
                <OfferRow key={o.id} offer={o} money={money} num={num} when={when} />
              ))}
            </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      <Panel>
        <PanelTitle title={t("variants.title")} />
        <ul className="flex flex-col gap-1 text-sm">
          {data.variants.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-metadata">{v.sku}</span>
              <span>{v.title ?? "—"}</span>
              {v.isActive ? null : <Tag tone="neutral">{t("variants.inactive")}</Tag>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelTitle title={t("requests.title")} hint={t("requests.hint")} />
        {data.catalogRequests.length === 0 ? (
          <p className="text-metadata text-text-secondary">{t("requests.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.catalogRequests.map((r) => (
              <li key={r.id} className="rounded-md border border-border-subtle p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={r.status === "REJECTED" ? "concern" : r.status === "PENDING_REVIEW" ? "attention" : "success"}>{t(`requests.status.${r.status}`)}</Tag>
                  <strong>{r.requestedTitle}</strong>
                  <span className="text-metadata text-text-secondary">{r.sellerName}</span>
                  {r.reviewedAt ? <span className="text-metadata text-text-secondary">· {when(r.reviewedAt)}</span> : null}
                </div>
                {r.decisionReason ? <p className="mt-1 text-metadata text-text-secondary">{r.decisionReason}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle p-3">
      <dt className="text-metadata text-text-secondary">{label}</dt>
      <dd className="text-section-title text-text-primary">{value}</dd>
    </div>
  );
}

function OfferRow({ offer: o, money, num, when }: { offer: AdminProductOfferDto; money: (amount: number) => string; num: (value: number) => string; when: (iso: string) => string }) {
  const t = useTranslations("admin.productDetail");
  const sellerLive = o.seller.verificationStatus === "VERIFIED" && o.seller.status === "ACTIVE";
  return (
    <tr>
      <Td>
        <span className="block">{o.seller.name}</span>
        {sellerLive ? null : (
          <span className="block text-metadata text-state-urgent">{t("offers.sellerNotLive", { status: t(`sellerStatus.${o.seller.status}`), verification: t(`sellerVerification.${o.seller.verificationStatus}`) })}</span>
        )}
      </Td>
      <Td>
        <span className="font-mono text-metadata">{o.variantSku}</span>
        {o.sellerSku ? <span className="block text-metadata text-text-secondary">{t("offers.sellerSku", { sku: o.sellerSku })}</span> : null}
      </Td>
      <Td>
        {money(o.priceAmount)}
        {o.compareAtAmount ? <span className="block text-metadata text-text-secondary line-through">{money(o.compareAtAmount)}</span> : null}
      </Td>
      <Td>
        {o.stock ? (
          <>
            <span className={o.stock.available > 0 ? "" : "text-state-urgent"}>{t("offers.available", { count: num(o.stock.available) })}</span>
            <span className="block text-metadata text-text-secondary">{t("offers.onHandReserved", { onHand: num(o.stock.onHand), reserved: num(o.stock.reserved) })}</span>
          </>
        ) : (
          <span className="text-text-secondary">{t("offers.noInventory")}</span>
        )}
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          <Tag tone={OFFER_TONE[o.status] ?? "neutral"}>{t(`offerStatus.${o.status}`)}</Tag>
          <Tag tone={MODERATION_TONE[o.moderationStatus] ?? "neutral"}>{t(`moderation.${o.moderationStatus}`)}</Tag>
          {o.buyable ? <Tag tone="brand">{t("offers.buyable")}</Tag> : null}
        </div>
        {o.moderationReason ? <span className="mt-1 block text-metadata text-text-secondary">{o.moderationReason}</span> : null}
      </Td>
      <Td className="text-metadata text-text-secondary">{when(o.updatedAt)}</Td>
    </tr>
  );
}
