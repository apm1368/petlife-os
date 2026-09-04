"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { PetFriendlyPlaceCategory } from "@petlife/types";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { placesService } from "@/services/places.service";
import { ApiError } from "@/lib/api/client";

const CATEGORIES: PetFriendlyPlaceCategory[] = [
  PetFriendlyPlaceCategory.PARK,
  PetFriendlyPlaceCategory.CAFE,
  PetFriendlyPlaceCategory.RESTAURANT,
  PetFriendlyPlaceCategory.HOTEL,
  PetFriendlyPlaceCategory.STORE,
  PetFriendlyPlaceCategory.BEACH,
  PetFriendlyPlaceCategory.VENUE,
  PetFriendlyPlaceCategory.SERVICE,
  PetFriendlyPlaceCategory.OTHER,
];

/** Public directory — no guard by design; works fully for anonymous visitors (spec: "public browsing" for pet-friendly places must work without auth). */
export function PlacesListView() {
  const t = useTranslations("places");
  const tCommon = useTranslations("common");

  const [city, setCity] = useState("");
  const [category, setCategory] = useState<PetFriendlyPlaceCategory | "">("");
  const [places, setPlaces] = useState<PetFriendlyPlaceDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);

  async function load() {
    setError(null);
    try {
      const result = await placesService.list({ city: city.trim() || undefined, category: category || undefined, pageSize: 50 });
      setPlaces(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function searchNearMe(): void {
    if (!navigator.geolocation) return;
    setIsSearchingNearby(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await placesService.nearby({ latitude: position.coords.latitude, longitude: position.coords.longitude, category: category || undefined, pageSize: 50 });
          setPlaces(result.items);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : tCommon("genericError"));
        } finally {
          setIsSearchingNearby(false);
        }
      },
      () => setIsSearchingNearby(false),
    );
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("list.title")}</h1>
        <p className="text-body text-text-secondary">{t("list.subtitle")}</p>
      </div>

      <ContextSurface className="flex flex-wrap items-end gap-3">
        <Input label={t("list.filtersCity")} value={city} onChange={(e) => setCity(e.target.value)} />
        <Select
          label={t("list.filtersCategory")}
          value={category}
          onChange={(e) => setCategory(e.target.value as PetFriendlyPlaceCategory | "")}
          options={[{ value: "", label: t("list.allCategories") }, ...CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))]}
        />
        <Button variant="secondary" onClick={load}>
          {tCommon("retry")}
        </Button>
        <Button variant="primary" isLoading={isSearchingNearby} onClick={searchNearMe}>
          {t("list.nearMe")}
        </Button>
      </ContextSurface>

      {!places ? (
        <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />
      ) : places.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {places.map((place) => (
            <Link key={place.id} href={`/places/${place.id}`}>
              <ContextSurface className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-body text-text-primary">{place.name}</span>
                  <StatusLabel tone={place.status === "VERIFIED" ? "success" : "neutral"}>{t(`category.${place.category}`)}</StatusLabel>
                </div>
                <p className="text-metadata text-text-secondary">
                  {place.city}, {place.country}
                </p>
                {place.status !== "VERIFIED" ? <p className="text-metadata text-state-urgent">{t("detail.unverified")}</p> : null}
                {place.distanceMeters !== null ? <p className="text-metadata text-text-secondary">{t("detail.distance", { distance: (place.distanceMeters / 1000).toFixed(1) })}</p> : null}
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
