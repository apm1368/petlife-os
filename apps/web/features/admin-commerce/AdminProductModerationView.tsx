"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui/button";
import { Input } from "@petlife/ui/input";
import { Select } from "@petlife/ui/select";
import { ContextSurface } from "@petlife/ui/context-surface";
import { EmptyState } from "@petlife/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@petlife/ui/table";
import { Badge } from "@petlife/ui/badge";
import { apiFetch } from "../../lib/api/client";
import { formatDateTime } from "../../lib/i18n/format";

type ModerationRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  moderationStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  moderationReason?: string | null;
  moderatedAt?: string | null;
  categoryName: string;
  brandName?: string | null;
  variantCount: number;
  sellerNames: string[];
  createdAt: string;
};

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

const STATUSES = ["PENDING_REVIEW", "APPROVED", "REJECTED"] as const;

export function AdminProductModerationView() {
  const locale = useLocale();
  const t = useTranslations("adminCommerce.productModeration");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("PENDING_REVIEW");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ModerationRow> | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: String(page), status });
      if (q.trim()) params.set("q", q.trim());
      const res = await apiFetch<Page<ModerationRow>>(`/admin/commerce/products/moderation?${params.toString()}`);
      setData(res);
    } finally {
      setBusy(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    const res = await apiFetch<any>(`/admin/commerce/products/moderation/${id}`);
    setDetail(res);
    setReason("");
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!detail?.id) return;
    if (decision === "REJECTED" && reason.trim().length < 3) return;
    setActing(true);
    try {
      await apiFetch(`/admin/commerce/products/moderation/${detail.id}/decision`, { method: "POST", body: { decision, reason: reason.trim() } });
      setDetail(null);
      await load();
    } finally {
      setActing(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-body-sm text-muted">{t("subtitle")}</p>
        </div>
      </header>
      <ContextSurface>
        <div className="flex flex-wrap items-end gap-3">
          <Select label={t("status")} value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }} options={STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} />
          <div className="min-w-[220px] flex-1">
            <Input label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} />
          </div>
          <Button onClick={() => { setPage(1); void load(); }} disabled={busy}>{t("filter")}</Button>
        </div>
      </ContextSurface>
      <ContextSurface>
        {items.length === 0 ? <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("product")}</TableHead>
                <TableHead>{t("sellers")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.title}</div>
                    <div className="text-body-sm text-muted">{row.categoryName}{row.brandName ? ` • ${row.brandName}` : ""}</div>
                  </TableCell>
                  <TableCell>{row.sellerNames.slice(0, 2).join("، ") || "—"}</TableCell>
                  <TableCell><Badge>{t(`statuses.${row.moderationStatus}`)}</Badge></TableCell>
                  <TableCell>{formatDateTime(row.createdAt, locale)}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" onClick={() => void open(row.id)}>{t("review")}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ContextSurface>
      {detail ? (
        <ContextSurface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-section-title">{detail.title}</h2>
              <p className="text-body-sm text-muted">{detail.category?.name}{detail.brand?.name ? ` • ${detail.brand.name}` : ""}</p>
            </div>
            <Badge>{t(`statuses.${detail.moderationStatus}`)}</Badge>
          </div>
          {detail.description ? <p className="mt-3 whitespace-pre-wrap text-body">{detail.description}</p> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(detail.variants ?? []).map((v: any) => (
              <div key={v.id} className="rounded-xl border p-3">
                <div className="font-medium">{v.title || v.sku}</div>
                <div className="text-body-sm text-muted">{v.sku}</div>
                {(v.offers ?? []).map((o: any) => (
                  <div key={o.id} className="mt-2 text-body-sm">{o.sellerName} — {o.priceAmount.toLocaleString(locale)} {o.currency}</div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <Input label={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void decide("APPROVED")} isLoading={acting}>{t("approve")}</Button>
              <Button variant="ghost" onClick={() => void decide("REJECTED")} isLoading={acting} disabled={reason.trim().length < 3}>{t("reject")}</Button>
              <Button variant="ghost" onClick={() => setDetail(null)}>{t("close")}</Button>
            </div>
          </div>
        </ContextSurface>
      ) : null}
    </div>
  );
}
