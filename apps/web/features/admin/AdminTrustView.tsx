"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { TrustCaseSeverity, TrustCaseStatus, TrustSubjectType, type TrustCaseDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES = Object.values(TrustCaseStatus);

export function AdminTrustView() {
  const t = useTranslations("admin.trust");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [cases, setCases] = useState<TrustCaseDto[] | null>(null);
  const [status, setStatus] = useState<TrustCaseStatus | "">("");
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [subjectType, setSubjectType] = useState<TrustSubjectType>(TrustSubjectType.USER);
  const [subjectId, setSubjectId] = useState("");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<TrustCaseSeverity>(TrustCaseSeverity.MEDIUM);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await adminService.listTrustCases({ status: status || undefined, pageSize: 50 });
      setCases(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function createCase() {
    if (!subjectId.trim() || !reason.trim()) return;
    setCreating(true);
    try {
      const created = await adminService.openTrustCase({ subjectType, subjectId, reason, severity });
      setShowCreate(false);
      router.push(`/${locale}/admin/trust/${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {t("newCase")}
        </Button>
      </div>

      {showCreate ? (
        <ContextSurface className="flex flex-col gap-2">
          <span className="text-section-title text-text-primary">{t("createTitle")}</span>
          <Select
            label={t("form.subjectType")}
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as TrustSubjectType)}
            options={Object.values(TrustSubjectType).map((s) => ({ value: s, label: t(`subjectType.${s}`) }))}
          />
          <Input label={t("form.subjectId")} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
          <Input label={t("form.reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Select label={t("form.severity")} value={severity} onChange={(e) => setSeverity(e.target.value as TrustCaseSeverity)} options={Object.values(TrustCaseSeverity).map((s) => ({ value: s, label: t(`severity.${s}`) }))} />
          <Button isLoading={creating} onClick={createCase}>
            {t("form.submit")}
          </Button>
        </ContextSurface>
      ) : null}

      <Select label="" placeholder={t("title")} value={status} onChange={(e) => setStatus(e.target.value as TrustCaseStatus)} options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />

      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !cases ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && cases && cases.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {cases?.map((c) => (
        <button key={c.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/trust/${c.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{t(`subjectType.${c.subjectType}`)}</span>
              <span className="text-metadata text-text-secondary">{c.reason}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusLabel tone={adminStatusTone(c.severity)}>{t(`severity.${c.severity}`)}</StatusLabel>
              <StatusLabel tone={adminStatusTone(c.status)}>{t(`status.${c.status}`)}</StatusLabel>
            </div>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
