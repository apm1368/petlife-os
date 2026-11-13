"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import type { AdminProductReadinessDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { intlLocale } from "@/features/admin/admin-copy";
import { DemoRecordTag } from "../DemoRecordTag";
import { Panel, PanelTitle, Tag, type Tone } from "../console-ui";

const ISSUES = ["MEDIA_INCOMPLETE", "MISSING_BRAND", "MISSING_SPECS", "UNREVIEWED_SOURCE", "NO_LIVE_OFFER"] as const;
type Issue = (typeof ISSUES)[number];
const STATUS_TONE: Record<string, Tone> = { ACTIVE: "success", DRAFT: "attention", INACTIVE: "neutral" };

/**
 * Shop readiness: every product that is not ready to sell, with every reason. The checks are the server's (the
 * publish rule is the same function the activation guard uses); this page only reports them and links to the product.
 */
export function AdminProductReadinessView() {
  const t = useTranslations("admin.productReadiness");
  const locale = useLocale();
  const [issue, setIssue] = useState<Issue | "">("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminProductReadinessDto | null>(null);
  const [error, setError] = useState<"forbidden" | "load" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.productReadiness({ issue: issue || undefined, status: status || undefined, q: q || undefined, page }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "load");
    }
  }, [issue, status, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const num = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="text-metadata text-text-secondary">{t("intro")}</p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("issuesLabel")}>
        {(["", ...ISSUES] as const).map((k) => (
          <Button
            key={k || "ANY"}
            size="sm"
            role="tab"
            aria-selected={issue === k}
            variant={issue === k ? "primary" : "ghost"}
            onClick={() => {
              setIssue(k);
              setPage(1);
            }}
          >
            {t(`issue.${k || "ANY"}`)}
            {data ? ` (${num(data.counts[k || "ANY"])})` : ""}
          </Button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
          setPage(1);
        }}
      >
        <div className="min-w-48 flex-1">
          <Input label={t("search")} value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <Select
          label={t("statusFilter")}
          value={status}
          placeholder={t("allStatuses")}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={["ACTIVE", "DRAFT", "INACTIVE"].map((s) => ({ value: s, label: t(`status.${s}`) }))}
        />
        <Button type="submit">{t("searchButton")}</Button>
      </form>

      <Panel>
        <PanelTitle title={t("listTitle")} hint={t("rule")} />
        {error === "forbidden" ? <EmptyState title={t("forbidden")} description="commerce.view" /> : null}
        {error === "load" ? <ErrorRecovery title={t("loadFailed")} message={t("loadFailedHint")} retryLabel={t("retry")} onRetry={() => void load()} /> : null}
        {!data && !error ? <Skeleton className="h-48 w-full" aria-label={t("loading")} /> : null}
        {data && data.items.length === 0 ? <EmptyState title={t(issue ? "emptyIssue" : "empty")} /> : null}
        <ul className="flex flex-col gap-3">
          {data?.items.map((p) => (
            <li key={p.id} className="rounded-md border border-border-subtle p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link className="text-body font-medium text-text-primary underline" href={`/${locale}/admin/commerce/products/${p.id}`}>
                    {p.title}
                  </Link>
                  <DemoRecordTag isDemoRecord={p.isDemoRecord} />
                  <span className="block text-metadata text-text-secondary">
                    {p.categoryName}
                    {p.brandName ? ` · ${p.brandName}` : ""}
                  </span>
                </div>
                <Tag tone={STATUS_TONE[p.status] ?? "neutral"}>{t(`status.${p.status}`)}</Tag>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.issues.map((i) => (
                  <Tag key={i} tone={i === "MEDIA_INCOMPLETE" || (i === "NO_LIVE_OFFER" && p.status === "ACTIVE") ? "urgent" : "attention"}>
                    {t(`issue.${i}`)}
                  </Tag>
                ))}
              </div>
              <p className="mt-2 text-metadata text-text-secondary">
                {t("media", { count: num(p.mediaCount), withoutAlt: num(p.mediaWithoutAlt) })} · {t(p.meetsPublishRule ? "publishOk" : "publishBlocked")} ·{" "}
                {t("offers", { live: num(p.liveOffers), total: num(p.offers) })}
              </p>
            </li>
          ))}
        </ul>
        {data && data.total > data.pageSize ? (
          <nav className="mt-3 flex items-center gap-3" aria-label={t("pages")}>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
              {t("previous")}
            </Button>
            <span className="text-metadata">{t("page", { page: num(page), pages: num(Math.ceil(data.total / data.pageSize)) })}</span>
            <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage((v) => v + 1)}>
              {t("next")}
            </Button>
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}
