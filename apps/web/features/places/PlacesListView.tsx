"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, Coffee, EmptyState, Hotel, House, Input, MapPin, Select, Skeleton, ShoppingBag, Stethoscope, Trees, UtensilsCrossed, Waves, ChevronLeft, ChevronRight } from "@petlife/ui";
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

const CATEGORY_ICON: Partial<Record<PetFriendlyPlaceCategory, typeof MapPin>> = {
  PARK: Trees, CAFE: Coffee, RESTAURANT: UtensilsCrossed, HOTEL: Hotel, STORE: ShoppingBag, BEACH: Waves, SERVICE: Stethoscope, VENUE: House,
};
const SPECIES: Record<string, [string, string]> = { DOG: ["سگ", "Dogs"], CAT: ["گربه", "Cats"], BIRD: ["پرنده", "Birds"], RABBIT: ["خرگوش", "Rabbits"], RODENT: ["جونده", "Rodents"], FISH: ["ماهی", "Fish"], REPTILE: ["خزنده", "Reptiles"], OTHER: ["سایر", "Other"] };

/** Only what the place has actually stated — an unstated rule is left out, never shown as yes/no. */
function placeRules(place: PetFriendlyPlaceDto, fa: boolean): string[] {
  const ix = fa ? 0 : 1;
  const rules: string[] = [];
  if (place.speciesAllowed.length) rules.push(place.speciesAllowed.map((s) => SPECIES[s]?.[ix] ?? s).join(fa ? "، " : ", "));
  if (place.indoorAllowed && place.outdoorAllowed) rules.push(fa ? "داخل و فضای باز" : "Indoors and outdoors");
  else if (place.indoorAllowed) rules.push(fa ? "داخل سالن" : "Indoors");
  else if (place.outdoorAllowed) rules.push(fa ? "فقط فضای باز" : "Outdoors only");
  if (place.leashRequired === true) rules.push(fa ? "قلاده الزامی" : "Leash required");
  if (place.leashRequired === false) rules.push(fa ? "بدون قلاده مجاز" : "Off-leash allowed");
  if (place.waterAvailable) rules.push(fa ? "آب برای حیوان" : "Water for pets");
  if (place.petArea) rules.push(fa ? "محوطه‌ی ویژه‌ی حیوان" : "Pet area");
  return rules;
}

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
    if (!navigator.geolocation) { setError(locale === "fa" ? "مرورگر شما موقعیت مکانی را پشتیبانی نمی‌کند؛ شهر را وارد کنید." : "Your browser can't share location; enter a city instead."); return; }
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
      () => {
        setIsSearchingNearby(false);
        setError(locale === "fa" ? "اجازه‌ی دسترسی به موقعیت داده نشد؛ شهر را وارد کنید یا دسترسی را در مرورگر فعال کنید." : "Location permission was not given; enter a city or allow location in your browser.");
      },
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
        <ul className="place-rows">
          {places.map((place) => {
            const Icon = CATEGORY_ICON[place.category] ?? MapPin;
            const rules = placeRules(place, locale === "fa");
            const Go = locale === "fa" ? ChevronLeft : ChevronRight;
            return (
              <li key={place.id}>
                <Link href={`/${locale}/places/${place.id}`} className="place-row">
                  <span className="place-row__icon" aria-hidden="true"><Icon size={20} /></span>
                  <span className="place-row__text">
                    <span className="place-row__name">{place.name}</span>
                    <span className="place-row__meta">
                      {t(`category.${place.category}`)} · {placeLocation(place, locale)}
                      {place.distanceMeters !== null ? ` · ${t("detail.distance", { distance: formatDistanceKm(place.distanceMeters, locale) })}` : ""}
                    </span>
                    {rules.length ? <span className="place-row__rules">{rules.map((r) => <span key={r} className="tag">{r}</span>)}</span> : null}
                    {place.status !== "VERIFIED" ? <span className="text-metadata text-state-attention">{t("detail.unverified")}</span> : null}
                  </span>
                  <Go size={18} aria-hidden="true" className="place-row__go" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
