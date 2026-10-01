"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { AdminCustomerListItemDto, PaginatedDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";

export function AdminCustomersView() {
  const t = useTranslations("admin.customers");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PaginatedDto<AdminCustomerListItemDto> | null>(null);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(query: string, page = 1) {
    setError(false);
    setResults(null);
    try {
      const result = await adminService.listCustomers(query.trim(), { page, pageSize: 30 });
      setResults(result);
      setSearched(true);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <Input
        label={t("title")}
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void search(q);
        }}
      />
      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={() => search(q)} /> : null}
      {!error && searched && !results ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && results && results.items.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {results?.items.map((c) => (
        <button key={c.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/customers/${c.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{c.displayName}</span>
              <span className="text-metadata text-text-secondary">
                {c.emailMasked ?? ""} {c.phoneMasked ?? ""}
              </span>
            </div>
            <span className="text-metadata text-text-secondary">{t("view")}</span>
          </ContextSurface>
        </button>
      ))}
      {results && results.total > results.pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <span className="text-metadata text-text-secondary">{t("page", { page: results.page })}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={results.page <= 1} onClick={() => void search(q, results.page - 1)}>{t("previous")}</Button>
            <Button size="sm" variant="secondary" disabled={results.page * results.pageSize >= results.total} onClick={() => void search(q, results.page + 1)}>{t("next")}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
