"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentPublicDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { lostPetStatusTone } from "./lost-pet-status";

/**
 * No-login-required page (spec: a shareable link that anyone who spots the
 * pet can act on immediately). Never exposes owner contact detail beyond
 * publicContactMode, and only when the owner opted into PUBLIC_CONTACT.
 */
export function PublicLostPetView({ incidentId }: { incidentId: string }) {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [incident, setIncident] = useState<LostPetIncidentPublicDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [seenAt, setSeenAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function load() {
    setError(null);
    try {
      setIncident(await lostPetService.getPublic(incidentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  async function handleSubmitSighting(): Promise<void> {
    if (!seenAt) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let photoObjectKey: string | undefined;
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const target = await lostPetService.requestSightingPhotoUpload(incidentId, file.type, file.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        photoObjectKey = target.key;
      }
      await lostPetService.submitSighting(incidentId, {
        seenAt,
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

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!incident) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("detail.title", { name: incident.petName })}</h1>
        <StatusLabel tone={lostPetStatusTone(incident.status)}>{t(`status.${incident.status}`)}</StatusLabel>
      </div>

      <ContextSurface className="flex flex-col gap-2">
        {incident.primaryPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={incident.primaryPhotoUrl} alt={incident.petName} className="h-56 w-full rounded-md object-cover" />
        ) : null}
        <p className="text-body text-text-primary">{t("public.species", { species: incident.petSpecies })}</p>
        {incident.petBreed ? <p className="text-metadata text-text-secondary">{t("public.breed", { breed: incident.petBreed })}</p> : null}
        {incident.petColorMarkings ? <p className="text-metadata text-text-secondary">{t("public.colorMarkings", { markings: incident.petColorMarkings })}</p> : null}
        {incident.lastKnownLocation ? <p className="text-metadata text-text-secondary">{t("detail.lastKnownLocation", { location: incident.lastKnownLocation })}</p> : null}
        {incident.publicNotes ? <p className="text-body text-text-primary">{incident.publicNotes}</p> : null}
        {incident.publicContactMode ? <p className="text-body text-text-primary">{t("public.contact", { contact: incident.publicContactMode })}</p> : null}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-4">
        <h2 className="text-section-title text-text-primary">{t("public.reportSighting.title")}</h2>
        {submitted ? (
          <p className="text-body text-state-success">{t("public.reportSighting.success")}</p>
        ) : (
          <>
            <Input label={t("report.lastSeenAtLabel")} type="datetime-local" value={seenAt} onChange={(e) => setSeenAt(e.target.value)} />
            <Input label={t("public.reportSighting.locationLabel")} value={location} onChange={(e) => setLocation(e.target.value)} />
            <Input label={t("public.reportSighting.descriptionLabel")} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <span className="text-metadata text-text-secondary">{t("report.photoLabel")}</span>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-body text-text-primary" />
            </div>
            {submitError ? <p className="text-body text-state-urgent">{submitError}</p> : null}
            <Button variant="primary" isLoading={isSubmitting} onClick={handleSubmitSighting} disabled={!seenAt}>
              {t("public.reportSighting.submit")}
            </Button>
          </>
        )}
      </ContextSurface>
    </div>
  );
}
