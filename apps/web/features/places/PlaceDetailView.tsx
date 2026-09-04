"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { placesService } from "@/services/places.service";
import { ApiError } from "@/lib/api/client";

export function PlaceDetailView({ placeId }: { placeId: string }) {
  const t = useTranslations("places");
  const tCommon = useTranslations("common");

  const [place, setPlace] = useState<PetFriendlyPlaceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);

  async function load() {
    setError(null);
    try {
      setPlace(await placesService.get(placeId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  async function toggleFavorite(): Promise<void> {
    if (!place) return;
    setIsActing(true);
    setError(null);
    setRequiresAuth(false);
    try {
      if (place.isFavorited) {
        await placesService.removeFavorite(place.id);
      } else {
        await placesService.addFavorite(place.id);
      }
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setRequiresAuth(true);
      } else {
        setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      }
    } finally {
      setIsActing(false);
    }
  }

  if (error && !place) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!place) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{place.name}</h1>
        <StatusLabel tone={place.status === "VERIFIED" ? "success" : "neutral"}>{t(`category.${place.category}`)}</StatusLabel>
      </div>

      {place.status !== "VERIFIED" ? <p className="text-body text-state-urgent">{t("detail.unverified")}</p> : null}

      <ContextSurface className="flex flex-col gap-2">
        {place.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.imageUrls[0]} alt={place.name} className="h-48 w-full rounded-md object-cover" />
        ) : null}
        <p className="text-body text-text-primary">
          {place.address ?? `${place.city}, ${place.country}`}
        </p>
        {place.description ? <p className="text-body text-text-secondary">{place.description}</p> : null}
        <p className="text-metadata text-text-secondary">{place.indoorAllowed ? t("detail.indoorAllowed") : null}</p>
        <p className="text-metadata text-text-secondary">{place.outdoorAllowed ? t("detail.outdoorAllowed") : null}</p>
        {place.sizeRestrictions ? <p className="text-metadata text-text-secondary">{t("detail.sizeRestrictions", { restrictions: place.sizeRestrictions })}</p> : null}
        {place.petPolicy ? (
          <div>
            <h2 className="text-section-title text-text-primary">{t("detail.petPolicy")}</h2>
            <p className="text-body text-text-secondary">{place.petPolicy}</p>
          </div>
        ) : null}
        {place.verifiedAt ? <p className="text-metadata text-text-secondary">{t("detail.verifiedAt", { date: new Date(place.verifiedAt).toLocaleDateString() })}</p> : null}
      </ContextSurface>

      {error ? <p className="text-body text-state-urgent">{error}</p> : null}
      {requiresAuth ? <p className="text-body text-text-secondary">{t("favorites.signInPrompt")}</p> : null}

      <Button variant={place.isFavorited ? "ghost" : "primary"} isLoading={isActing} onClick={toggleFavorite}>
        {place.isFavorited ? t("detail.removeFavorite") : t("detail.addFavorite")}
      </Button>
    </div>
  );
}
