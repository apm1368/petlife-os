"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { TravelSearchResultItemDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { TravelResultCard } from "./TravelResultCard";

export function TravelFavoritesView() {
  const lang = useLocale() as RouteLocale;
  const t = useTranslations("travelResults");
  const [items, setItems] = useState<TravelSearchResultItemDto[] | null>(null);
  const [error, setError] = useState<"failed" | "offline" | "noAccess" | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await travelMarketService.favorites());
    } catch (err) {
      setError(navigator.onLine === false ? "offline" : err instanceof ApiError && (err.status === 401 || err.status === 403) ? "noAccess" : "failed");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const remove = async (id: string) => {
    setItems((x) => x?.filter((i) => i.id !== id) ?? null);
    try {
      await travelMarketService.unfavorite(id);
    } catch {
      load();
    }
  };
  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-page-title text-text-primary">{t("favoritesTitle")}</h1>
      {error ? <ErrorRecovery title={t(error === "noAccess" ? "favoritesAccessDeniedTitle" : error === "offline" ? "favoritesOfflineTitle" : "favoritesLoadErrorTitle")} message={t(error === "noAccess" ? "favoritesAccessDeniedMessage" : error === "offline" ? "favoritesOfflineMessage" : "favoritesLoadErrorMessage")} retryLabel={t("retry")} onRetry={load} /> : items === null ? <Skeleton className="h-56 w-full" aria-label={t("favoritesLoading")} /> : items.length === 0 ? (
        <EmptyState title={t("favoritesEmptyTitle")} description={t("favoritesEmptyDescription")} />
      ) : (
        <ul className="flex flex-col gap-4">{items.map((i) => <li key={i.id}><TravelResultCard item={i} href={`/${lang}/travel/stays/${i.id}`} onFavorite={() => void remove(i.id)} /></li>)}</ul>
      )}
    </div>
  );
}
