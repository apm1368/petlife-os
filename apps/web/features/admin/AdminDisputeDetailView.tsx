"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { DisputeEvidenceActorType, DisputeStatus, type DisputeDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES = Object.values(DisputeStatus);

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function AdminDisputeDetailView({ disputeId }: { disputeId: string }) {
  const t = useTranslations("admin.disputes");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<DisputeDto | null>(null);
  const [error, setError] = useState(false);
  const [assigneeAdminId, setAssigneeAdminId] = useState("");
  const [evidenceStatement, setEvidenceStatement] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");

  async function load() {
    setError(false);
    try {
      setData(await adminService.getDispute(disputeId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  async function assign() {
    if (!assigneeAdminId.trim()) return;
    await adminService.assignDispute(disputeId, assigneeAdminId);
    setAssigneeAdminId("");
    await load();
  }

  async function addEvidence() {
    if (!evidenceStatement.trim()) return;
    await adminService.addDisputeEvidence(disputeId, { statement: evidenceStatement, actorType: DisputeEvidenceActorType.ADMIN });
    setEvidenceStatement("");
    await load();
  }

  async function transition(status: DisputeStatus) {
    await adminService.transitionDispute(disputeId, status, resolutionSummary || undefined);
    await load();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

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

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={tCommon("assigneeLabel")} value={assigneeAdminId} onChange={(e) => setAssigneeAdminId(e.target.value)} className="min-w-48 flex-1" />
        <Button onClick={assign}>{tCommon("assign")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.evidence")}</span>
        {data.evidence.map((e) => (
          <div key={e.id} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{e.statement}</span>
            <span className="text-metadata text-text-secondary">{e.actor?.displayName ?? e.actorType} · {formatDate(e.createdAt, locale)}</span>
          </div>
        ))}
        <Input label={t("detail.evidencePlaceholder")} value={evidenceStatement} onChange={(e) => setEvidenceStatement(e.target.value)} />
        <Button onClick={addEvidence}>{t("detail.addEvidence")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.changeStatus")}</span>
        <Input label={t("detail.resolution")} value={resolutionSummary} onChange={(e) => setResolutionSummary(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Button key={s} size="sm" variant={s === data.status ? "primary" : "secondary"} onClick={() => transition(s)} disabled={s === data.status}>
              {t(`status.${s}`)}
            </Button>
          ))}
        </div>
      </ContextSurface>
    </div>
  );
}
