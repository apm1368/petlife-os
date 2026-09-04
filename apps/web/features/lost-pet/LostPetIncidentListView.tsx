"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { lostPetStatusTone } from "./lost-pet-status";

export function LostPetIncidentListView({ petId }: { petId: string }) {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");

  const [incidents, setIncidents] = useState<LostPetIncidentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setIncidents(await lostPetService.list(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!incidents) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("list.title")}</h1>
        <Link href={`/pets/${petId}/lost/report`}>
          <Button variant="primary">{t("list.reportButton")}</Button>
        </Link>
      </div>

      {incidents.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {incidents.map((incident) => (
            <Link key={incident.id} href={`/pets/${petId}/lost/${incident.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-body text-text-primary">{new Date(incident.createdAt).toLocaleDateString()}</span>
                  <StatusLabel tone={lostPetStatusTone(incident.status)}>{t(`status.${incident.status}`)}</StatusLabel>
                </div>
                <p className="text-metadata text-text-secondary">{incident.lastKnownLocation ?? t("list.noLocation")}</p>
                <p className="text-metadata text-text-secondary">{t("list.sightingsCount", { count: incident.sightingsCount })}</p>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
