"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { SupportCaseCategory, type AdminPriority, type SupportCaseStatus, type SupportCaseSummaryDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES: SupportCaseStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "WAITING_ON_INTERNAL", "RESOLVED", "CLOSED"] as SupportCaseStatus[];

export function AdminSupportQueueView() {
  const t = useTranslations("admin.support");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [cases, setCases] = useState<SupportCaseSummaryDto[] | null>(null);
  const [status, setStatus] = useState<SupportCaseStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SupportCaseCategory | "">("");
  const [search, setSearch] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [requesterUserId, setRequesterUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SupportCaseCategory>(SupportCaseCategory.OTHER);
  const [priority, setPriority] = useState<AdminPriority | "">("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(false);
    try {
      const page = await adminService.listSupportCases({
        status: status || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
        createdFrom: createdFrom ? new Date(createdFrom).toISOString() : undefined,
        createdTo: createdTo ? new Date(createdTo).toISOString() : undefined,
        pageSize: 50,
      });
      setCases(page.items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, categoryFilter, createdFrom, createdTo]);

  async function createCase() {
    if (!requesterUserId.trim() || !subject.trim() || !description.trim()) return;
    setCreating(true);
    try {
      const created = await adminService.createSupportCase({
        requesterUserId,
        subject,
        description,
        category,
        priority: priority || undefined,
      });
      setShowCreate(false);
      router.push(`/${locale}/admin/support/${created.id}`);
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
          <Input label={t("form.requesterUserId")} value={requesterUserId} onChange={(e) => setRequesterUserId(e.target.value)} />
          <Input label={t("form.subject")} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Input label={t("form.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Select
            label={t("form.category")}
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCaseCategory)}
            options={Object.values(SupportCaseCategory).map((c) => ({ value: c, label: t(`category.${c}`) }))}
          />
          <Select
            label={t("form.priority")}
            value={priority}
            onChange={(e) => setPriority(e.target.value as AdminPriority)}
            placeholder={t("filter.allStatuses")}
            options={["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => ({ value: p, label: t(`priority.${p}`) }))}
          />
          <Button isLoading={creating} onClick={createCase}>
            {t("form.submit")}
          </Button>
        </ContextSurface>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Select
          label={t("filter.allStatuses")}
          value={status}
          onChange={(e) => setStatus(e.target.value as SupportCaseStatus)}
          placeholder={t("filter.allStatuses")}
          options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        />
        <Select
          label={t("filter.allCategories")}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as SupportCaseCategory)}
          placeholder={t("filter.allCategories")}
          options={Object.values(SupportCaseCategory).map((c) => ({ value: c, label: t(`category.${c}`) }))}
        />
        <Input
          label={t("filter.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
          className="min-w-56 flex-1"
        />
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          {tCommon("search")}
        </Button>
        <Input type="date" label={t("filter.createdFrom")} value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
        <Input type="date" label={t("filter.createdTo")} value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
      </div>

      {error ? <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !cases ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && cases && cases.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {cases?.map((c) => (
        <button key={c.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/support/${c.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{c.caseNumber}</span>
              <span className="text-metadata text-text-secondary">{c.subject}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusLabel tone={adminStatusTone(c.priority)}>{t(`priority.${c.priority}`)}</StatusLabel>
              <StatusLabel tone={adminStatusTone(c.status)}>{t(`status.${c.status}`)}</StatusLabel>
            </div>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
