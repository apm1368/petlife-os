"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceProductDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { verificationStatusTone } from "./insurance-status";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatCount } from "@/lib/number/format-number";

/** Public discovery — no guard, works for anonymous visitors (spec: "public browsing" for insurance discovery must work without auth). `petId` in the query string is passed through to product detail so a household browsing for a specific pet can check eligibility there. */
export function InsuranceListView() {
  const t = useTranslations("insurance");
  const locale = useLocale() as "fa" | "en";
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const petId = searchParams.get("petId") ?? undefined;

  const [products, setProducts] = useState<InsuranceProductDto[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string[]>([]);

  async function load() {
    setError(null);
    try {
      const result = await insuranceService.listProducts({ pageSize: 50 });
      setProducts(result.items);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    void load();
     
  }, []);

  function toggleSelected(productId: string): void {
    setSelected((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : prev.length < 4 ? [...prev, productId] : prev));
  }

  function productHref(productId: string): string {
    return petId ? `/${locale}/insurance/${productId}?petId=${petId}` : `/${locale}/insurance/${productId}`;
  }

  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!products) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-6">
      <header className="section-head">
        <div>
          <h1>{t("list.title")}</h1>
          <p>{t("list.subtitle")}</p>
        </div>
        {selected.length > 1 ? (
          <Button variant="primary" onClick={() => router.push(`/${locale}/insurance/compare?ids=${selected.join(",")}`)}>
            {t("list.compareSelected")} ({formatCount(selected.length, locale)})
          </Button>
        ) : null}
      </header>

      {products.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <ul className="flex flex-col">
          {products.map((product) => (
            <li key={product.id} className="plan-row">
              <div className="plan-row__main">
                <Link href={productHref(product.id)} className="plan-row__title">
                  {product.providerName} — {product.name}
                </Link>
                <p className="text-metadata text-text-secondary">{product.coverageSummary}</p>
                {product.exclusions.length > 0 ? (
                  <p className="text-metadata text-text-secondary">
                    <span className="font-semibold text-text-primary">{t("detail.exclusionsTitle")}:</span> {product.exclusions.slice(0, 2).join(locale === "fa" ? "، " : ", ")}
                    {product.exclusions.length > 2 ? "…" : ""}
                  </p>
                ) : null}
              </div>
              <div className="plan-row__side">
                <StatusLabel tone={verificationStatusTone(product.status)}>{t(`verificationStatus.${product.status}`)}</StatusLabel>
                <label className="flex min-h-11 items-center gap-1.5 text-metadata text-text-secondary">
                  <input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggleSelected(product.id)} />
                  {t("compare.title")}
                </label>
                <Link href={productHref(product.id)} className="btn-quiet">
                  {t("list.viewDetails")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
