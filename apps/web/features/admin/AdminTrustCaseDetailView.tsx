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
const REPORT_REASONS = new Set(["SPAM", "ABUSE", "MISINFORMATION", "INAPPROPRIATE", "OTHER", "SCAM", "HARASSMENT", "PERSONAL_INFORMATION", "ANIMAL_WELFARE", "DANGEROUS_CONTENT"]);
const REPORT_STATUSES = new Set(["OPEN", "ESCALATED", "RESOLVED", "DISMISSED"]);
const SUBJECT_STATUSES = new Set(["OPEN", "SEARCHING", "SIGHTING_REPORTED", "FOUND", "REUNITED", "CLOSED", "SUBMITTED", "REVIEWED", "ACCEPTED", "REJECTED", "DRAFT", "PENDING_REVIEW", "PUBLISHED", "PARTIALLY_FULFILLED", "PAUSED", "FULFILLED", "EXPIRED", "REMOVED", "VERIFIED", "NOT_STARTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "APPROVED", "SUSPENDED", "INACTIVE", "HIDDEN"]);
const EFFECT_FIELDS = new Set(["status", "verificationStatus", "isPubliclyListed", "pausedListings", "closedAt"]);

function formatDate(iso: string, locale: string) {
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale;
  return new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function ActionAppeal({ action, onChanged }: { action: TrustActionDto; onChanged: () => void }) {
  const t = useTranslations("admin.trust");
  const [appellantUserId, setAppellantUserId] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitAppeal() {
    setError(null);
    if (!appellantUserId.trim() || !appealReason.trim()) {
      setError(t("detail.appealRequiredFields"));
      return;
    }
    try {
      await adminService.submitAppeal(action.id, { appellantUserId, reason: appealReason });
      onChanged();
    } catch {
      setError(t("detail.appealFailed"));
    }
  }

  async function resolveAppeal(status: AppealStatus.UPHELD | AppealStatus.OVERTURNED | AppealStatus.PARTIALLY_OVERTURNED) {
    setError(null);
    if (!resolution.trim()) {
      setError(t("detail.resolutionRequired"));
      return;
    }
    try {
      await adminService.resolveAppeal(action.appeal!.id, { status, resolution });
      onChanged();
    } catch {
      setError(t("detail.appealFailed"));
    }
  }

  if (!action.appeal) {
    return (
      <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-2">
        <Input label={t("detail.appellantUserId")} value={appellantUserId} onChange={(e) => setAppellantUserId(e.target.value)} className="min-w-40 flex-1" />
        <Input label={t("detail.appealReason")} value={appealReason} onChange={(e) => setAppealReason(e.target.value)} className="min-w-40 flex-1" />
        <Button size="sm" onClick={submitAppeal}>
          {t("detail.submitAppeal")}
        </Button>
        {error ? <p role="alert" className="w-full text-state-urgent">{error}</p> : null}
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
              onClick={() => void resolveAppeal(s)}
            >
              {t(`appealStatus.${s}`)}
            </Button>
          ))}
        </div>
      ) : (
        <span className="text-body text-text-primary">{appeal.resolution}</span>
      )}
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
    </div>
  );
}

