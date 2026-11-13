"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminCommerceService, type AdminRepeatDeliveryRow } from "@/services/admin-commerce.service";
import { EmptyRow, Panel, TableWrap, Tag, Td, Th } from "../console-ui";

type Lang = "fa" | "en" | "de" | "es";
type Status = "" | "ACTIVE" | "PAUSED" | "CANCELLED";
const TONE = { ACTIVE: "success", PAUSED: "attention", CANCELLED: "neutral" } as const;

/** /admin/commerce/repeat-deliveries — members' repeat-delivery schedules, read-only for staff. */
export function AdminRepeatDeliveriesView() {
  const t = useTranslations("adminRepeatDeliveries");
  const lang = useLocale() as Lang;
  const [status, setStatus] = useState<Status>("ACTIVE");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminRepeatDeliveryRow[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminCommerceService.listRepeatDeliveries({ status: status || undefined, page }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [status, page]);
  useEffect(() => void load(), [load]);

  if (error === "forbidden") return <EmptyState title={t("forbidden")} />;
  if (error) return <ErrorRecovery title={t("failed")} message="" retryLabel={t("retry")} onRetry={load} />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{t("title")}</h1>
      <p className="text-sm text-text-secondary">{t("hint")}</p>
      <label className="flex w-fit flex-col gap-1 text-sm">
        {t("filter")}
        <select className="rounded-md border border-border-subtle bg-surface-base px-3 py-2" value={status} onChange={(e) => { setStatus(e.target.value as Status); setPage(1); }}>
          <option value="">{t("all")}</option>
          {(["ACTIVE", "PAUSED", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      </label>
      <Panel>
        {!data ? <Skeleton className="h-40" /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{t("col.member")}</Th><Th>{t("col.product")}</Th><Th>{t("col.seller")}</Th><Th>{t("col.every")}</Th><Th>{t("col.next")}</Th><Th>{t("col.status")}</Th><Th>{t("col.lastOrder")}</Th></tr></thead>
              <tbody>{data.items.length === 0 ? <EmptyRow colSpan={7} label={t("empty")} /> : data.items.map((r) => (
                <tr key={r.id}>
                  <Td>{r.member.displayName}{r.city ? <span className="block text-metadata text-text-secondary">{r.city}</span> : null}</Td>
                  <Td>{r.product.title}{r.product.variant ? ` · ${r.product.variant}` : ""} × {localizeDigits(r.quantity, lang)}<span className="block text-metadata text-text-secondary">{formatCurrency(r.unitPrice, lang)}</span></Td>
                  <Td>{r.seller.name}</Td>
                  <Td>{t("days", { count: r.intervalDays })}</Td>
                  <Td>{r.status === "ACTIVE" ? formatDay(r.nextCycleAt.slice(0, 10), lang) : "—"}</Td>
                  <Td><Tag tone={TONE[r.status]}>{t(`status.${r.status}`)}</Tag></Td>
                  <Td>{r.lastOrder ? <Link className="underline" href={`/${lang}/admin/commerce/orders/${r.lastOrder.id}`}>{formatDay(r.lastOrder.createdAt.slice(0, 10), lang)}</Link> : "—"}</Td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</Button>
          <span className="text-sm">{localizeDigits(`${page} / ${pages}`, lang)}</span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</Button>
        </div>
      ) : null}
    </div>
  );
}
