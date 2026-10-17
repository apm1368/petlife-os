"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { TravelSearchResultItemDto } from "@petlife/types";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { TravelResultCard } from "./TravelResultCard";

export function TravelFavoritesView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [items, setItems] = useState<TravelSearchResultItemDto[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    travelMarketService.favorites().then(setItems).catch(() => setError(true));
  }, []);
  useEffect(load, [load]);
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
      <h1 className="text-page-title text-text-primary">{fa ? "اقامتگاه‌های ذخیره‌شده" : "Saved stays"}</h1>
      {error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={load} /> : items === null ? <Skeleton className="h-56" /> : items.length === 0 ? (
        <EmptyState title={fa ? "هنوز اقامتگاهی ذخیره نکرده‌اید" : "No saved stays yet"} description={fa ? "با نماد قلب در نتایج جستجو، اقامتگاه‌ها را ذخیره کنید." : "Tap the heart on a search result to save it."} />
      ) : (
        <ul className="flex flex-col gap-4">{items.map((i) => <li key={i.id}><TravelResultCard item={i} href={`/${lang}/travel/stays/${i.id}`} onFavorite={() => void remove(i.id)} /></li>)}</ul>
      )}
    </div>
  );
}
