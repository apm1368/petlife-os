"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentDto, LostPetSightingDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { lostPetStatusTone } from "./lost-pet-status";

const ACTIONS_BY_STATUS: Record<string, ("markSearching" | "markFound" | "reunite" | "close" | "share")[]> = {
  OPEN: ["markSearching", "markFound", "share", "close"],
  SEARCHING: ["markFound", "share", "close"],
  SIGHTING_REPORTED: ["markSearching", "markFound", "share", "close"],
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
        {incident.lastKnownLocation ? <p className="text-metadata text-text-secondary">{t("detail.lastKnownLocation", { location: incident.lastKnownLocation })}</p> : null}
        {incident.privateNotes ? <p className="text-metadata text-text-secondary">{t("detail.privateNotes", { notes: incident.privateNotes })}</p> : null}
      </ContextSurface>

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
                <span className="text-body text-text-primary">{new Date(sighting.seenAt).toLocaleString()}</span>
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
