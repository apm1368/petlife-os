"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { placesService } from "@/services/places.service";
import { ApiError } from "@/lib/api/client";

/** Authenticated — favorites require auth (spec: "favorites-saved places" needs auth). */
export function PlacesFavoritesView() {
  const t = useTranslations("places");
  const tCommon = useTranslations("common");

  const [favorites, setFavorites] = useState<PetFriendlyPlaceDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setFavorites(await placesService.listFavorites());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!favorites) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("favorites.title")}</h1>
      {favorites.length === 0 ? (
        <EmptyState title={t("favorites.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {favorites.map((place) => (
            <Link key={place.id} href={`/places/${place.id}`}>
              <ContextSurface className="flex items-center justify-between">
                <span className="text-body text-text-primary">{place.name}</span>
                <StatusLabel tone="neutral">{t(`category.${place.category}`)}</StatusLabel>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
