"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { ProviderVerificationStatus, SellerVerificationStatus, type AdminPartner360Dto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { DetailRow, Kpi, Panel, PanelTitle } from "./console-ui";
import { adminStatusTone } from "./status-tone";

type PartnerKind = "providers" | "sellers";
const formatDate = (value: string, locale: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(value));

export function Partner360View({ kind, partnerId }: { kind: PartnerKind; partnerId: string }) {
  const locale = useLocale();
  const t = useTranslations("admin.orgs");
  const common = useTranslations("admin.common");
  const [data, setData] = useState<AdminPartner360Dto | null>(null);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState("");
  const statuses = kind === "providers" ? Object.values(ProviderVerificationStatus) : Object.values(SellerVerificationStatus);
  const [nextStatus, setNextStatus] = useState<string>(statuses[0] ?? "");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const result = await adminService.getPartner360(kind, partnerId);
      setData(result);
      setNextStatus(result.verificationStatus);
    } catch {
      setFailed(true);
    }
  }, [kind, partnerId]);

  useEffect(() => { void load(); }, [load]);
  if (failed) return <ErrorRecovery title={t("detail.loadFailed")} message="" retryLabel={common("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-80 w-full" aria-label={common("loading")} />;

  const localizedStatus = (value: string) => t.has(`status.${value}`) ? t(`status.${value}`) : value;
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div><p className="text-metadata text-text-secondary">{t("detail.partnerId")} · <span dir="ltr">{data.id}</span></p><h1 className="text-page-title text-text-primary">{data.name}</h1><p className="text-body text-text-secondary">{t.has(`type.${data.type}`) ? t(`type.${data.type}`) : data.type}</p></div>
        <div className="flex flex-wrap gap-2"><StatusLabel tone={adminStatusTone(data.operationalStatus)}>{localizedStatus(data.operationalStatus)}</StatusLabel><StatusLabel tone={adminStatusTone(data.verificationStatus)}>{localizedStatus(data.verificationStatus)}</StatusLabel></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="min-w-0 space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.activity.map((item) => <Kpi key={item.key} label={t(`activity.${item.key}`)} value={item.count.toLocaleString(locale)} />)}</section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel><PanelTitle title={t("detail.identity")} /><DetailRow label={t("detail.location")}>{data.locationSummary ?? "—"}</DetailRow><DetailRow label={t("detail.email")}>{data.contactEmail ?? "—"}</DetailRow><DetailRow label={t("detail.phone")}>{data.contactPhone ?? "—"}</DetailRow><DetailRow label={t("detail.since")}>{formatDate(data.createdAt, locale)}</DetailRow></Panel>
            <Panel><PanelTitle title={t("detail.team")} />{data.team.length ? data.team.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-0"><div><p className="text-body text-text-primary">{member.displayName}</p><p className="text-metadata text-text-secondary">{t.has(`role.${member.role}`) ? t(`role.${member.role}`) : member.role}</p></div>{member.status ? <StatusLabel tone={adminStatusTone(member.status)}>{localizedStatus(member.status)}</StatusLabel> : null}</div>) : <EmptyState title={common("empty")} />}</Panel>
          </div>
          <Panel><PanelTitle title={t("detail.audit")} />{data.auditReferences.length ? data.auditReferences.map((entry) => <div key={entry.id} className="grid gap-1 border-b border-border-subtle py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto]"><div><p className="text-body text-text-primary">{t.has(`auditAction.${entry.action}`) ? t(`auditAction.${entry.action}`) : entry.action}</p><p className="text-metadata text-text-secondary">{entry.adminUser.displayName}{entry.reason ? ` · ${entry.reason}` : ""}</p></div><time className="text-metadata text-text-secondary">{formatDate(entry.createdAt, locale)}</time></div>) : <EmptyState title={common("empty")} />}</Panel>
        </main>
        <aside className="xl:sticky xl:top-4 xl:self-start"><Panel><PanelTitle title={t("detail.decision")} hint={t("detail.decisionHint")} /><div className="space-y-3"><Select label={t("verification.changeStatus")} value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} options={statuses.map((status) => ({ value: status, label: localizedStatus(status) }))} /><Input label={common("reasonLabel")} placeholder={common("reasonPlaceholder")} value={reason} onChange={(event) => setReason(event.target.value)} /><Button className="w-full" disabled={reason.trim().length < 5 || nextStatus === data.verificationStatus} isLoading={saving} onClick={async () => { setSaving(true); try { if (kind === "providers") await adminService.transitionProviderVerification(partnerId, nextStatus as ProviderVerificationStatus, reason.trim()); else await adminService.transitionSellerVerification(partnerId, nextStatus as SellerVerificationStatus, reason.trim()); setReason(""); await load(); } finally { setSaving(false); } }}>{t("verification.submit")}</Button></div></Panel></aside>
      </div>
    </div>
  );
}
