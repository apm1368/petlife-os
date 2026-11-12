"use client";
import { useTranslations } from "next-intl";
import { ContextSurface, StatusLabel } from "@petlife/ui";
import type { VerificationDetail, VerificationHistoryEntry } from "@/services/partner-verification.service";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import styles from "./verification.module.css";

/**
 * The transparent half of a partner's KYC case: who decided what, when and why (including every opening of a
 * private document), and what the partner did — in one timeline, newest first, beside a summary of where the
 * case stands now.
 */
export function VerificationCaseSummary({ detail }: { detail: VerificationDetail }) {
  const t = useTranslations("partnerVerification");
  const format = useInstantFormat();
  const docs = detail.documents;
  const count = (status: string) => docs.filter((d) => d.status === status).length;
  const decision = detail.lastDecision;
  const statusLabel = (value: string | null) => (value && t.has(`statuses.${value}`) ? t(`statuses.${value}`) : value ?? "—");
  return (
    <ContextSurface className={styles.card} aria-label={t("caseSummary")}>
      <div className={styles.cardHeader}>
        <h2 className="text-section-title">{t("caseSummary")}</h2>
        <StatusLabel tone={detail.status === "VERIFIED" ? "success" : detail.status === "REJECTED" || detail.status === "SUSPENDED" ? "urgent" : "attention"}>{statusLabel(detail.status)}</StatusLabel>
      </div>
      <dl className={styles.counts}>
        <div><dt>{t("documentStatuses.ACCEPTED")}</dt><dd>{count("ACCEPTED")}</dd></div>
        <div><dt>{t("documentStatuses.PENDING")}</dt><dd>{count("PENDING")}</dd></div>
        <div><dt>{t("documentStatuses.REJECTED")}</dt><dd>{count("REJECTED")}</dd></div>
        <div><dt>{t("documentStatuses.EXPIRED")}</dt><dd>{count("EXPIRED")}</dd></div>
      </dl>
      <div className={styles.note}>
        <h3>{t("lastDecision")}</h3>
        {decision ? (
          <>
            <p>
              <b>{t("history.statusChanged", { from: statusLabel(decision.from), to: statusLabel(decision.to) })}</b>
            </p>
            <p className={styles.meta}>
              {t("decidedBy", { name: decision.by ?? t("actorAdmin"), date: format.dateTime(decision.at) })}
            </p>
            {decision.reason ? <p>{t("decisionReason", { reason: decision.reason })}</p> : null}
          </>
        ) : (
          <p>{t("noDecisionYet")}</p>
        )}
      </div>
    </ContextSurface>
  );
}

export function VerificationCaseHistory({ entries }: { entries: VerificationHistoryEntry[] }) {
  const t = useTranslations("partnerVerification");
  const format = useInstantFormat();
  const statusLabel = (value: string | null) => (value && t.has(`statuses.${value}`) ? t(`statuses.${value}`) : value ?? "—");
  const docLabel = (kind: string | null) => (kind && t.has(`documentKinds.${kind}`) ? t(`documentKinds.${kind}`) : t("documentGeneric"));
  const title = (e: VerificationHistoryEntry) => {
    switch (e.kind) {
      case "STATUS_CHANGED":
        return t("history.statusChanged", { from: statusLabel(e.from), to: statusLabel(e.to) });
      case "DOCUMENT_REVIEWED":
        return t(e.decision === "REJECTED" ? "history.documentRejected" : "history.documentAccepted", { document: docLabel(e.documentKind) });
      case "DOCUMENT_OPENED":
        return t("history.documentOpened", { document: docLabel(e.documentKind) });
      case "DOCUMENT_UPLOADED":
        return t("history.documentUploaded", { document: docLabel(e.documentKind) });
      default:
        return t("history.submitted");
    }
  };
  return (
    <ContextSurface className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className="text-section-title">{t("history.title")}</h2>
      </div>
      <p className={styles.meta}>{t("history.hint")}</p>
      {entries.length === 0 ? (
        <p>{t("history.empty")}</p>
      ) : (
        <ol className={styles.timeline}>
          {entries.map((e) => (
            <li key={e.id} data-kind={e.kind} data-actor={e.actor}>
              <span className={styles.timelineDot} aria-hidden="true" />
              <div>
                <b>{title(e)}</b>
                <p className={styles.meta}>
                  {e.actor === "PARTNER" ? t("actorPartner") : e.actorName ?? t("actorAdmin")} · <time dateTime={e.at}>{format.dateTime(e.at)}</time>
                </p>
                {e.reason ? <p className={styles.timelineReason}>{e.reason}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </ContextSurface>
  );
}
