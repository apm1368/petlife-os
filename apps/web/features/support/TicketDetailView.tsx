"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { UserFacingSupportCaseStatus, type SupportCaseUserDetailDto } from "@petlife/types";
import { supportService } from "@/services/support.service";
import { supportStatusTone } from "./support-status-tone";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { SupportFrame } from "./SupportFrame";

function formatDate(iso: string, locale: string) {
  const intlLocale = locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/**
 * SUBMITTED / UNDER_REVIEW / RESOLVED are the three fixed steps of the
 * simplified tracker. WAITING shares UNDER_REVIEW's position — it's a
 * lateral "we need something from you" detour, not further progress — so
 * it renders as a distinct highlighted label at that same step rather than
 * a fourth step, and a case can bounce between the two without the tracker
 * ever looking like it regressed.
 */
const STEP_ORDER: Record<UserFacingSupportCaseStatus, number> = {
  [UserFacingSupportCaseStatus.SUBMITTED]: 0,
  [UserFacingSupportCaseStatus.UNDER_REVIEW]: 1,
  [UserFacingSupportCaseStatus.WAITING]: 1,
  [UserFacingSupportCaseStatus.RESOLVED]: 2,
  [UserFacingSupportCaseStatus.CLOSED]: 2,
};
const STEPS: UserFacingSupportCaseStatus[] = [UserFacingSupportCaseStatus.SUBMITTED, UserFacingSupportCaseStatus.UNDER_REVIEW, UserFacingSupportCaseStatus.RESOLVED];

export function TicketDetailView({ caseId }: { caseId: string }) {
  const t = useTranslations("support");
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<SupportCaseUserDetailDto | null>(null);
  const [error, setError] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [escalationConfirmed, setEscalationConfirmed] = useState(false);
  const [escalationRef, setEscalationRef] = useState<string | null>(null);
  const [escalationError, setEscalationError] = useState(false);
  const [escalating, setEscalating] = useState(false);

  async function load() {
    setError(false);
    try {
      setData(await supportService.getById(caseId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function sendMessage() {
    if (!messageBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await supportService.postMessage(caseId, messageBody);
      setMessageBody("");
      await load();
    } catch (err) {
      setSendError(apiErrorText(err, locale, t("detail.sendFailed")));
    } finally {
      setSending(false);
    }
  }

  async function reopen() {
    setReopening(true);
    try {
      await supportService.reopen(caseId);
      await load();
    } finally {
      setReopening(false);
    }
  }

  async function escalate() {
    if (escalationReason.trim().length < 5 || !escalationConfirmed) return;
    setEscalating(true); setEscalationError(false);
    try { const result = await supportService.escalate(caseId, escalationReason.trim()); setEscalationRef(result.referenceNumber); }
    catch { setEscalationError(true); }
    finally { setEscalating(false); }
  }

  if (error) return <ErrorRecovery title={t("tickets.title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const currentStep = STEP_ORDER[data.status];
  const canReply = data.status !== "CLOSED";
  const canReopen = data.status === "RESOLVED" || data.status === "CLOSED";

  return (
    <SupportFrame>
    <div className="support-workspace support-workspace--detail flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/support/tickets`)}>
        {t("detail.backToList")}
      </Button>

      <header className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("detail.caseNumber", { number: data.caseNumber })}</h1>
        <StatusLabel tone={supportStatusTone(data.status)}>{t(`status.${data.status}`)}</StatusLabel>
      </header>

      <ol className="support-progress flex items-center gap-2" aria-label={t("detail.progress")}>
        {STEPS.map((step, index) => (
          <li key={step} className="flex flex-1 items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 flex-1 rounded-full ${index <= currentStep ? "bg-state-positive" : "bg-border-subtle"}`}
            />
            {index < STEPS.length - 1 ? null : null}
          </li>
        ))}
      </ol>
      <p className="text-metadata text-text-secondary">{t(`status.${data.status}`)}</p>

      <ContextSurface className="support-case-summary flex flex-col gap-1">
        <span className="text-body font-medium text-text-primary">{data.subject}</span>
        <span className="text-body text-text-secondary">{data.description}</span>
      </ContextSurface>

      <ContextSurface className="support-thread flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.messages")}</span>
        {data.messages.length === 0 ? <p className="text-metadata text-text-secondary">{t("detail.noMessages")}</p> : null}
        {data.messages.map((m) => (
          <div key={m.id} className="support-message flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-metadata text-text-secondary">
              {m.authorType === "USER" ? t("detail.you") : t("detail.support")} · {formatDate(m.createdAt, locale)}
            </span>
            <span className="text-body text-text-primary">{m.body}</span>
          </div>
        ))}

        {canReply ? (
          <div className="support-composer flex flex-col gap-2">
            {sendError ? (
              <p role="alert" className="text-metadata text-state-urgent">
                {sendError}
              </p>
            ) : null}
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder={t("detail.composePlaceholder")}
              rows={3}
              className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
            />
            <Button disabled={!messageBody.trim()} isLoading={sending} onClick={sendMessage}>
              {t("detail.send")}
            </Button>
          </div>
        ) : null}

        {canReopen ? (
          <Button variant="secondary" isLoading={reopening} onClick={reopen}>
            {t("detail.reopen")}
          </Button>
        ) : null}
        {data.status !== "CLOSED" && data.status !== "RESOLVED" ? (
          <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">
            <h2 className="text-section-title text-text-primary">{locale === "fa" ? "درخواست پیگیری توسط کارشناس" : "Request a human follow-up"}</h2>
            {escalationRef ? <p role="status" className="text-body text-state-positive">{locale === "fa" ? `درخواست پیگیری ثبت شد. کد پیگیری: ${escalationRef}` : `Follow-up requested. Reference: ${escalationRef}`}</p> : <>
              <label className="text-metadata text-text-secondary" htmlFor="escalation-reason">{locale === "fa" ? "دلیل درخواست" : "Reason for follow-up"}</label>
              <textarea id="escalation-reason" value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} rows={3} maxLength={1000} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" />
              <label className="flex items-start gap-2 text-metadata text-text-secondary"><input type="checkbox" checked={escalationConfirmed} onChange={(e) => setEscalationConfirmed(e.target.checked)} /><span>{locale === "fa" ? "تأیید می‌کنم که درخواست من برای ارجاع به کارشناس ثبت شود." : "I confirm that I want this case referred for human follow-up."}</span></label>
              {escalationError ? <p role="alert" className="text-metadata text-state-urgent">{locale === "fa" ? "ثبت درخواست پیگیری انجام نشد. دوباره تلاش کنید." : "The follow-up request could not be submitted. Try again."}</p> : null}
              <Button variant="secondary" isLoading={escalating} disabled={!escalationConfirmed || escalationReason.trim().length < 5} onClick={escalate}>{locale === "fa" ? "درخواست پیگیری" : "Request follow-up"}</Button>
            </>}
          </section>
        ) : null}
      </ContextSurface>
    </div>
    </SupportFrame>
  );
}
