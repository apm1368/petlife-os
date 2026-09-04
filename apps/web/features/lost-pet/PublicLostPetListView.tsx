"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { LostPetIncidentPublicDto } from "@petlife/types";
import { lostPetService } from "@/services/lost-pet.service";
import { ApiError } from "@/lib/api/client";
import { lostPetStatusTone } from "./lost-pet-status";

export function PublicLostPetListView() {
  const t = useTranslations("lostPet");
  const tCommon = useTranslations("common");

  const [incidents, setIncidents] = useState<LostPetIncidentPublicDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setIncidents(await lostPetService.listPublic());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!incidents) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("public.list.title")}</h1>
        <p className="text-body text-text-secondary">{t("public.list.subtitle")}</p>
      </div>

      {incidents.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {incidents.map((incident) => (
            <Link key={incident.id} href={`/lost-pets/${incident.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                {incident.primaryPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={incident.primaryPhotoUrl} alt={incident.petName} className="h-40 w-full rounded-md object-cover" />
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-body text-text-primary">{incident.petName}</span>
                  <StatusLabel tone={lostPetStatusTone(incident.status)}>{t(`status.${incident.status}`)}</StatusLabel>
                </div>
                <p className="text-metadata text-text-secondary">{incident.lastKnownLocation ?? t("list.noLocation")}</p>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
