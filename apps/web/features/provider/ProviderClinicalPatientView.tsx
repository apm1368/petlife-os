"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { providerClinicalService, type ProviderClinicalPatientDto } from "@/services/provider-clinical.service";

/**
 * spec: "Provider view should show only data they are authorized to
 * access" — this page only ever renders once PetAccessGuard(canViewHealth)
 * has already passed server-side; a 403 here surfaces as a normal error
 * state, never a silent empty page.
 */
export function ProviderClinicalPatientView({ petId }: { petId: string }) {
  const t = useTranslations("clinicalOs.patient");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [patient, setPatient] = useState<ProviderClinicalPatientDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  async function load() {
    setError(null);
    try {
      setPatient(await providerClinicalService.getPatient(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function handleStartVisit(): Promise<void> {
    setIsStarting(true);
    setError(null);
    try {
      const visit = await providerClinicalService.startVisit({ petId });
      router.push(`/${locale}/provider/visits/${visit.id}?petId=${petId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      setIsStarting(false);
    }
  }

  if (error && !patient) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!patient) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{patient.pet.name}</h1>
        <Button variant="primary" isLoading={isStarting} onClick={handleStartVisit}>
          {t("startVisit")}
        </Button>
      </div>
      {error ? <p className="text-body text-state-attention">{error}</p> : null}

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("allergies")}</h2>
        {patient.allergies.length === 0 ? <p className="text-body text-text-secondary">—</p> : patient.allergies.map((a) => <p key={a.id} className="text-body text-text-primary">{a.name}{a.severity ? ` (${a.severity})` : ""}</p>)}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("medications")}</h2>
        {patient.medications.length === 0 ? <p className="text-body text-text-secondary">—</p> : patient.medications.map((m) => <p key={m.id} className="text-body text-text-primary">{m.name} {m.dosage ?? ""} {m.unit ?? ""}</p>)}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("conditions")}</h2>
        {patient.conditions.length === 0 ? <p className="text-body text-text-secondary">—</p> : patient.conditions.map((c) => <p key={c.id} className="text-body text-text-primary">{c.name}</p>)}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("recentVisits")}</h2>
        {patient.recentVisits.length === 0 ? (
          <p className="text-body text-text-secondary">—</p>
        ) : (
          patient.recentVisits.map((v) => (
            <button key={v.id} type="button" onClick={() => router.push(`/${locale}/provider/visits/${v.id}?petId=${petId}`)} className="flex items-center justify-between text-start">
              <span className="text-body text-text-primary">{v.reasonForVisit ?? new Date(v.startedAt).toLocaleDateString()}</span>
              <StatusLabel tone="neutral">{v.status}</StatusLabel>
            </button>
          ))
        )}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("carePlans")}</h2>
        {patient.carePlans.length === 0 ? <p className="text-body text-text-secondary">—</p> : patient.carePlans.map((p) => <p key={p.id} className="text-body text-text-primary">{p.title} — {p.status}</p>)}
      </ContextSurface>
    </div>
  );
}
