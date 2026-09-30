"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceApplicationDto } from "@petlife/types";
import { insuranceService } from "@/services/insurance.service";
import { ApiError } from "@/lib/api/client";
import { applicationStatusTone } from "./insurance-status";
import { LoadFailure } from "@/features/system/LoadFailure";

export function PetInsuranceView({ petId }: { petId: string }) {
  const t = useTranslations("insurance");
  const tCommon = useTranslations("common");

  const [applications, setApplications] = useState<InsuranceApplicationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isActing, setIsActing] = useState(false);
  const fa = useLocale() === "fa";
  const [consentText, setConsentText] = useState<string | null>(null);
  const [consented, setConsented] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    insuranceService.consentText().then((r) => setConsentText(r.text)).catch(() => setConsentText(null));
  }, []);

  async function load() {
    setError(null);
    setLoadError(null);
    try {
      setApplications(await insuranceService.listApplications(petId));
    } catch (err) {
      setLoadError(err);
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

  if (loadError && !applications) return <LoadFailure error={loadError} onRetry={load} />;
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
              {application.status === "NEEDS_INFORMATION" ? (
                <div className="rounded-md bg-state-attention/10 p-3 text-sm">
                  <p className="font-bold">{fa ? "بیمه‌گر اطلاعات بیشتری خواسته است:" : "The insurer asked for more information:"}</p>
                  <p className="mt-1 whitespace-pre-line">{application.insurerMessage}</p>
                  <label className="mt-2 flex flex-col gap-1">{fa ? "پاسخ یا توضیحات شما" : "Your answer or notes"}
                    <textarea dir="auto" maxLength={2000} value={notes[application.id] ?? application.notes ?? ""} onChange={(e) => setNotes({ ...notes, [application.id]: e.target.value })} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" />
                  </label>
                </div>
              ) : null}
              {(application.status === "APPROVED" || application.status === "DECLINED") && (application.insurerMessage || application.externalReference) ? (
                <p className="text-metadata text-text-secondary">{application.insurerMessage}{application.externalReference ? ` · ${fa ? "شمارهٔ مرجع بیمه‌گر" : "Insurer reference"}: ${application.externalReference}` : ""}</p>
              ) : null}
              {application.status === "APPROVED" ? <p className="text-metadata text-text-secondary">{fa ? "«پذیرفته‌شده» یعنی بیمه‌گر درخواست را پذیرفته است؛ پوشش فقط با صدور بیمه‌نامه توسط بیمه‌گر آغاز می‌شود." : "“Approved” means the insurer accepted the application; cover starts only when the insurer issues a policy."}</p> : null}
              {application.status === "DRAFT" || application.status === "NEEDS_INFORMATION" ? (
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-3 rounded-md border border-border-subtle p-3 text-sm">
                    <input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!consented[application.id]} onChange={(e) => setConsented({ ...consented, [application.id]: e.target.checked })} />
                    <span>
                      {fa ? "موافقم PET LIFE این درخواست، اطلاعات تماس من و گونه، نژاد، سن و وزن حیوانم را برای بررسی با بیمه‌گر به اشتراک بگذارد. این یک بیمه‌نامه نیست؛ پوشش فقط در صورت صدور بیمه‌نامه توسط بیمه‌گر آغاز می‌شود." : consentText ?? "I agree that PET LIFE shares this application with the insurer for review. This is not an insurance policy."}
                      {fa && consentText ? <details className="mt-1 text-metadata text-text-secondary"><summary>{fa ? "متن ثبت‌شدهٔ رضایت" : "Recorded consent text"}</summary><span dir="ltr">{consentText}</span></details> : null}
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" disabled={!consented[application.id]} isLoading={isActing} onClick={() => runAction(async () => { if (application.status === "NEEDS_INFORMATION" && (notes[application.id] ?? "") !== (application.notes ?? "")) await insuranceService.updateApplication(petId, application.id, notes[application.id] ?? ""); return insuranceService.submitApplication(petId, application.id, true); })}>
                      {application.status === "NEEDS_INFORMATION" ? (fa ? "ارسال دوباره به بیمه‌گر" : "Resubmit to the insurer") : t("application.submit")}
                    </Button>
                    <Button variant="ghost" size="sm" isLoading={isActing} onClick={() => runAction(() => insuranceService.cancelApplication(petId, application.id))}>
                      {t("application.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? (
                <Button variant="ghost" size="sm" isLoading={isActing} onClick={() => runAction(() => insuranceService.cancelApplication(petId, application.id))}>
                  {t("application.cancel")}
                </Button>
              ) : null}
              {application.status === "SUBMITTED" || application.status === "UNDER_REVIEW" ? <p className="text-metadata text-text-secondary">{t("application.disclaimer")}</p> : null}
              {application.timeline?.length ? (
                <details className="text-metadata text-text-secondary">
                  <summary className="cursor-pointer">{fa ? "تاریخچه" : "History"}</summary>
                  <ol className="mt-1 flex flex-col gap-0.5">{application.timeline.map((e, i) => <li key={i}>{t(`applicationStatus.${e.toStatus}`)} · {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(e.createdAt))}</li>)}</ol>
                </details>
              ) : null}
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
