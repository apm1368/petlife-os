"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { ProviderVerificationStatus, type AdminProviderOrgSummaryDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

function VerificationForm({ org, onChanged }: { org: AdminProviderOrgSummaryDto; onChanged: () => void }) {
  const t = useTranslations("admin.orgs");
  const tCommon = useTranslations("admin.common");
  const [status, setStatus] = useState<ProviderVerificationStatus>(org.verificationStatus);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-2">
      <Select label={t("verification.changeStatus")} value={status} onChange={(e) => setStatus(e.target.value as ProviderVerificationStatus)} options={Object.values(ProviderVerificationStatus).map((s) => ({ value: s, label: s }))} />
      <Input label={tCommon("reasonLabel")} placeholder={tCommon("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} className="min-w-40 flex-1" />
      <Button
        size="sm"
        isLoading={saving}
        onClick={async () => {
          if (!reason.trim()) return;
          setSaving(true);
          try {
            await adminService.transitionProviderVerification(org.id, status, reason);
            onChanged();
          } finally {
            setSaving(false);
          }
        }}
      >
        {t("verification.submit")}
      </Button>
    </div>
  );
}

export function AdminProvidersView() {
  const t = useTranslations("admin.orgs");
  const tCommon = useTranslations("admin.common");
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState<AdminProviderOrgSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    setError(false);
    try {
      const page = await adminService.listProviders(q, { pageSize: 30 });
      setOrgs(page.items);
      setSearched(true);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("providersTitle")}</h1>
      <Input
        label={t("providersTitle")}
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void search();
        }}
      />
      {error ? <ErrorRecovery title={t("providersTitle")} message="" retryLabel={tCommon("retry")} onRetry={search} /> : null}
      {!error && searched && !orgs ? <Skeleton className="h-40 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && orgs && orgs.length === 0 ? <EmptyState title={tCommon("empty")} /> : null}
      {orgs?.map((org) => (
        <ContextSurface key={org.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body font-medium text-text-primary">{org.name}</span>
            <StatusLabel tone={adminStatusTone(org.verificationStatus)}>{org.verificationStatus}</StatusLabel>
          </div>
          <VerificationForm org={org} onChanged={search} />
        </ContextSurface>
      ))}
    </div>
  );
}
