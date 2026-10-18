"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, StatusLabel } from "@petlife/ui";
import type { VerificationQueueItem } from "@/services/partner-verification.service";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import { adminStatusTone } from "@/features/admin/status-tone";
import styles from "./verification.module.css";

export function VerificationQueueCard({ row }: { row: VerificationQueueItem }) {
  const t = useTranslations("partnerVerification");
  const locale = useLocale();
  const format = useInstantFormat();
  return <ContextSurface className={styles.card}>
    <div className={styles.cardHeader}>
      <h2 className="text-section-title">{row.name}</h2>
      <StatusLabel tone={adminStatusTone(row.status)}>{t(`statuses.${row.status}`)}</StatusLabel>
    </div>
    <dl className={styles.metadata}>
      <div><dt>{t("rowPartner")}</dt><dd>{t(`subjects.${row.subjectType}`)} · {t.has(`businessKinds.${row.kind}`) ? t(`businessKinds.${row.kind}`) : t("otherBusiness")}</dd></div>
      <div><dt>{t("rowReceived")}</dt><dd>{row.submittedAt ? <time dateTime={row.submittedAt}>{format.dateTime(row.submittedAt)}</time> : t("notRecorded")}</dd></div>
    </dl>
    <div><h3 className="text-metadata text-text-secondary">{t("rowDocuments")}</h3><dl className={styles.counts}>
      {(["pending", "accepted", "rejected", "expired"] as const).map(key => <div key={key}><dt>{t(`documentCountLabels.${key}`)}</dt><dd>{format.number(row.documents[key])}</dd></div>)}
    </dl></div>
    <div className={styles.footer}>
      {row.waitingHours !== null ? <p>{t("waitingHours", { count: format.number(row.waitingHours) })}</p> : null}
      <Link className={styles.reviewLink} href={`/${locale}/admin/verification/${row.subjectType.toLowerCase()}/${row.id}`}>{t("reviewCase")}</Link>
    </div>
  </ContextSurface>;
}
