"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { AppealStatus, TrustActionType, TrustCaseStatus, type TrustActionDto, type TrustCaseDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES = Object.values(TrustCaseStatus);

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function ActionAppeal({ action, onChanged }: { action: TrustActionDto; onChanged: () => void }) {
  const t = useTranslations("admin.trust");
  const [appellantUserId, setAppellantUserId] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [resolution, setResolution] = useState("");

  if (!action.appeal) {
    return (
      <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-2">
        <Input label={t("detail.appellantUserId")} value={appellantUserId} onChange={(e) => setAppellantUserId(e.target.value)} className="min-w-40 flex-1" />
        <Input label={t("detail.appealReason")} value={appealReason} onChange={(e) => setAppealReason(e.target.value)} className="min-w-40 flex-1" />
        <Button
          size="sm"
          onClick={async () => {
            if (!appellantUserId.trim() || !appealReason.trim()) return;
            await adminService.submitAppeal(action.id, { appellantUserId, reason: appealReason });
            onChanged();
          }}
        >
          {t("detail.submitAppeal")}
        </Button>
      </div>
    );
  }

  const appeal = action.appeal;
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
      <div className="flex items-center gap-2">
        <StatusLabel tone={adminStatusTone(appeal.status)}>{t(`appealStatus.${appeal.status}`)}</StatusLabel>
        <span className="text-metadata text-text-secondary">{appeal.reason}</span>
      </div>
      {appeal.status === AppealStatus.SUBMITTED || appeal.status === AppealStatus.UNDER_REVIEW ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t("detail.resolution")} value={resolution} onChange={(e) => setResolution(e.target.value)} className="min-w-40 flex-1" />
          {([AppealStatus.UPHELD, AppealStatus.OVERTURNED, AppealStatus.PARTIALLY_OVERTURNED] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (!resolution.trim()) return;
                await adminService.resolveAppeal(appeal.id, { status: s, resolution });
                onChanged();
              }}
            >
              {t(`appealStatus.${s}`)}
            </Button>
          ))}
        </div>
      ) : (
        <span className="text-body text-text-primary">{appeal.resolution}</span>
      )}
    </div>
  );
}

export function AdminTrustCaseDetailView({ trustCaseId }: { trustCaseId: string }) {
  const t = useTranslations("admin.trust");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<TrustCaseDto | null>(null);
  const [error, setError] = useState(false);
  const [assigneeAdminId, setAssigneeAdminId] = useState("");
  const [actionType, setActionType] = useState<TrustActionType>(TrustActionType.WARNING);
  const [actionReason, setActionReason] = useState("");

  async function load() {
    setError(false);
    try {
      setData(await adminService.getTrustCase(trustCaseId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustCaseId]);

  async function assign() {
    if (!assigneeAdminId.trim()) return;
    await adminService.assignTrustCase(trustCaseId, assigneeAdminId);
    setAssigneeAdminId("");
    await load();
  }

  async function transition(status: TrustCaseStatus) {
    await adminService.transitionTrustCase(trustCaseId, status);
    await load();
  }

  async function takeAction() {
    if (!actionReason.trim()) return;
    await adminService.takeTrustAction(trustCaseId, { actionType, reason: actionReason });
    setActionReason("");
    await load();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/admin/trust`)}>
        {tCommon("backToList")}
      </Button>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t(`subjectType.${data.subjectType}`)}</h1>
        <StatusLabel tone={adminStatusTone(data.status)}>{t(`status.${data.status}`)}</StatusLabel>
      </div>
      <span className="text-body text-text-primary">{data.reason}</span>

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={tCommon("assigneeLabel")} value={assigneeAdminId} onChange={(e) => setAssigneeAdminId(e.target.value)} className="min-w-48 flex-1" />
        <Button onClick={assign}>{tCommon("assign")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={s === data.status ? "primary" : "secondary"} onClick={() => transition(s)} disabled={s === data.status}>
            {t(`status.${s}`)}
          </Button>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.actions")}</span>
        {data.actions.map((a) => (
          <div key={a.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <StatusLabel tone={adminStatusTone(a.actionType)}>{t(`actionType.${a.actionType}`)}</StatusLabel>
              <span className="text-metadata text-text-secondary">{a.performedByAdmin.displayName} · {formatDate(a.createdAt, locale)}</span>
            </div>
            <span className="text-body text-text-primary">{a.reason}</span>
            <ActionAppeal action={a} onChanged={load} />
          </div>
        ))}
        <Select label={t("detail.takeAction")} value={actionType} onChange={(e) => setActionType(e.target.value as TrustActionType)} options={Object.values(TrustActionType).map((v) => ({ value: v, label: t(`actionType.${v}`) }))} />
        <Input label={t("detail.actionReason")} value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
        <Button onClick={takeAction}>{t("detail.takeAction")}</Button>
      </ContextSurface>
    </div>
  );
}
