"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { DisputeStatus, DisputeSubjectType, type DisputeDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";
import { ApiError } from "@/lib/api/client";

const STATUSES = Object.values(DisputeStatus);

export function AdminDisputesView() {
  const t = useTranslations("admin.disputes");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [disputes, setDisputes] = useState<DisputeDto[] | null>(null);
  const [status, setStatus] = useState<DisputeStatus | "">("");
  const [error, setError] = useState<"access" | "failed" | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [subjectType, setSubjectType] = useState<DisputeSubjectType>(DisputeSubjectType.ORDER);
  const [subjectId, setSubjectId] = useState("");
  const [raisedByUserId, setRaisedByUserId] = useState("");
  const [claim, setClaim] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(false);
  const [createError, setCreateError] = useState(false);

  async function load() {
    setError(null);
    try {
      const page = await adminService.listDisputes({ status: status || undefined, pageSize: 50 });
      setDisputes(page.items);
    } catch (cause) {
      setError(cause instanceof ApiError && [401, 403].includes(cause.status) ? "access" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function createDispute() {
    setFormError(false);
    setCreateError(false);
    if (!subjectId.trim() || !claim.trim()) {
      setFormError(true);
      return;
    }
    setCreating(true);
    try {
      const created = await adminService.createDispute({ subjectType, subjectId, raisedByUserId: raisedByUserId || undefined, claim });
      setShowCreate(false);
      router.push(`/${locale}/admin/disputes/${created.id}`);
    } catch {
      setCreateError(true);
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
          {formError ? <p role="alert" className="text-error">{t("states.requiredFields")}</p> : null}
          {createError ? <p role="alert" className="text-error">{t("states.createFailed")}</p> : null}
        </ContextSurface>
      ) : null}

      <Select label={t("filter.status")} placeholder={t("filter.allStatuses")} value={status} onChange={(e) => setStatus(e.target.value as DisputeStatus)} options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />

      {error === "access" ? <EmptyState title={t("states.accessDeniedTitle")} description={t("states.accessDenied")} /> : null}
      {error === "failed" ? <ErrorRecovery title={t("title")} message={t("states.loadFailed")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !disputes ? <Skeleton className="h-40 w-full" aria-label={t("states.loading")} /> : null}
      {!error && disputes && disputes.length === 0 ? <EmptyState title={t("states.empty")} description={t("states.emptyDescription")} /> : null}
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
