"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentPublicDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { ShareBar } from "@/features/shared/ShareBar";
import { addDays, formatDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { ReportContentPanel } from "@/features/shared/ReportContentPanel";
import { communityService } from "@/services/community.service";
import { lostPetStatusTone } from "./lost-pet-status";

const SPECIES: Record<string, [string, string]> = { DOG: ["سگ", "Dog"], CAT: ["گربه", "Cat"], OTHER: ["سایر", "Other"] };

/**
 * LOST INCIDENT PATTERN — public page. No sign-in needed to help. Shows only public-safe facts:
 * approximate area, photo, description, public notes, and a contact line only when the owner
 * chose one. A sighting reporter's identity and contact stay private to the owner.
 */
export function PublicLostPetView({ incidentId }: { incidentId: string }) {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";

  const [incident, setIncident] = useState<LostPetIncidentPublicDto | null>(null);
  const [error, setError] = useState<"notFound" | "error" | null>(null);
  const [seenDay, setSeenDay] = useState<string | null>(todayIso());
  const [seenTime, setSeenTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function load() {
    setError(null);
    try {
      setIncident(await lostPetService.getPublic(incidentId));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "notFound" : "error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  async function handleSubmitSighting(): Promise<void> {
    if (!seenDay) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let photoObjectKey: string | undefined;
      if (photo) {
        const target = await lostPetService.requestSightingPhotoUpload(incidentId, photo.type, photo.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: photo });
        photoObjectKey = target.key;
      }
      await lostPetService.submitSighting(incidentId, {
        seenAt: new Date(`${seenDay}T${seenTime || "12:00"}:00+03:30`).toISOString(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        photoObjectKey,
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error === "notFound") return <EmptyState title={fa ? "این گزارش در دسترس نیست" : "This report is not available"} description={fa ? "ممکن است پرونده بسته شده باشد." : "The report may have been closed."} />;
  if (error) return <ErrorRecovery title={tCommon("loading")} message={tCommon("genericError")} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!incident) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const reunited = incident.status === "REUNITED";
  const shareText = fa ? `${incident.petName} گم شده است${incident.approximateArea ? ` — حوالی ${incident.approximateArea}` : ""}. اگر او را دیدید گزارش دهید.` : `${incident.petName} is lost${incident.approximateArea ? ` around ${incident.approximateArea}` : ""}. If you see them, please report it.`;
  const facts: [string, string | null][] = [
    [fa ? "گونه" : "Species", SPECIES[incident.petSpecies]?.[fa ? 0 : 1] ?? incident.petSpecies],
    [fa ? "نژاد" : "Breed", incident.petBreed],
    [fa ? "رنگ و علامت‌ها" : "Colour & markings", incident.petColorMarkings],
    [fa ? "سن تقریبی" : "Approximate age", incident.petApproximateAgeMonths !== null ? (fa ? `${localizeDigits(Math.max(1, Math.round(incident.petApproximateAgeMonths / 12)), "fa")} سال` : `${Math.max(1, Math.round(incident.petApproximateAgeMonths / 12))} yr`) : null],
    [fa ? "محدودهٔ آخرین مشاهده" : "Last seen around", incident.approximateArea],
    [fa ? "زمان آخرین مشاهده" : "Last seen", incident.lastSeenAt ? formatDay(incident.lastSeenAt.slice(0, 10), lang, { weekday: true }) : null],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("detail.title", { name: incident.petName })}</h1>
        <StatusLabel tone={lostPetStatusTone(incident.status)}>{t(`status.${incident.status}`)}</StatusLabel>
      </div>

      {reunited ? (
        <p role="status" className="rounded-md bg-state-success/10 p-4 text-body text-state-success">{fa ? `${incident.petName} به خانه برگشت. از همهٔ کسانی که کمک کردند سپاسگزاریم.` : `${incident.petName} is back home. Thank you to everyone who helped.`}</p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <ContextSurface className="flex flex-col gap-3">
          {incident.primaryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={incident.primaryPhotoUrl} alt={fa ? `عکس ${incident.petName}` : `Photo of ${incident.petName}`} className="aspect-[4/3] w-full rounded-md object-cover" />
          ) : null}
          <dl className="grid gap-1 text-sm">
            {facts.filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-border-subtle py-1.5"><dt className="text-text-secondary">{label}</dt><dd className="text-end">{value}</dd></div>
            ))}
          </dl>
          {incident.publicNotes ? <p className="text-body text-text-primary">{incident.publicNotes}</p> : null}
          {incident.publicContactMode ? <p className="text-body text-text-primary">{t("public.contact", { contact: incident.publicContactMode })}</p> : null}
          {!reunited ? <ShareBar url={`/${lang}/lost-pets/${incident.id}`} text={shareText} /> : null}
          <ReportContentPanel submit={(reason, details) => communityService.reportContent("LOST_PET_INCIDENT", incident.id, reason, details)} />
        </ContextSurface>

        {!reunited ? (
          <ContextSurface className="flex flex-col gap-4">
            <h2 className="text-section-title text-text-primary">{t("public.reportSighting.title")}</h2>
            {submitted ? (
              <p role="status" className="text-body text-state-success">{t("public.reportSighting.success")}</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateRangeField mode="single" label={fa ? "تاریخ مشاهده" : "Date seen"} value={{ start: seenDay, end: null }} onChange={(v) => setSeenDay(v.start)} min={addDays(todayIso(), -60)} max={todayIso()} />
                  <Input label={fa ? "ساعت تقریبی" : "Approximate time"} type="time" dir="ltr" value={seenTime} onChange={(e) => setSeenTime(e.target.value)} />
                </div>
                <Input dir="auto" label={t("public.reportSighting.locationLabel")} value={location} onChange={(e) => setLocation(e.target.value)} />
                <Input dir="auto" label={t("public.reportSighting.descriptionLabel")} value={description} onChange={(e) => setDescription(e.target.value)} />
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-metadata text-text-secondary">{t("report.photoLabel")}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="text-body text-text-primary" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
                <p className="text-metadata text-text-secondary">{fa ? "گزارش شما فقط برای صاحب حیوان فرستاده می‌شود؛ نام و اطلاعات تماس شما عمومی نمی‌شود." : "Your report goes only to the owner; your name and contact details are never made public."}</p>
                {submitError ? <p role="alert" className="text-body text-state-urgent">{submitError}</p> : null}
                <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmitSighting} disabled={!seenDay}>
                  {t("public.reportSighting.submit")}
                </Button>
              </>
            )}
          </ContextSurface>
        ) : null}
      </div>
    </div>
  );
}
