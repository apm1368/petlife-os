"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShareBar } from "@/features/shared/ShareBar";
import { formatDay } from "@/lib/date/jalali";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentDto, LostPetSightingDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { lostPetStatusTone } from "./lost-pet-status";

const ACTIONS_BY_STATUS: Record<string, ("markSearching" | "markFound" | "reunite" | "close" | "share")[]> = {
  // Batch 6: an owner who finds the pet themselves can record the reunion directly.
  OPEN: ["markSearching", "markFound", "reunite", "share", "close"],
  SEARCHING: ["markFound", "reunite", "share", "close"],
  SIGHTING_REPORTED: ["markSearching", "markFound", "reunite", "share", "close"],
  FOUND: ["reunite", "close"],
  REUNITED: ["close"],
  CLOSED: [],
};

export function LostPetIncidentDetailView({ petId, incidentId }: { petId: string; incidentId: string }) {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");

  const [incident, setIncident] = useState<LostPetIncidentDto | null>(null);
  const [sightings, setSightings] = useState<LostPetSightingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const when = (iso: string) => `${formatDay(iso.slice(0, 10), lang, { weekday: true })} ${new Intl.DateTimeFormat(fa ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(iso))}`;

  async function load() {
    setError(null);
    try {
      const [incidentData, sightingsData] = await Promise.all([lostPetService.get(petId, incidentId), lostPetService.listSightings(petId, incidentId)]);
      setIncident(incidentData);
      setSightings(sightingsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, incidentId]);

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

  if (error && !incident) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!incident || !sightings) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const availableActions = ACTIONS_BY_STATUS[incident.status] ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("detail.title", { name: incident.petName })}</h1>
        <StatusLabel tone={lostPetStatusTone(incident.status)}>{t(`status.${incident.status}`)}</StatusLabel>
      </div>

      <ContextSurface className="flex flex-col gap-2">
        {incident.primaryPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={incident.primaryPhotoUrl} alt={incident.petName} className="h-48 w-full rounded-md object-cover" />
        ) : null}
        <p className="text-body text-text-primary">{incident.description}</p>
        <p className="text-metadata text-text-secondary">{fa ? "محدودهٔ عمومی: " : "Public area: "}{incident.publicArea ?? (fa ? "ثبت نشده" : "Not set")}</p>
        {incident.lastKnownLocation ? <p className="text-metadata text-text-secondary">{fa ? "مکان دقیق (خصوصی): " : "Exact place (private): "}{incident.lastKnownLocation}</p> : null}
        {incident.lastSeenAt ? <p className="text-metadata text-text-secondary">{fa ? "آخرین مشاهده: " : "Last seen: "}{when(incident.lastSeenAt)}</p> : null}
        {incident.privateNotes ? <p className="text-metadata text-text-secondary">{t("detail.privateNotes", { notes: incident.privateNotes })}</p> : null}
      </ContextSurface>

      {["OPEN", "SEARCHING", "SIGHTING_REPORTED", "FOUND"].includes(incident.status) ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title">{fa ? "اشتراک صفحهٔ عمومی" : "Share the public page"}</h2>
          <p className="text-metadata text-text-secondary">{fa ? "صفحهٔ عمومی فقط محدودهٔ تقریبی، عکس و توضیحات عمومی را نشان می‌دهد." : "The public page shows only the approximate area, photo and public description."}</p>
          <ShareBar url={`/${lang}/lost-pets/${incident.id}`} text={fa ? `${incident.petName} گم شده است. اگر او را دیدید گزارش دهید.` : `${incident.petName} is lost. If you see them, please report it.`} />
        </ContextSurface>
      ) : null}

      {error ? <p className="text-body text-state-urgent">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {availableActions.includes("markSearching") ? (
          <Button variant="secondary" isLoading={isActing} onClick={() => runAction(() => lostPetService.markSearching(petId, incidentId))}>
            {t("detail.actions.markSearching")}
          </Button>
        ) : null}
        {availableActions.includes("markFound") ? (
          <Button variant="secondary" isLoading={isActing} onClick={() => runAction(() => lostPetService.markFound(petId, incidentId))}>
            {t("detail.actions.markFound")}
          </Button>
        ) : null}
        {availableActions.includes("reunite") ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => lostPetService.reunite(petId, incidentId))}>
            {t("detail.actions.reunite")}
          </Button>
        ) : null}
        {availableActions.includes("share") ? (
          <Button variant="secondary" isLoading={isActing} onClick={() => runAction(() => lostPetService.shareToCommunity(petId, incidentId))}>
            {t("detail.actions.share")}
          </Button>
        ) : null}
        {availableActions.includes("close") ? (
          <Button variant="ghost" isLoading={isActing} onClick={() => runAction(() => lostPetService.close(petId, incidentId))}>
            {t("detail.actions.close")}
          </Button>
        ) : null}
      </div>

      <h2 className="text-section-title text-text-primary">{t("detail.sightingsTitle")}</h2>
      {sightings.length === 0 ? (
        <EmptyState title={t("detail.sightingsEmpty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {sightings.map((sighting) => (
            <ContextSurface key={sighting.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-body text-text-primary">{when(sighting.seenAt)}</span>
                <StatusLabel tone={sighting.status === "ACCEPTED" ? "success" : sighting.status === "REJECTED" ? "neutral" : "attention"}>{t(`sightingStatus.${sighting.status}`)}</StatusLabel>
              </div>
              {sighting.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sighting.photoUrl} alt="" className="h-32 w-full rounded-md object-cover" />
              ) : null}
              {sighting.location ? <p className="text-metadata text-text-secondary">{sighting.location}</p> : null}
              {sighting.description ? <p className="text-body text-text-primary">{sighting.description}</p> : null}
              <p className="text-metadata text-text-secondary">{sighting.isAnonymous ? t("detail.anonymousReporter") : t("detail.knownReporter")}</p>
              {sighting.status === "SUBMITTED" ? (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" isLoading={isActing} onClick={() => runAction(() => lostPetService.reviewSighting(petId, incidentId, sighting.id, "ACCEPTED"))}>
                    {t("detail.acceptSighting")}
                  </Button>
                  <Button variant="ghost" size="sm" isLoading={isActing} onClick={() => runAction(() => lostPetService.reviewSighting(petId, incidentId, sighting.id, "REJECTED"))}>
                    {t("detail.rejectSighting")}
                  </Button>
                </div>
              ) : null}
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
