"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { AppealStatus, TrustActionType, TrustCaseStatus, type TrustActionDto, type TrustCaseDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminAnimalSupportService, type TrustCaseContext } from "@/services/admin-animal-support.service";
import { ApiError } from "@/lib/api/client";
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
  const [context, setContext] = useState<TrustCaseContext | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      const [caseData, ctx] = await Promise.all([adminService.getTrustCase(trustCaseId), adminAnimalSupportService.trustCaseContext(trustCaseId).catch(() => null)]);
      setData(caseData);
      setContext(ctx);
      if (ctx && !ctx.availableActions.includes(actionType)) setActionType(ctx.availableActions[0] as TrustActionType);
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
    setActionError(null);
    try {
      await adminService.takeTrustAction(trustCaseId, { actionType, reason: actionReason });
      setActionReason("");
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.code === "TRUST_ACTION_NOT_APPLICABLE"
          ? locale === "fa"
            ? "این اقدام در وضعیت فعلی مورد قابل اجرا نیست (مثلاً قبلاً انجام شده یا چیزی برای بازگرداندن نیست)."
            : "This action can't be applied in the item's current state (already done, or nothing to restore)."
          : err instanceof ApiError && err.status === 403
            ? locale === "fa" ? "نقش شما اجازهٔ این اقدام را ندارد." : "Your role can't take this action."
            : locale === "fa" ? "اقدام ثبت نشد." : "The action wasn't recorded.",
      );
    }
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

      {context ? <CaseContextPanel context={context} locale={locale} /> : null}

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
            {a.effectSummary ? (
              <span className="text-metadata text-text-secondary" dir="ltr">
                {JSON.stringify(a.effectSummary.before)} → {JSON.stringify(a.effectSummary.after)}
                {a.effectSummary.restoredByActionId ? (locale === "fa" ? " · بازگردانده شد" : " · restored") : ""}
              </span>
            ) : null}
            <ActionAppeal action={a} onChanged={load} />
          </div>
        ))}
        <Select label={t("detail.takeAction")} value={actionType} onChange={(e) => setActionType(e.target.value as TrustActionType)} options={(context ? (context.availableActions as TrustActionType[]) : Object.values(TrustActionType)).map((v) => ({ value: v, label: t(`actionType.${v}`) }))} />
        <Input label={t("detail.actionReason")} value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
        {actionError ? <p role="alert" className="text-body text-state-urgent">{actionError}</p> : null}
        <Button onClick={takeAction}>{t("detail.takeAction")}</Button>
      </ContextSurface>
    </div>
  );
}

const SUBJECT_KIND: Record<string, [string, string]> = {
  POST: ["پست انجمن", "Community post"],
  COMMENT: ["نظر انجمن", "Community comment"],
  SUPPORT_NEED: ["درخواست کمک", "Support request"],
  LOST_PET_INCIDENT: ["گزارش گم‌شدن", "Lost-pet report"],
  LOST_PET_SIGHTING: ["گزارش مشاهده", "Sighting"],
  ORGANIZATION: ["سازمان", "Organization"],
};

/** Batch 6 — what the case is about: the subject (no contact details or exact location), every report on it, without reporter identity. */
function CaseContextPanel({ context, locale }: { context: TrustCaseContext; locale: string }) {
  const fa = locale === "fa";
  const subject = context.subject as { kind?: string; title?: string | null; text?: string | null; status?: string; owner?: string | null; link?: string; organization?: { name?: string } | null } | null;
  return (
    <ContextSurface className="flex flex-col gap-3">
      <span className="text-section-title text-text-primary">{fa ? "موضوع پرونده" : "Case subject"}</span>
      {subject ? (
        <div className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{subject.kind && SUBJECT_KIND[subject.kind] ? (fa ? SUBJECT_KIND[subject.kind]![0] : SUBJECT_KIND[subject.kind]![1]) : subject.kind} · {subject.status}</span>
          {subject.title ? <b className="text-body text-text-primary" dir="auto">{subject.title}</b> : null}
          {subject.text ? <p className="text-body text-text-primary" dir="auto">{subject.text}</p> : null}
          <span className="text-metadata text-text-secondary">
            {subject.owner ? `${fa ? "ثبت‌کننده" : "By"}: ${subject.owner}` : ""}
            {subject.organization?.name ? ` · ${subject.organization.name}` : ""}
          </span>
          {subject.link ? <a className="text-metadata text-brand-natural underline" href={`/${locale}${subject.link}`} target="_blank" rel="noreferrer">{fa ? "مشاهدهٔ صفحهٔ عمومی" : "Open public page"}</a> : null}
        </div>
      ) : (
        <span className="text-metadata text-text-secondary">{fa ? "موضوع دیگر وجود ندارد یا خلاصه‌ای برایش تعریف نشده است." : "The subject no longer exists, or has no summary."}</span>
      )}
      <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
        <span className="text-body font-medium text-text-primary">
          {fa ? `${context.reports.total} گزارش از ${context.reports.distinctReporters} نفر` : `${context.reports.total} report(s) from ${context.reports.distinctReporters} person(s)`}
        </span>
        <span className="text-metadata text-text-secondary">{Object.entries(context.reports.byReason).map(([reason, count]) => `${reason} ×${count}`).join(" · ")}</span>
        {context.reports.items.slice(0, 10).map((r) => (
          <span key={r.id} className="text-metadata text-text-secondary" dir="auto">
            {r.reason} · {r.status}{r.details ? ` — ${r.details}` : ""}
          </span>
        ))}
      </div>
    </ContextSurface>
  );
}
