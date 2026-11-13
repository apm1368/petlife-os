"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { AdminRefundApprovalDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminBookingMoneyService } from "@/services/admin-booking-money.service";
import { useAdminStore } from "@/stores/admin-store";
import { EmptyRow, Panel, TableWrap, Tag, Td, Th } from "../console-ui";

const NO_PERMISSIONS: readonly string[] = [];
const STATUSES = ["", "REQUESTED", "APPROVED", "EXECUTED", "REJECTED"] as const;
const FIELD = "rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-body text-text-primary";

/** The finance queue of refund approvals across shop orders, service bookings and stays (two-person control). */
export function AdminRefundApprovalsView() {
  const t = useTranslations("adminRefundApprovals");
  const locale = useLocale() as "fa" | "en" | "de" | "es" | "ar" | "nl";
  const permissions: readonly string[] = useAdminStore((s) => s.context?.permissions) ?? NO_PERMISSIONS;
  const can = (p: string) => permissions.includes(p);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("REQUESTED");
  const [rows, setRows] = useState<AdminRefundApprovalDto[] | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows((await adminBookingMoneyService.approvals({ status: status || undefined })).items);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [status]);
  useEffect(() => void load(), [load]);

  async function act(row: AdminRefundApprovalDto, action: "approve" | "reject" | "execute") {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt(t("rejectReason")) ?? "";
      if (reason.trim().length < 3) return;
    }
    setBusy(row.id);
    setMessage(null);
    try {
      if (action === "approve") await adminBookingMoneyService.approve(row.id);
      if (action === "reject") await adminBookingMoneyService.reject(row.id, reason.trim());
      if (action === "execute") await adminBookingMoneyService.execute(row.id);
      setMessage({ ok: true, text: t(`done.${action}`) });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError && e.status === 409 ? t("selfApproval") : t("failed") });
    } finally {
      setBusy(null);
    }
  }

  const subjectLink = (row: AdminRefundApprovalDto) => {
    if (row.subjectType === "BOOKING" && row.bookingId) return <Link className="underline" href={`/${locale}/admin/services/bookings/${row.bookingId}`}>{t("subject.BOOKING")}</Link>;
    if (row.subjectType === "TRAVEL_BOOKING" && row.travelBookingId) return <Link className="underline" href={`/${locale}/admin/travel/bookings/${row.travelBookingId}`}>{t("subject.TRAVEL_BOOKING")}</Link>;
    return <Link className="underline" href={`/${locale}/admin/transactions?orderId=${row.orderId ?? ""}`}>{t("subject.ORDER")}</Link>;
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{t("title")}</h1>
      <p className="text-sm text-text-secondary">{t("hint")}</p>
      <label className="flex w-fit flex-col gap-1 text-sm">
        {t("filter")}
        <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? t(`status.${s}`) : t("all")}</option>)}
        </select>
      </label>
      {message ? <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-state-success" : "text-state-urgent"}`}>{message.text}</p> : null}
      {error === "forbidden" ? <EmptyState title={t("forbidden")} /> : null}
      {error === "error" ? <ErrorRecovery title={t("failed")} message="" retryLabel="↻" onRetry={() => void load()} /> : null}
      {!rows && !error ? <Skeleton className="h-48 w-full" /> : null}
      {rows ? (
        <Panel>
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{t("columns.subject")}</Th><Th>{t("columns.amount")}</Th><Th>{t("columns.reason")}</Th><Th>{t("columns.requestedBy")}</Th><Th>{t("columns.status")}</Th><Th>{" "}</Th></tr></thead>
              <tbody>
                {rows.length === 0 ? <EmptyRow colSpan={6} label={t("empty")} /> : rows.map((row) => (
                  <tr key={row.id}>
                    <Td>{subjectLink(row)}</Td>
                    <Td>{formatCurrency(row.amount, locale)}</Td>
                    <Td>{row.reason}</Td>
                    <Td>{row.requestedByAdmin.displayName ?? "—"}</Td>
                    <Td><Tag tone={row.status === "EXECUTED" ? "success" : row.status === "REJECTED" ? "urgent" : "attention"}>{t(`status.${row.status}`)}</Tag></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {row.status === "REQUESTED" && can("finance.refund.approve") ? <Button size="sm" isLoading={busy === row.id} onClick={() => void act(row, "approve")}>{t("approve")}</Button> : null}
                        {(row.status === "REQUESTED" || row.status === "APPROVED") && can("finance.refund.approve") ? <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void act(row, "reject")}>{t("reject")}</Button> : null}
                        {(row.status === "APPROVED" || row.status === "REQUESTED") && can("finance.refund.execute") ? <Button size="sm" variant="secondary" disabled={busy === row.id} onClick={() => void act(row, "execute")}>{t("execute")}</Button> : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}
    </div>
  );
}
