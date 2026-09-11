"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { SupportNeedCategory, SupportNeedUrgency } from "@petlife/types";
import type { SupportNeedListingDto } from "@petlife/types";
import { supportNeedsService, type SupportNeedLocationDto } from "@/services/support-needs.service";
import { ApiError } from "@/lib/api/client";

const CATEGORIES: SupportNeedCategory[] = [
  SupportNeedCategory.FOOD,
  SupportNeedCategory.MEDICINE,
  SupportNeedCategory.VETERINARY_CARE,
  SupportNeedCategory.TEMPORARY_HOME,
  SupportNeedCategory.FOSTER,
  SupportNeedCategory.TRANSPORT,
  SupportNeedCategory.VOLUNTEER,
  SupportNeedCategory.EQUIPMENT,
  SupportNeedCategory.FINANCIAL,
  SupportNeedCategory.SHELTER_SUPPLIES,
  SupportNeedCategory.OTHER,
];

const URGENCIES: SupportNeedUrgency[] = [SupportNeedUrgency.NORMAL, SupportNeedUrgency.IMPORTANT, SupportNeedUrgency.URGENT, SupportNeedUrgency.CRITICAL];

/**
 * Restrained on purpose — the spec explicitly warns against making the whole
 * board red. NORMAL carries no badge at all, and only CRITICAL reaches the
 * strongest tone.
 */
export const URGENCY_TONE: Record<SupportNeedUrgency, "neutral" | "attention" | "higherConcern" | "urgent"> = {
  [SupportNeedUrgency.NORMAL]: "neutral",
  [SupportNeedUrgency.IMPORTANT]: "attention",
  [SupportNeedUrgency.URGENT]: "higherConcern",
  [SupportNeedUrgency.CRITICAL]: "urgent",
};

/**
 * The classifieds board. Public and fully usable anonymously — browsing,
 * searching and filtering never require a session; only publishing and
 * offering help do.
 */
export function SupportNeedsListView() {
  const t = useTranslations("supportNeeds");
  const tCommon = useTranslations("common");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<SupportNeedCategory | "">("");
  const [urgency, setUrgency] = useState<SupportNeedUrgency | "">("");
  const [city, setCity] = useState("");
  const [listings, setListings] = useState<SupportNeedListingDto[] | null>(null);
  const [locations, setLocations] = useState<SupportNeedLocationDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // `tCommon` is deliberately not a dependency: next-intl hands back a fresh
  // function each render, which would make this refetch in a loop.
  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await supportNeedsService.list({
        search: search.trim() || undefined,
        category: category || undefined,
        urgency: urgency || undefined,
        city: city || undefined,
        pageSize: 50,
      });
      setListings(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, urgency, city]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void supportNeedsService
      .listLocations()
      .then(setLocations)
      // A missing location list only costs the city filter its options; the board still works.
      .catch(() => setLocations([]));
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;

  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">{t("list.title")}</h1>
          <p className="text-body text-text-secondary">{t("list.subtitle")}</p>
        </div>
        <Link href="/animal-support/needs/new">
          <Button variant="primary">{t("list.publish")}</Button>
        </Link>
      </div>

      <ContextSurface className="flex flex-col gap-3">
        <Input label={t("list.searchLabel")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("list.searchPlaceholder")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            label={t("list.categoryLabel")}
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportNeedCategory | "")}
            options={[{ value: "", label: t("list.allCategories") }, ...CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))]}
          />
          <Select
            label={t("list.urgencyLabel")}
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as SupportNeedUrgency | "")}
            options={[{ value: "", label: t("list.allUrgencies") }, ...URGENCIES.map((value) => ({ value, label: t(`urgency.${value}`) }))]}
          />
          <Select
            label={t("list.cityLabel")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            options={[{ value: "", label: t("list.allCities") }, ...cities.map((value) => ({ value, label: value }))]}
          />
        </div>
      </ContextSurface>

      {!listings ? (
        <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />
      ) : listings.length === 0 ? (
        <div className="flex flex-col gap-3">
          <EmptyState title={t("list.empty")} />
          {/* An empty board is never a dead end: offer category discovery and the publish CTA. */}
          <ContextSurface className="flex flex-col gap-2">
            <span className="text-body text-text-primary">{t("list.emptyBrowseByCategory")}</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.slice(0, 6).map((value) => (
                <Button key={value} variant="ghost" onClick={() => { setCategory(value); setCity(""); setSearch(""); }}>
                  {t(`category.${value}`)}
                </Button>
              ))}
            </div>
            <Link href="/animal-support/needs/new" className="text-body text-brand-mint underline">
              {t("list.publish")}
            </Link>
          </ContextSurface>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {listings.map((listing) => (
            <Link key={listing.id} href={`/animal-support/needs/${listing.id}`}>
              <ContextSurface className="flex items-start gap-3">
                {listing.imageUrls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.imageUrls[0]} alt={listing.title} className="h-20 w-20 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                    <span className="text-metadata text-text-secondary">{t(`category.${listing.category}`)}</span>
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body text-text-primary">{listing.title}</span>
                    {listing.urgency !== SupportNeedUrgency.NORMAL ? (
                      <StatusLabel tone={URGENCY_TONE[listing.urgency]}>{t(`urgency.${listing.urgency}`)}</StatusLabel>
                    ) : null}
                    {listing.organizationVerified ? <StatusLabel tone="success">{t("list.verifiedOrganization")}</StatusLabel> : null}
                  </div>
                  <p className="text-metadata text-text-secondary">
                    {t(`category.${listing.category}`)} · {listing.city} · {new Date(listing.createdAt).toLocaleDateString()}
                  </p>
                  {listing.neededQuantity !== null ? (
                    <p className="text-metadata text-text-secondary">
                      {t("list.progress", { fulfilled: listing.fulfilledQuantity, needed: listing.neededQuantity, unit: listing.quantityUnit ?? "" })}
                    </p>
                  ) : null}
                </div>
              </ContextSurface>
            </Link>
          ))}
        </div>
      )}

      <Link href="/animal-support/needs/mine" className="text-body text-brand-mint underline">
        {t("list.myListings")}
      </Link>
    </div>
  );
}