export function AdminTrustCaseDetailView({ trustCaseId }: { trustCaseId: string }) {
  const t = useTranslations("admin.trust");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<TrustCaseDto | null>(null);
  const [error, setError] = useState<"access" | "notFound" | "failed" | null>(null);
  const [assigneeAdminId, setAssigneeAdminId] = useState("");
  const [actionType, setActionType] = useState<TrustActionType>(TrustActionType.WARNING);
  const [actionReason, setActionReason] = useState("");
  const [context, setContext] = useState<TrustCaseContext | null>(null);
  const [contextUnavailable, setContextUnavailable] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function formatEffect(record: Record<string, unknown>) {
    return Object.entries(record).map(([field, value]) => {
      const label = EFFECT_FIELDS.has(field) ? t(`detail.effectField.${field}`) : t("states.unknownValue");
      let formatted: string;
      if (typeof value === "boolean") formatted = value ? t("detail.yes") : t("detail.no");
      else if (typeof value === "number") formatted = new Intl.NumberFormat(locale).format(value);
      else if (field === "closedAt" && typeof value === "string") formatted = formatDate(value, locale);
      else if (typeof value === "string" && SUBJECT_STATUSES.has(value)) formatted = t(`context.subjectStatus.${value}`);
      else formatted = t("states.unknownValue");
      return `${label}: ${formatted}`;
    }).join(" · ");
  }

  async function load() {
    setError(null);
    setContextUnavailable(false);
    try {
      const [caseData, ctx] = await Promise.all([adminService.getTrustCase(trustCaseId), adminAnimalSupportService.trustCaseContext(trustCaseId).catch(() => null)]);
      setData(caseData);
      setContext(ctx);
      setContextUnavailable(ctx === null);
      if (ctx && !ctx.availableActions.includes(actionType)) setActionType(ctx.availableActions[0] as TrustActionType);
    } catch (cause) {
      setError(cause instanceof ApiError && [401, 403].includes(cause.status) ? "access" : cause instanceof ApiError && cause.status === 404 ? "notFound" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustCaseId]);

  async function assign() {
    if (!assigneeAdminId.trim()) return;
    setActionError(null);
    try {
      await adminService.assignTrustCase(trustCaseId, assigneeAdminId);
      setAssigneeAdminId("");
      await load();
    } catch {
      setActionError(t("states.actionFailed"));
    }
  }

  async function transition(status: TrustCaseStatus) {
    setActionError(null);
    try {
      await adminService.transitionTrustCase(trustCaseId, status);
      await load();
    } catch {
      setActionError(t("states.actionFailed"));
    }
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
          ? t("states.actionNotApplicable")
          : err instanceof ApiError && err.status === 403
            ? t("states.actionForbidden")
            : t("states.actionNotRecorded"),
      );
    }
  }

  if (error === "access") return <ContextSurface><h1 className="text-section-title">{t("states.accessDeniedTitle")}</h1><p>{t("states.accessDenied")}</p></ContextSurface>;
  if (error === "notFound") return <ContextSurface><h1 className="text-section-title">{t("states.notFoundTitle")}</h1><p>{t("states.notFound")}</p></ContextSurface>;
  if (error === "failed") return <ErrorRecovery title={t("title")} message={t("states.detailLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("states.loading")} />;

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

      {context ? <CaseContextPanel context={context} /> : contextUnavailable ? <p role="status" className="text-metadata text-text-secondary">{t("states.contextUnavailable")}</p> : null}

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={tCommon("assigneeLabel")} value={assigneeAdminId} onChange={(e) => setAssigneeAdminId(e.target.value)} className="min-w-48 flex-1" />
        <Button disabled={!assigneeAdminId.trim()} onClick={assign}>{tCommon("assign")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" aria-pressed={s === data.status} variant={s === data.status ? "primary" : "secondary"} onClick={() => transition(s)} disabled={s === data.status}>
            {t(`status.${s}`)}
          </Button>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.actions")}</span>
        {data.actions.length === 0 ? <p className="text-metadata text-text-secondary">{t("states.noActions")}</p> : null}
        {data.actions.map((a) => (
          <div key={a.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <StatusLabel tone={adminStatusTone(a.actionType)}>{t(`actionType.${a.actionType}`)}</StatusLabel>
              <span className="text-metadata text-text-secondary">{a.performedByAdmin.displayName} · {formatDate(a.createdAt, locale)}</span>
            </div>
            <span className="text-body text-text-primary">{a.reason}</span>
            {a.effectSummary ? (
              <span className="text-metadata text-text-secondary" dir="ltr">
                {t("detail.effectBefore")}: {formatEffect(a.effectSummary.before)} → {t("detail.effectAfter")}: {formatEffect(a.effectSummary.after)}
                {a.effectSummary.restoredByActionId ? ` · ${t("states.restored")}` : ""}
              </span>
            ) : null}
            <ActionAppeal action={a} onChanged={load} />
          </div>
        ))}
        <Select label={t("detail.takeAction")} value={actionType} onChange={(e) => setActionType(e.target.value as TrustActionType)} options={(context ? (context.availableActions as TrustActionType[]) : Object.values(TrustActionType)).map((v) => ({ value: v, label: t(`actionType.${v}`) }))} />
        <Input label={t("detail.actionReason")} value={actionReason} onChange={(e) => setActionReason(e.target.value)} />
        {actionError ? <p role="alert" className="text-body text-state-urgent">{actionError}</p> : null}
        <Button disabled={!actionReason.trim()} onClick={takeAction}>{t("detail.takeAction")}</Button>
      </ContextSurface>
    </div>
  );
}

/** The context endpoint intentionally excludes reporter identities, contact details and exact locations. */
function CaseContextPanel({ context }: { context: TrustCaseContext }) {
  const t = useTranslations("admin.trust.context");
  const locale = useLocale();
  const subject = context.subject as { kind?: string; title?: string | null; text?: string | null; status?: string; owner?: string | null; link?: string; organization?: { name?: string } | null } | null;
  const subjectKind = subject?.kind && ["POST", "COMMENT", "SUPPORT_NEED", "LOST_PET_INCIDENT", "LOST_PET_SIGHTING", "ORGANIZATION"].includes(subject.kind)
    ? t(`subjectKind.${subject.kind}`)
    : t("unknownKind");
  const subjectStatus = subject?.status && SUBJECT_STATUSES.has(subject.status) ? t(`subjectStatus.${subject.status}`) : t("unknownStatus");
  return (
    <ContextSurface className="flex flex-col gap-3">
      <span className="text-section-title text-text-primary">{t("title")}</span>
      {subject ? (
        <div className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{subjectKind} · {subjectStatus}</span>
          {subject.title ? <b className="text-body text-text-primary" dir="auto">{subject.title}</b> : null}
          {subject.text ? <p className="text-body text-text-primary" dir="auto">{subject.text}</p> : null}
          <span className="text-metadata text-text-secondary">
            {subject.owner ? t("by", { name: subject.owner }) : ""}
            {subject.organization?.name ? ` · ${subject.organization.name}` : ""}
          </span>
          {subject.link ? <a className="text-metadata text-brand-natural underline" href={`/${locale}${subject.link}`} target="_blank" rel="noreferrer">{t("openPublicPage")}</a> : null}
        </div>
      ) : (
        <span className="text-metadata text-text-secondary">{t("missingSubject")}</span>
      )}
      <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
        <span className="text-body font-medium text-text-primary">
          {t("reportCount", { total: context.reports.total, reporters: context.reports.distinctReporters })}
        </span>
        <span className="text-metadata text-text-secondary">{Object.entries(context.reports.byReason).map(([reason, count]) => `${REPORT_REASONS.has(reason) ? t(`reportReason.${reason}`) : t("unknownReason")} ×${new Intl.NumberFormat(locale).format(count)}`).join(" · ")}</span>
        {context.reports.items.slice(0, 10).map((r) => (
          <span key={r.id} className="text-metadata text-text-secondary" dir="auto">
            {REPORT_REASONS.has(r.reason) ? t(`reportReason.${r.reason}`) : t("unknownReason")} · {REPORT_STATUSES.has(r.status) ? t(`reportStatus.${r.status}`) : t("unknownStatus")}{r.details ? ` — ${r.details}` : ""}
          </span>
        ))}
      </div>
    </ContextSurface>
  );
}
