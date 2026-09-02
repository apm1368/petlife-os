"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { SellerOrganizationDetailDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";

/** Minimal Seller Settings (spec section 49) — legal/verification fields are never editable here; only operational contact/timezone/city/description. */
export function SellerSettingsView() {
  const t = useTranslations("seller.settings");
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [org, setOrg] = useState<SellerOrganizationDetailDto | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<{ supportContactEmail: string; supportContactPhone: string; timezone: string; city: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      const detail = await sellerOsService.getOrganization(sellerId);
      setOrg(detail);
      setDraft({
        supportContactEmail: detail.supportContactEmail ?? "",
        supportContactPhone: detail.supportContactPhone ?? "",
        timezone: detail.timezone,
        city: detail.city ?? "",
        description: detail.description ?? "",
      });
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  async function save() {
    if (!sellerId || !draft) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await sellerOsService.updateOrganization(sellerId, draft);
      setOrg(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!org || !draft) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <p className="text-body font-medium text-text-primary">{org.name}</p>
        <p className="text-metadata text-text-secondary">{t("verificationNote")}</p>

        <Input label={t("supportEmail")} type="email" value={draft.supportContactEmail} onChange={(e) => setDraft({ ...draft, supportContactEmail: e.target.value })} />
        <Input label={t("supportPhone")} value={draft.supportContactPhone} onChange={(e) => setDraft({ ...draft, supportContactPhone: e.target.value })} />
        <Input label={t("city")} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
        <Input label={t("timezone")} value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} />
        <Input label={t("description")} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

        <div className="flex items-center gap-3">
          <Button isLoading={saving} onClick={save}>
            {t("save")}
          </Button>
          {saved ? <span className="text-metadata text-state-success">{t("saved")}</span> : null}
        </div>
      </ContextSurface>
    </div>
  );
}
