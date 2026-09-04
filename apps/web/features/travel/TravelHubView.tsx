"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { TripDto } from "@petlife/types";
import { travelService } from "@/services/travel.service";
import { ApiError } from "@/lib/api/client";
import { tripStatusTone } from "./travel-status";

export function TravelHubView({ petId }: { petId: string }) {
  const t = useTranslations("travel");
  const tCommon = useTranslations("common");

  const [trips, setTrips] = useState<TripDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setTrips(await travelService.list(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!trips) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("hub.title")}</h1>
        <Link href={`/pets/${petId}/travel/new`}>
          <Button variant="primary">{t("hub.newTrip")}</Button>
        </Link>
      </div>

      <Link href={`/pets/${petId}/travel/passport`}>
        <ContextSurface className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("hub.passportReadinessLink")}</span>
          <span aria-hidden="true">→</span>
        </ContextSurface>
      </Link>

      <Link href="/places">
        <ContextSurface className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("hub.placesLink")}</span>
          <span aria-hidden="true">→</span>
        </ContextSurface>
      </Link>

      <Link href="/insurance">
        <ContextSurface className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("hub.insuranceLink")}</span>
          <span aria-hidden="true">→</span>
        </ContextSurface>
      </Link>

      {trips.length === 0 ? (
        <EmptyState title={t("hub.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/pets/${petId}/travel/${trip.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-body text-text-primary">
                    {trip.originCountry} → {trip.destinationCountry}
                  </span>
                  <StatusLabel tone={tripStatusTone(trip.status)}>{t(`status.${trip.status}`)}</StatusLabel>
                </div>
                <p className="text-metadata text-text-secondary">{new Date(trip.departAt).toLocaleDateString()}</p>
                <p className="text-metadata text-text-secondary">{t("hub.requirementsCount", { count: trip.requirementsCount })}</p>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
