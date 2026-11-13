"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { SupportCaseCategory, type AdminPriority, type SupportCaseStatus, type SupportCaseSummaryDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";
import { DateField } from "@/features/shared/date-picker/DateField";

const STATUSES: SupportCaseStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "WAITING_ON_INTERNAL", "RESOLVED", "CLOSED"] as SupportCaseStatus[];

/** Who asked: everyone, people for themselves, or businesses from their panel (all, services, shops). */
const REQUESTER_TABS = ["ALL", "PERSONAL", "PARTNER", "PROVIDER", "SELLER"] as const;
type RequesterTab = (typeof REQUESTER_TABS)[number];

function initialTab(value: string | null): RequesterTab {
  return REQUESTER_TABS.includes(value as RequesterTab) ? (value as RequesterTab) : "ALL";
}

export function AdminSupportQueueView() {
  const t = useTranslations("admin.support");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<RequesterTab>(() => initialTab(searchParams.get("requester")));
  const orgFilter = searchParams.get("org");
  const [cases, setCases] = useState<SupportCaseSummaryDto[] | null>(null);
  const [status, setStatus] = useState<SupportCaseStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SupportCaseCategory | "">("");
  const [search, setSearch] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [error, setError] = useState<"access" | "failed" | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [requesterUserId, setRequesterUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SupportCaseCategory>(SupportCaseCategory.OTHER);
  const [priority, setPriority] = useState<AdminPriority | "">("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [formError, setFormError] = useState(false);

  async function load() {
    setError(null);
    try {
      const page = await adminService.listSupportCases({
        requesterKind: tab === "ALL" ? undefined : tab,
        requesterOrgId: orgFilter && (tab === "PROVIDER" || tab === "SELLER") ? orgFilter : undefined,
        status: status || undefined,
        category: categoryFilter || undefined,
        search: search || undefined,
        createdFrom: createdFrom ? new Date(createdFrom).toISOString() : undefined,
        createdTo: createdTo ? new Date(createdTo).toISOString() : undefined,
        pageSize: 50,
      });
      setCases(page.items);
    } catch (cause) {
      setError(cause instanceof ApiError && [401, 403].includes(cause.status) ? "access" : "failed");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, orgFilter, status, categoryFilter, createdFrom, createdTo]);

  function pickTab(next: RequesterTab) {
    setTab(next);
    setCases(null);
    // Keep the tab in the address so a link from a partner's page opens on it. Picking a tab drops a one-business filter.
    const query = new URLSearchParams();
    if (next !== "ALL") query.set("requester", next);
    const qs = query.toString();
    router.replace(`/${locale}/admin/support${qs ? `?${qs}` : ""}`);
  }

  async function createCase() {
    setFormError(false);
    setCreateError(false);
    if (!requesterUserId.trim() || !subject.trim() || !description.trim()) {
      setFormError(true);
      return;
    }
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
          {formError ? <p role="alert" className="text-error">{t("states.requiredFields")}</p> : null}
          {createError ? <p role="alert" className="text-error">{t("states.createFailed")}</p> : null}
        </ContextSurface>
      ) : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("requesterTabs.label")}>
        {REQUESTER_TABS.map((k) => (
          <Button key={k} size="sm" role="tab" aria-selected={tab === k} variant={tab === k ? "primary" : "ghost"} onClick={() => pickTab(k)}>
            {t(`requesterTabs.${k}`)}
          </Button>
        ))}
      </div>
      {orgFilter && (tab === "PROVIDER" || tab === "SELLER") ? (
        <p className="text-metadata text-text-secondary">
          {t("requesterTabs.oneBusiness")}{" "}
          <button type="button" className="underline" onClick={() => pickTab(tab)}>{t("requesterTabs.allBusinesses")}</button>
        </p>
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
        <DateField label={t("filter.createdFrom")} value={createdFrom} onChange={setCreatedFrom} />
        <DateField label={t("filter.createdTo")} value={createdTo} onChange={setCreatedTo} />
      </div>

      {error === "access" ? <EmptyState title={t("states.accessDeniedTitle")} description={t("states.accessDenied")} /> : null}
      {error === "failed" ? <ErrorRecovery title={t("title")} message={t("states.loadFailed")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!error && !cases ? <Skeleton className="h-40 w-full" aria-label={t("states.loading")} /> : null}
      {!error && cases && cases.length === 0 ? <EmptyState title={t("states.empty")} description={t("states.emptyDescription")} /> : null}
      {cases?.map((c) => (
        <button key={c.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/admin/support/${c.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{c.caseNumber}</span>
              <span className="text-metadata text-text-secondary">{c.subject}</span>
              {c.requesterOrganization ? (
                <span className="text-metadata text-text-secondary">
                  {t(`requesterOrg.${c.requesterOrganization.type}`)}: {c.requesterOrganization.name ?? t("requesterOrg.unnamed")} · {c.requesterDisplayName}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {c.humanEscalation ? <StatusLabel tone="attention">{t("humanEscalation.label")}</StatusLabel> : null}
              {c.requesterOrganization ? <StatusLabel tone="info">{t("requesterTabs.PARTNER")}</StatusLabel> : null}
              <StatusLabel tone={adminStatusTone(c.priority)}>{t(`priority.${c.priority}`)}</StatusLabel>
              <StatusLabel tone={adminStatusTone(c.status)}>{t(`status.${c.status}`)}</StatusLabel>
            </div>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
