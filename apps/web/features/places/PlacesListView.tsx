"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, Input, Select, Skeleton } from "@petlife/ui";
import { PetFriendlyPlaceCategory } from "@petlife/types";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { placesService } from "@/services/places.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { placeLocation, formatDistanceKm } from "@/features/places/place-format";

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
  const locale = useLocale() as "fa" | "en";
  const t = useTranslations("places");
  const tCommon = useTranslations("common");

  const [city, setCity] = useState("");
  const [category, setCategory] = useState<PetFriendlyPlaceCategory | "">("");
  const [places, setPlaces] = useState<PetFriendlyPlaceDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);

  async function load() {
    setError(null);
    setLoadError(null);
    try {
      const result = await placesService.list({ city: city.trim() || undefined, category: category || undefined, pageSize: 50 });
      setPlaces(result.items);
    } catch (err) {
      setLoadError(err);
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
          setError(apiErrorText(err, undefined, tCommon("genericError")));
        } finally {
          setIsSearchingNearby(false);
        }
      },
      () => setIsSearchingNearby(false),
    );
  }

  if (loadError) return <LoadFailure error={loadError} onRetry={load} />;

  return (
    <div className="flex flex-col gap-6">
      {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
      <header className="section-head">
        <div>
          <h1>{t("list.title")}</h1>
          <p>{t("list.subtitle")}</p>
        </div>
      </header>

      <div className="filter-band">
        <Input label={t("list.filtersCity")} value={city} onChange={(e) => setCity(e.target.value)} />
        <Select
          label={t("list.filtersCategory")}
          value={category}
          onChange={(e) => setCategory(e.target.value as PetFriendlyPlaceCategory | "")}
          options={[{ value: "", label: t("list.allCategories") }, ...CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))]}
        />
        <Button variant="secondary" onClick={load}>
          {t("list.search")}
        </Button>
        <Button variant="primary" isLoading={isSearchingNearby} onClick={searchNearMe}>
          {t("list.nearMe")}
        </Button>
      </div>

      {!places ? (
        <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />
      ) : places.length === 0 ? (
        <EmptyState title={t("list.empty")} />
      ) : (
        <ul className="row-list">
          {places.map((place) => (
            <li key={place.id}>
              <Link href={`/${locale}/places/${place.id}`} className="row-list__item">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{place.name}</span>
                  <span className="text-metadata text-text-secondary">
                    {placeLocation(place, locale)}
                    {place.distanceMeters !== null ? ` · ${t("detail.distance", { distance: formatDistanceKm(place.distanceMeters, locale) })}` : ""}
                  </span>
                  {place.status !== "VERIFIED" ? <span className="text-metadata text-state-attention">{t("detail.unverified")}</span> : null}
                </span>
                <span className="tag">{t(`category.${place.category}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
