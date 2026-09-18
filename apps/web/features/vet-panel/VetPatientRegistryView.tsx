"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { PaginatedDto, ProviderPatientSummaryDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { vetPanelService } from "@/services/vet-panel.service";

const PAGE_SIZE = 20;

/**
 * The patient index. Handoff 17 shipped a clinical record reachable only by
 * already knowing a pet's UUID; this is the screen that makes a caseload
 * navigable.
 *
 * The `accessState` badge is load-bearing honesty: a clinic keeps seeing its
 * historical patients after a visit-scoped grant lapses, and the row says
 * EXPIRED rather than implying the record is still open. Tapping through is
 * still allowed — the server refuses with a real error — because silently
 * disabling the row would leave the vet guessing why their patient vanished.
 */
export function VetPatientRegistryView() {
  const t = useTranslations("vetPanel.registry");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [hospitalizedOnly, setHospitalizedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedDto<ProviderPatientSummaryDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setResult(await vetPanelService.listPatients({ q: submittedQuery || undefined, hospitalizedOnly: hospitalizedOnly || undefined, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery, hospitalizedOnly, page]);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <form onSubmit={handleSearch} className="flex flex-col gap-2">
        <Input label={t("searchLabel")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary">
            {t("search")}
          </Button>
          <label className="flex items-center gap-2 text-metadata text-text-secondary">
            <input
              type="checkbox"
              checked={hospitalizedOnly}
              onChange={(e) => {
                setPage(1);
                setHospitalizedOnly(e.target.checked);
              }}
            />
            {t("hospitalizedOnly")}
          </label>
        </div>
      </form>

      {error ? <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!result && !error ? <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} /> : null}

      {result && result.items.length === 0 ? <EmptyState title={t("empty")} description={t("emptyDescription")} /> : null}

      {result && result.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {result.items.map((patient) => (
            <button
              key={patient.petId}
              type="button"
              onClick={() => router.push(`/${locale}/provider/patients/${patient.petId}`)}
              className="rounded-lg border border-border-subtle bg-surface-elevated p-4 text-start hover:bg-surface-subtle"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-body text-text-primary">{patient.name}</span>
                <StatusLabel tone={patient.accessState === "ACTIVE" ? "success" : "neutral"}>{t(`accessState.${patient.accessState}`)}</StatusLabel>
              </div>
              <p className="mt-1 text-metadata text-text-secondary">
                {[t(`species.${patient.species}`), patient.breed, patient.ownerDisplayName ? t("ownedBy", { name: patient.ownerDisplayName }) : null].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {patient.activeHospitalizationId ? <StatusLabel tone="attention">{t("inpatient")}</StatusLabel> : null}
                {patient.openVisitId ? <StatusLabel tone="attention">{t("visitOpen")}</StatusLabel> : null}
                {patient.activeAlertCount > 0 ? (
                  <StatusLabel tone={patient.highestActiveAlertSeverity === "CRITICAL" ? "emergency" : "attention"}>{t("alerts", { count: patient.activeAlertCount })}</StatusLabel>
                ) : null}
                {/* "Never seen here" is stated, not left blank — an empty date could read as "no visits needed". */}
                <StatusLabel tone="neutral">{patient.lastVisitAt ? t("lastVisit", { date: new Date(patient.lastVisitAt).toLocaleDateString() }) : t("noVisitsYet")}</StatusLabel>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {result && totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {t("previous")}
          </Button>
          <span className="text-metadata text-text-secondary">{t("pageOf", { page, totalPages })}</span>
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
