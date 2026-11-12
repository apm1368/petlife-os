"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { DisputeEvidenceActorType, DisputeStatus, type DisputeDto, DISPUTE_NEXT } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";
import { DisputeRefundPanel } from "./finance/DisputeRefundPanel";
import { ApiError } from "@/lib/api/client";

const STATUSES = Object.values(DisputeStatus);

function formatDate(iso: string, locale: string) {
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale;
  return new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function AdminDisputeDetailView({ disputeId }: { disputeId: string }) {
  const t = useTranslations("admin.disputes");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<DisputeDto | null>(null);
  const [error, setError] = useState<"access" | "notFound" | "failed" | null>(null);
  const [actionError, setActionError] = useState(false);
  const [assigneeAdminId, setAssigneeAdminId] = useState("");
  const [evidenceStatement, setEvidenceStatement] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");

  async function load() {
    setError(null);
    try {
      setData(await adminService.getDispute(disputeId));
    } catch (cause) {
      setError(cause instanceof ApiError && [401, 403].includes(cause.status) ? "access" : cause instanceof ApiError && cause.status === 404 ? "notFound" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  async function assign() {
    if (!assigneeAdminId.trim()) return;
    setActionError(false);
    try {
      await adminService.assignDispute(disputeId, assigneeAdminId);
      setAssigneeAdminId("");
      await load();
    } catch {
      setActionError(true);
    }
  }

  async function addEvidence() {
    if (!evidenceStatement.trim()) return;
    setActionError(false);
    try {
      await adminService.addDisputeEvidence(disputeId, { statement: evidenceStatement, actorType: DisputeEvidenceActorType.ADMIN });
      setEvidenceStatement("");
      await load();
    } catch {
      setActionError(true);
    }
  }

  async function transition(status: DisputeStatus) {
    setActionError(false);
    try {
      await adminService.transitionDispute(disputeId, status, resolutionSummary || undefined);
      await load();
    } catch {
      setActionError(true);
    }
  }

  if (error === "access") return <ContextSurface><h1 className="text-section-title">{t("states.accessDeniedTitle")}</h1><p>{t("states.accessDenied")}</p></ContextSurface>;
  if (error === "notFound") return <ContextSurface><h1 className="text-section-title">{t("states.notFoundTitle")}</h1><p>{t("states.notFound")}</p></ContextSurface>;
  if (error === "failed") return <ErrorRecovery title={t("title")} message={t("states.detailLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("states.loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/admin/disputes`)}>
        {tCommon("backToList")}
      </Button>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t(`subjectType.${data.subjectType}`)}</h1>
        <StatusLabel tone={adminStatusTone(data.status)}>{t(`status.${data.status}`)}</StatusLabel>
      </div>
      <span className="text-body text-text-primary">{data.claim}</span>
      {data.resolutionSummary ? <span className="text-body text-text-secondary">{t("detail.resolution")}: {data.resolutionSummary}</span> : null}
      <p className="text-metadata text-text-secondary">{t("detail.financialNote")}</p>
      {actionError ? <p role="alert" className="text-error">{t("states.actionFailed")}</p> : null}

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={tCommon("assigneeLabel")} value={assigneeAdminId} onChange={(e) => setAssigneeAdminId(e.target.value)} className="min-w-48 flex-1" />
        <Button disabled={!assigneeAdminId.trim()} onClick={assign}>{tCommon("assign")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.evidence")}</span>
        {data.evidence.length === 0 ? <p className="text-metadata text-text-secondary">{t("states.noEvidence")}</p> : null}
        {data.evidence.map((e) => (
          <div key={e.id} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{e.statement}</span>
            <span className="text-metadata text-text-secondary">{e.actor?.displayName ?? t(`detail.actorType.${e.actorType}`)} · {formatDate(e.createdAt, locale)}</span>
          </div>
        ))}
        <Input label={t("detail.evidencePlaceholder")} value={evidenceStatement} onChange={(e) => setEvidenceStatement(e.target.value)} />
        <Button disabled={!evidenceStatement.trim()} onClick={addEvidence}>{t("detail.addEvidence")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.changeStatus")}</span>
        <Input label={t("detail.resolution")} value={resolutionSummary} onChange={(e) => setResolutionSummary(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Button key={s} size="sm" aria-pressed={s === data.status} variant={s === data.status ? "primary" : "secondary"} onClick={() => transition(s)} disabled={s === data.status || !(DISPUTE_NEXT[data.status as DisputeStatus] ?? []).includes(s)}>
              {t(`status.${s}`)}
            </Button>
          ))}
        </div>
      </ContextSurface>
      <DisputeRefundPanel disputeId={disputeId} subjectType={data.subjectType} status={data.status} />
    </div>
  );
}
