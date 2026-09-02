"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { DisputeStatus, DisputeSubjectType, type DisputeDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES = Object.values(DisputeStatus);

export function AdminDisputesView() {
  const t = useTranslations("admin.disputes");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [disputes, setDisputes] = useState<DisputeDto[] | null>(null);
  const [status, setStatus] = useState<DisputeStatus | "">("");
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [subjectType, setSubjectType] = useState<DisputeSubjectType>(DisputeSubjectType.ORDER);
  const [subjectId, setSubjectId] = useState("");
  const [raisedByUserId, setRaisedByUserId] = useState("");
  const [claim, setClaim] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await adminService.listDisputes({ status: status || undefined, pageSize: 50 });
      setDisputes(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function createDispute() {
    if (!subjectId.trim() || !claim.trim()) return;
    setCreating(true);
    try {
      const created = await adminService.createDispute({ subjectType, subjectId, raisedByUserId: raisedByUserId || undefined, claim });
      setShowCreate(false);
      router.push(`/${locale}/admin/disputes/${created.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {t("newDispute")}
        </Button>
      </div>

      {showCreate ? (
        <ContextSurface className="flex flex-col gap-2">
          <span className="text-section-title text-text-primary">{t("createTitle")}</span>
          <Select
            label={t("form.subjectType")}
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as DisputeSubjectType)}
            options={Object.values(DisputeSubjectType).map((s) => ({ value: s, label: t(`subjectType.${s}`) }))}
          />
          <Input label={t("form.subjectId")} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
          <Input label={t("form.raisedByUserId")} value={raisedByUserId} onChange={(e) => setRaisedByUserId(e.target.value)} />
          <Input label={t("form.claim")} value={claim} onChange={(e) => setClaim(e.target.value)} />
          <Button isLoading={creating} onClick={createDispute}>
            {t("form.submit")}
          </Button>
        </ContextSurface>
      ) : null}

      <Select label="" placeholder={t("title")} value={status} onChange={(e) => setStatus(e.target.value as DisputeStatus)} options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />

      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !disputes ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && disputes && disputes.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {disputes?.map((d) => (
        <button key={d.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/disputes/${d.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{t(`subjectType.${d.subjectType}`)}</span>
              <span className="text-metadata text-text-secondary">{d.claim}</span>
            </div>
            <StatusLabel tone={adminStatusTone(d.status)}>{t(`status.${d.status}`)}</StatusLabel>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
