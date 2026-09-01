"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderServiceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerOsService } from "@/services/provider-os.service";

/**
 * Minimal service admin (spec sections 24-25) — editable fields only, no
 * create/delete, no full catalog workflow. Disabling a service never
 * cancels its future bookings (BookingsService.createHold already rejects
 * new holds against an inactive service; existing rows are untouched).
 */
export function ProviderServicesView() {
  const t = useTranslations("provider.services");
  const [services, setServices] = useState<ProviderServiceDto[] | null>(null);
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; priceAmount: string; durationMinutes: string }>({ name: "", priceAmount: "", durationMinutes: "" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setError(false);
    try {
      setServices(await providerOsService.listServices());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(service: ProviderServiceDto) {
    setEditingId(service.id);
    setSaveError(null);
    setDraft({ name: service.name, priceAmount: service.priceAmount ? String(service.priceAmount) : "", durationMinutes: String(service.durationMinutes) });
  }

  async function toggleActive(service: ProviderServiceDto) {
    try {
      const updated = await providerOsService.updateService(service.id, { isActive: !service.isActive });
      setServices((prev) => prev?.map((s) => (s.id === service.id ? updated : s)) ?? null);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("saveFailed"));
    }
  }

  async function saveEdit(service: ProviderServiceDto) {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await providerOsService.updateService(service.id, {
        name: draft.name,
        priceAmount: draft.priceAmount ? Number(draft.priceAmount) : null,
        durationMinutes: Number(draft.durationMinutes),
      });
      setServices((prev) => prev?.map((s) => (s.id === service.id ? updated : s)) ?? null);
      setEditingId(null);
    } catch (err) {
      setSaveError(err instanceof ApiError && err.code === "PROVIDER_ACCESS_DENIED" ? t("ownerOnly") : err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!services) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      {services.length === 0 ? <EmptyState title={t("empty")} /> : null}
      {saveError ? <StatusLabel tone="attention">{saveError}</StatusLabel> : null}

      <div className="flex flex-col gap-3">
        {services.map((service) => (
          <ContextSurface key={service.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-body font-medium text-text-primary">{service.name}</p>
              <StatusLabel tone={service.isActive ? "success" : "neutral"}>{t(service.isActive ? "active" : "inactive")}</StatusLabel>
            </div>
            <p className="text-metadata text-text-secondary">
              {service.durationMinutes} {t("minutes")}
              {service.priceAmount ? ` · ${service.priceAmount} ${service.currency ?? ""}` : ""}
            </p>

            {editingId === service.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <Input label={t("name")} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                <Input
                  label={t("priceAmount")}
                  type="number"
                  value={draft.priceAmount}
                  onChange={(e) => setDraft((d) => ({ ...d, priceAmount: e.target.value }))}
                />
                <Input
                  label={t("durationMinutes")}
                  type="number"
                  value={draft.durationMinutes}
                  onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditingId(null)}>
                    {t("cancel")}
                  </Button>
                  <Button variant="primary" isLoading={isSaving} onClick={() => saveEdit(service)}>
                    {t("save")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => startEdit(service)}>
                  {t("edit")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(service)}>
                  {t(service.isActive ? "disable" : "enable")}
                </Button>
              </div>
            )}
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
