"use client";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, StatusLabel } from "@petlife/ui";
import type { VerificationDocument } from "@/services/partner-verification.service";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import styles from "./verification.module.css";

const FILE_TYPES: Record<string,string> = { "application/pdf":"pdf", "image/jpeg":"jpeg", "image/png":"png", "image/webp":"webp" };
export function VerificationDocumentList({ documents, actions }: { documents: VerificationDocument[]; actions?: (document: VerificationDocument) => ReactNode }) {
  const t = useTranslations("partnerVerification"), locale = useLocale(), format = useInstantFormat();
  return <section className={styles.documents} aria-label={t("documents")}>
    <h2 className="text-section-title">{t("documents")}</h2>
    {documents.length === 0 ? <p>{t("emptyDocuments")}</p> : null}
    {documents.map(doc => {
      const note = doc.reviewNote || doc.rejectionReason;
      return <ContextSurface key={doc.id} className={styles.card}>
        <div className={styles.cardHeader}><h3 className="text-section-title">{t(`documentKinds.${doc.kind}`)}</h3><StatusLabel tone={doc.status === "ACCEPTED" ? "success" : doc.status === "PENDING" ? "attention" : "urgent"}>{t(`documentStatuses.${doc.status}`)}</StatusLabel></div>
        <dl className={styles.metadata}>
          <div><dt>{t("uploadedLabel")}</dt><dd><time dateTime={doc.submittedAt}>{format.dateTime(doc.submittedAt)}</time></dd></div>
          <div><dt>{t("fileLabel")}</dt><dd>{t(`fileTypes.${FILE_TYPES[doc.mimeType] || "other"}`)} · {t("fileSize", { size:new Intl.NumberFormat(locale, { maximumFractionDigits:1 }).format(doc.fileSizeBytes / 1024) })}</dd></div>
          <div><dt>{t("expiryLabel")}</dt><dd>{t(`expiry.${doc.expiryState}`)}{doc.expiresAt ? <><br/><time dateTime={doc.expiresAt}>{format.dateTime(doc.expiresAt)}</time></> : null}</dd></div>
          <div><dt>{t("reviewedLabel")}</dt><dd>{doc.reviewedAt ? <time dateTime={doc.reviewedAt}>{format.dateTime(doc.reviewedAt)}</time> : t("notReviewed")}</dd></div>
        </dl>
        {note ? <div className={styles.note}><h4>{t(doc.status === "REJECTED" ? "rejectionLabel" : "reviewNoteLabel")}</h4><p>{note}</p></div> : null}
        {actions ? <div className={styles.actions}>{actions(doc)}</div> : null}
      </ContextSurface>;
    })}
  </section>;
}
