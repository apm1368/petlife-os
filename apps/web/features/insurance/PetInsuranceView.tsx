"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceApplicationDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { ApiError } from "@/lib/api/client";
import { applicationStatusTone } from "./insurance-status";

export function PetInsuranceView({ petId }: { petId: string }) {
  const t = useTranslations("insurance");
  const tCommon = useTranslations("common");

  const [applications, setApplications] = useState<InsuranceApplicationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  async function load() {
    setError(null);
    try {
      setApplications(await insuranceService.listApplications(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setIsActing(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsActing(false);
    }
  }

  if (error && !applications) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!applications) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("application.sectionTitle")}</h1>
        <Link href={`/insurance?petId=${petId}`}>
          <Button variant="primary">{t("list.title")}</Button>
        </Link>
      </div>

      {error ? <p className="text-body text-state-urgent">{error}</p> : null}

      {applications.length === 0 ? (
        <EmptyState title={t("application.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {applications.map((application) => (
            <ContextSurface key={application.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-body text-text-primary">
                  {application.providerName} — {application.productName}
                </span>
                <StatusLabel tone={applicationStatusTone(application.status)}>{t(`applicationStatus.${application.status}`)}</StatusLabel>
              </div>
              <p className="text-metadata text-text-secondary">{t(`eligibilityStatus.${application.eligibilityStatus}`)}</p>
              {application.notes ? <p className="text-metadata text-text-secondary">{application.notes}</p> : null}
              {application.status === "DRAFT" ? (
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" isLoading={isActing} onClick={() => runAction(() => insuranceService.submitApplication(petId, application.id))}>
                    {t("application.submit")}
                  </Button>
                  <Button variant="ghost" size="sm" isLoading={isActing} onClick={() => runAction(() => insuranceService.cancelApplication(petId, application.id))}>
                    {t("application.cancel")}
                  </Button>
                </div>
              ) : null}
              {application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? (
                <Button variant="ghost" size="sm" isLoading={isActing} onClick={() => runAction(() => insuranceService.cancelApplication(petId, application.id))}>
                  {t("application.cancel")}
                </Button>
              ) : null}
              {application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? <p className="text-metadata text-text-secondary">{t("application.disclaimer")}</p> : null}
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
