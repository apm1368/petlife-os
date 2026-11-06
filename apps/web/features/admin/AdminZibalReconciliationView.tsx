"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminService, type ZibalDuplicateFinding } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";

export function AdminZibalReconciliationView() {
  const t = useTranslations("admin.zibalReconciliation");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale() as "fa" | "en";
  const adminUserId = useAdminStore((state) => state.context?.adminUserId ?? null);
  const [findings, setFindings] = useState<ZibalDuplicateFinding[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statementJson, setStatementJson] = useState("");
  const [reason, setReason] = useState("");
  const [errorText, setErrorText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setFindings((await adminService.listZibalDuplicateFindings()).items);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function importStatement() {
    setErrorText("");
    try {
      const rows: unknown = JSON.parse(statementJson);
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("invalid");
      await adminService.importZibalSettlementStatement(rows as { merchantReference: string; refNumber: string; amount: number; paidAt: string }[]);
      setStatementJson("");
      await load();
    } catch {
      setErrorText(t("importFailed"));
    }
  }

  async function mutate(id: string, action: "request" | "approve" | "execute") {
    setBusyId(id);
    setErrorText("");
    try {
      if (action === "request") await adminService.requestZibalDuplicateRefund(id, reason);
      if (action === "approve") await adminService.approveRefund(findings?.find((f) => f.id === id)?.zibalRefundApproval?.id ?? "");
      if (action === "execute") await adminService.executeRefund(findings?.find((f) => f.id === id)?.zibalRefundApproval?.id ?? "");
      setReason("");
      await load();
    } catch {
      setErrorText(action === "approve" ? t("secondAdminOnly") : t("actionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="flex flex-col gap-3"><Skeleton className="h-14" /><Skeleton className="h-40" /></div>;
  if (failed) return <ErrorRecovery title={t("title")} message={t("loadFailed")} retryLabel={tCommon("retry")} onRetry={() => void load()} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("importTitle")}</h2>
        <p className="text-metadata text-text-secondary">{t("importHelp")}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-metadata text-text-secondary">{t("statementRows")}</span>
          <textarea dir="ltr" value={statementJson} onChange={(event) => setStatementJson(event.target.value)} className="min-h-32 rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-body text-text-primary" />
        </label>
        <div><Button disabled={!statementJson.trim()} onClick={() => void importStatement()}>{t("importAction")}</Button></div>
      </ContextSurface>

      {errorText ? <p role="alert" className="text-sm text-text-primary">{errorText}</p> : null}
      {findings?.length ? findings.map((finding) => {
        const evidence = finding.detail.statementCaptures ?? [];
        const approval = finding.zibalRefundApproval;
        return (
          <ContextSurface key={finding.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-section-title text-text-primary">{t("anomaly")}</span>
              <StatusLabel tone="urgent">{finding.outcome}</StatusLabel>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-metadata text-text-secondary">{t("merchantReference")}: <bdi>{finding.detail.merchantReference ?? finding.entityId}</bdi></p>
              <p className="text-metadata text-text-secondary">{t("paymentIntent")}: <bdi>{finding.detail.paymentIntentId ?? "—"}</bdi></p>
              <p className="text-metadata text-text-secondary">{t("order")}: <bdi>{finding.detail.orderId ?? t("orderUnavailable")}</bdi></p>
              <p className="text-metadata text-text-secondary">{t("amount")}: {formatCurrency(finding.detail.surplusAmount ?? finding.detail.amount ?? 0, locale)}</p>
            </div>
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              {evidence.map((capture) => <div key={capture.refNumber} className="flex flex-wrap items-center justify-between gap-2 text-metadata">
                <bdi>{capture.refNumber}</bdi><span>{formatCurrency(capture.amount, locale)}</span><time dateTime={capture.paidAt}>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(capture.paidAt))}</time>
              </div>)}
            </div>
            {!approval ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3">
                <Input label={t("reason")} value={reason} onChange={(event) => setReason(event.target.value)} className="min-w-56 flex-1" />
                <Button disabled={!reason.trim() || busyId === finding.id || !finding.detail.orderId} onClick={() => void mutate(finding.id, "request")}>{t("requestRefund")}</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                <StatusLabel tone={approval.status === "EXECUTED" ? "success" : "attention"}>{t(`approval.${approval.status}`)}</StatusLabel>
                <span className="text-metadata text-text-secondary">{formatCurrency(approval.amount, locale)} · {approval.reason}</span>
                {approval.status === "REQUESTED" && approval.requestedByAdminId !== adminUserId ? <Button size="sm" variant="secondary" disabled={busyId === finding.id} onClick={() => void mutate(finding.id, "approve")}>{t("approve")}</Button> : null}
                {approval.status === "REQUESTED" && approval.requestedByAdminId === adminUserId ? <span className="text-metadata text-text-secondary">{t("secondAdminOnly")}</span> : null}
                {approval.status === "APPROVED" ? <Button size="sm" disabled={busyId === finding.id} onClick={() => void mutate(finding.id, "execute")}>{t("executeRefund")}</Button> : null}
              </div>
            )}
          </ContextSurface>
        );
      }) : <EmptyState title={t("empty")} />}
    </div>
  );
}
