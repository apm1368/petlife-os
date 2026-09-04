"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceProductDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { ApiError } from "@/lib/api/client";
import { verificationStatusTone } from "./insurance-status";

/** Public discovery — no guard, works for anonymous visitors (spec: "public browsing" for insurance discovery must work without auth). `petId` in the query string is passed through to product detail so a household browsing for a specific pet can check eligibility there. */
export function InsuranceListView() {
  const t = useTranslations("insurance");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const petId = searchParams.get("petId") ?? undefined;

  const [products, setProducts] = useState<InsuranceProductDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  async function load() {
    setError(null);
    try {
      const result = await insuranceService.listProducts({ pageSize: 50 });
      setProducts(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelected(productId: string): void {
    setSelected((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : prev.length < 4 ? [...prev, productId] : prev));
  }

  function productHref(productId: string): string {
    return petId ? `/insurance/${productId}?petId=${petId}` : `/insurance/${productId}`;
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!products) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("list.title")}</h1>
        <p className="text-body text-text-secondary">{t("list.subtitle")}</p>
      </div>

      {selected.length > 1 ? (
        <Button variant="primary" onClick={() => router.push(`/insurance/compare?ids=${selected.join(",")}`)}>
          {t("list.compareSelected")} ({selected.length})
        </Button>
      ) : null}

      {products.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <ContextSurface key={product.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-body text-text-primary">
                  {product.providerName} — {product.name}
                </span>
                <StatusLabel tone={verificationStatusTone(product.status)}>{t(`verificationStatus.${product.status}`)}</StatusLabel>
              </div>
              <p className="text-metadata text-text-secondary">{product.coverageSummary}</p>
              {product.exclusions.length > 0 ? <p className="text-metadata text-state-urgent">{t("detail.exclusionsTitle")}: {product.exclusions.slice(0, 2).join(", ")}{product.exclusions.length > 2 ? "…" : ""}</p> : null}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
                  <input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggleSelected(product.id)} />
                  {t("compare.title")}
                </label>
                <Link href={productHref(product.id)}>
                  <Button variant="secondary" size="sm">
                    {t("list.viewDetails")}
                  </Button>
                </Link>
              </div>
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
