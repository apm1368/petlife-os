"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, MapPin, Sheet, Skeleton, SlidersHorizontal } from "@petlife/ui";
import type { TravelListingType, TravelSearchResultDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { localizeDigits } from "@/lib/date/jalali";
import { travelMarketService, type TravelSearchParams, type TravelSort } from "@/services/travel-marketplace.service";
import { useSessionStore } from "@/stores/session-store";
import { amenityLabel, listingTypeLabel, money, STAY_TYPES } from "./labels";
import { TravelResultCard } from "./TravelResultCard";
import { searchStateFromParams, TravelSearchForm } from "./TravelSearchForm";
import { formatStayRange } from "@/features/shared/date-picker/DateRangePicker";
import { readChosenPetIds, writeChosenPetIds } from "./use-my-pets";

const SORTS: { value: TravelSort; fa: string; en: string }[] = [
  { value: "RECOMMENDED", fa: "پیشنهادی", en: "Recommended" },
  { value: "BEST_PET_MATCH", fa: "بیشترین تطابق با حیوان", en: "Best pet match" },
  { value: "PRICE_ASC", fa: "ارزان‌ترین", en: "Lowest price" },
  { value: "PRICE_DESC", fa: "گران‌ترین", en: "Highest price" },
  { value: "RATING", fa: "بالاترین امتیاز", en: "Top rated" },
];

const FILTER_KEYS = ["types", "minPrice", "maxPrice", "minRating", "verified", "noPetFee", "freeCancellation", "instantBooking", "amenities"] as const;

/**
 * TRAVEL DISCOVERY PATTERN — results. The URL is the state (shareable, back-button safe), except
 * private pet ids which stay in this browser. Prices are whole-stay totals from the server when
 * dates are set. The map is not faked: without a map provider the page says so and keeps the list.
 */
export function TravelResultsView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const session = useSessionStore((s) => s.status);
  const [data, setData] = useState<TravelSearchResultDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [compare, setCompare] = useState<string[]>([]);
  const search = searchStateFromParams(new URLSearchParams(params.toString()));
  const sort = (params.get("sort") as TravelSort | null) ?? "RECOMMENDED";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const query = useMemo<TravelSearchParams>(() => {
    const list = (k: string) => (params.get(k) ? params.get(k)!.split(",").filter(Boolean) : undefined);
    const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
    return {
      city: search.city || undefined,
      checkIn: search.checkIn ?? undefined,
      checkOut: search.checkOut ?? undefined,
      species: search.species || undefined,
      petCount: search.species ? search.petCount : undefined,
      petWeightKg: search.petWeightKg ? Number(search.petWeightKg) : undefined,
      types: list("types") as TravelListingType[] | undefined,
      minPrice: num("minPrice"),
      maxPrice: num("maxPrice"),
      minRating: num("minRating"),
      verified: params.get("verified") === "1",
      noPetFee: params.get("noPetFee") === "1",
      freeCancellation: params.get("freeCancellation") === "1",
      instantBooking: params.get("instantBooking") === "1",
      amenities: list("amenities"),
      sort,
      page,
      pageSize: 12,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);

  const load = useCallback(async () => {
    setState("loading");
    const petIds = session === "authenticated" ? readChosenPetIds() : [];
    try {
      setData(await travelMarketService.search(petIds.length ? { ...query, species: undefined, petCount: undefined, petWeightKg: undefined, petIds } : query));
      setState("ready");
    } catch (e) {
      // A remembered pet may have been removed from the household: forget it and retry anonymously.
      if (petIds.length && e instanceof ApiError && e.status === 404) {
        writeChosenPetIds([]);
        try {
          setData(await travelMarketService.search(query));
          setState("ready");
          return;
        } catch {
          /* fall through */
        }
      }
      setState("error");
    }
  }, [query, session]);

  useEffect(() => {
    if (session === "idle" || session === "loading") return;
    void load();
  }, [load, session]);

  const setParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete("page");
    router.push(`${pathname}?${next}`, { scroll: true });
  };

  const toggleFavorite = async (id: string, on: boolean) => {
    if (session !== "authenticated") {
      router.push(`/${lang}/welcome?returnTo=${encodeURIComponent(`${pathname}?${params}`)}`);
      return;
    }
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, favorited: !on } : i)) } : d));
    try {
      await (on ? travelMarketService.unfavorite(id) : travelMarketService.favorite(id));
    } catch {
      setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, favorited: on } : i)) } : d));
    }
  };

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const detailHref = (id: string) => {
    const q = new URLSearchParams();
    if (search.checkIn && search.checkOut) {
      q.set("checkIn", search.checkIn);
      q.set("checkOut", search.checkOut);
    }
    return `/${lang}/travel/stays/${id}${q.toString() ? `?${q}` : ""}`;
  };
  const summary = [search.city || (fa ? "همه مقصدها" : "All destinations"), search.checkIn && search.checkOut ? formatStayRange({ start: search.checkIn, end: search.checkOut }, lang) : fa ? "بدون تاریخ" : "Any dates"].join(" · ");

  const filters = <TravelFilters params={params} facets={data?.facets ?? null} onApply={(patch) => { setParams(patch); setFiltersOpen(false); }} />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page-title text-text-primary">{search.city ? (fa ? `اقامت در ${search.city}` : `Stays in ${search.city}`) : fa ? "اقامتگاه‌های دوستدار حیوانات" : "Pet-friendly stays"}</h1>
          <p className="text-metadata text-text-secondary">{summary}</p>
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>{fa ? "تغییر جستجو" : "Edit search"}</Button>
      </div>

      {!search.checkIn ? <p role="note" className="rounded-md bg-surface-subtle p-3 text-sm text-text-secondary">{fa ? "برای دیدن قیمت کل اقامت و موجودی واقعی، تاریخ ورود و خروج را انتخاب کنید." : "Add check-in and check-out dates to see whole-stay prices and real availability."}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setFiltersOpen(true)} className="lg:hidden">
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          {fa ? "فیلترها" : "Filters"}{activeFilters ? ` (${localizeDigits(activeFilters, lang)})` : ""}
        </Button>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          {fa ? "مرتب‌سازی" : "Sort"}
          <select value={sort} onChange={(e) => setParams({ sort: e.target.value === "RECOMMENDED" ? null : e.target.value })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2 text-text-primary">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{fa ? s.fa : s.en}</option>)}
          </select>
        </label>
        <div role="group" aria-label={fa ? "نمایش" : "View"} className="ms-auto flex rounded-full border border-border-subtle p-0.5">
          {(["list", "map"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-10 rounded-full px-4 text-sm ${view === v ? "bg-surface-subtle text-text-primary" : "text-text-secondary"}`}>
              {v === "list" ? (fa ? "فهرست" : "List") : fa ? "نقشه" : "Map"}
            </button>
          ))}
        </div>
      </div>
      {sort === "BEST_PET_MATCH" ? <p className="text-metadata text-text-secondary">{fa ? "«بیشترین تطابق» یعنی ابتدا اقامتگاه‌هایی که همهٔ قوانین اعلام‌شده‌شان با حیوان شما جور است، سپس آن‌هایی که اطلاعات بیشتری لازم دارند؛ در هر گروه بر اساس امتیاز و قیمت." : "“Best pet match” lists stays whose stated rules all fit your pet first, then those needing more information; within each group by rating and price."}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label={fa ? "فیلترها" : "Filters"}>{filters}</aside>
        <section aria-live="polite" aria-busy={state === "loading"} className="flex min-w-0 flex-col gap-4">
          {view === "map" ? (
            <div role="status" className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong p-6 text-center">
              <MapPin aria-hidden className="h-8 w-8 text-text-secondary" />
              <p className="font-bold text-text-primary">{fa ? "نقشه در حال حاضر در دسترس نیست" : "The map is not available right now"}</p>
              <p className="max-w-md text-sm text-text-secondary">{fa ? "سرویس نقشه هنوز فعال نشده است. نتایج همین جستجو در فهرست زیر آمده و فاصله‌ها (در صورت وجود) کنار هر اقامتگاه نوشته شده‌اند." : "No map service is connected yet. The same results are listed below, with distances shown where known."}</p>
            </div>
          ) : null}
          {state === "loading" ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)
          ) : state === "error" ? (
            <ErrorRecovery title={fa ? "نتایج بارگیری نشد" : "Results could not be loaded"} message={fa ? "اتصال را بررسی کنید و دوباره تلاش کنید." : "Check your connection and try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void load()} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title={fa ? "اقامتگاهی با این شرایط پیدا نشد" : "No stays match these choices"}
              description={fa ? "تاریخ‌ها یا فیلترها را تغییر دهید. اقامتگاه‌هایی که قوانینشان با حیوان شما مغایرت دارد یا در این تاریخ‌ها پر هستند نمایش داده نمی‌شوند." : "Try other dates or fewer filters. Stays that are full on these dates, or whose stated rules clearly don't fit your pet, are not shown."}
              actionLabel={activeFilters ? (fa ? "پاک کردن فیلترها" : "Clear filters") : undefined}
              onAction={activeFilters ? () => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))) : undefined}
            />
          ) : (
            <>
              <p className="text-metadata text-text-secondary">{fa ? `${localizeDigits(data.total, "fa")} اقامتگاه` : `${data.total} stay${data.total === 1 ? "" : "s"}`}</p>
              <ul className="flex flex-col gap-4">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <TravelResultCard
                      item={item}
                      href={detailHref(item.id)}
                      onFavorite={() => void toggleFavorite(item.id, item.favorited)}
                      compareOn={compare.includes(item.id)}
                      compareDisabled={compare.length >= 3}
                      onCompare={() => setCompare((c) => (c.includes(item.id) ? c.filter((x) => x !== item.id) : [...c, item.id]))}
                    />
                  </li>
                ))}
              </ul>
              {data.total > data.pageSize ? (
                <nav aria-label={fa ? "صفحه‌ها" : "Pages"} className="flex items-center justify-center gap-3">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, false)}>{fa ? "قبلی" : "Previous"}</Button>
                  <span className="text-sm text-text-secondary">{localizeDigits(page, lang)} / {localizeDigits(Math.ceil(data.total / data.pageSize), lang)}</span>
                  <Button variant="secondary" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setParams({ page: String(page + 1) }, false)}>{fa ? "بعدی" : "Next"}</Button>
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>

      {compare.length > 0 ? (
        <div className="sticky bottom-3 z-10 mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-full border border-border-subtle bg-surface-elevated px-4 py-2 shadow-lg" role="region" aria-label={fa ? "مقایسه" : "Compare"}>
          <span className="text-sm text-text-primary">{fa ? `${localizeDigits(compare.length, "fa")} از ۳ برای مقایسه` : `${compare.length} of 3 to compare`}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCompare([])}>{fa ? "پاک کردن" : "Clear"}</Button>
            {compare.length >= 2 ? (
              <Link className="inline-flex min-h-10 items-center rounded-full bg-brand-natural px-4 text-sm font-bold text-text-inverse" href={`/${lang}/travel/compare?ids=${compare.join(",")}${search.checkIn && search.checkOut ? `&checkIn=${search.checkIn}&checkOut=${search.checkOut}` : ""}`}>{fa ? "مقایسه" : "Compare"}</Link>
            ) : <span className="text-metadata text-text-secondary">{fa ? "حداقل ۲ مورد" : "Pick at least 2"}</span>}
          </div>
        </div>
      ) : null}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={fa ? "فیلترها" : "Filters"}>{filters}</Sheet>
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={fa ? "تغییر جستجو" : "Edit search"}>
        <TravelSearchForm compact initial={search} onSubmitted={() => setEditOpen(false)} />
      </Sheet>
    </div>
  );
}

function TravelFilters({ params, facets, onApply }: { params: URLSearchParams | ReturnType<typeof useSearchParams>; facets: TravelSearchResultDto["facets"] | null; onApply: (patch: Record<string, string | null>) => void }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [types, setTypes] = useState<string[]>(params.get("types")?.split(",").filter(Boolean) ?? []);
  const [amenities, setAmenities] = useState<string[]>(params.get("amenities")?.split(",").filter(Boolean) ?? []);
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") ? String(Math.round(Number(params.get("maxPrice")) / 10)) : "");
  const [minRating, setMinRating] = useState(params.get("minRating") ?? "");
  const [flags, setFlags] = useState<Record<string, boolean>>({ verified: params.get("verified") === "1", noPetFee: params.get("noPetFee") === "1", freeCancellation: params.get("freeCancellation") === "1", instantBooking: params.get("instantBooking") === "1" });
  const typeOptions = facets?.types.length ? facets.types.map((t) => t.type) : STAY_TYPES;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const FLAG_LABEL: Record<string, [string, string]> = { freeCancellation: ["لغو رایگان", "Free cancellation"], noPetFee: ["بدون هزینهٔ حیوان", "No pet fee"], instantBooking: ["رزرو فوری", "Instant booking"], verified: ["فقط تأییدشده", "Verified only"] };
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); onApply({ types: types.join(",") || null, amenities: amenities.join(",") || null, maxPrice: maxPrice ? String(Number(maxPrice) * 10) : null, minRating: minRating || null, ...Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v ? "1" : null])) }); }}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold text-text-primary">{fa ? "شرایط" : "Conditions"}</legend>
        {Object.keys(FLAG_LABEL).map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" className="h-5 w-5" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />
            {FLAG_LABEL[k]![fa ? 0 : 1]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold text-text-primary">{fa ? "نوع اقامتگاه" : "Stay type"}</legend>
        {typeOptions.map((t) => (
          <label key={t} className="flex min-h-11 items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" className="h-5 w-5" checked={types.includes(t)} onChange={() => setTypes(toggle(types, t))} />
            {listingTypeLabel(t, lang)}
            {facets ? <span className="text-metadata text-text-secondary">({localizeDigits(facets.types.find((f) => f.type === t)?.count ?? 0, lang)})</span> : null}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        <span className="font-bold">{fa ? "حداکثر قیمت کل (تومان)" : "Maximum total (Toman)"}</span>
        <input inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, "").slice(0, 12))} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-3" placeholder={facets?.priceRange ? money(facets.priceRange.max, lang) : ""} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        <span className="font-bold">{fa ? "حداقل امتیاز" : "Minimum rating"}</span>
        <select value={minRating} onChange={(e) => setMinRating(e.target.value)} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
          <option value="">{fa ? "همه" : "Any"}</option>
          {["3", "4", "4.5"].map((r) => <option key={r} value={r}>{localizeDigits(r, lang)}+</option>)}
        </select>
      </label>
      {facets?.amenities.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold text-text-primary">{fa ? "امکانات" : "Amenities"}</legend>
          {facets.amenities.slice(0, 10).map((a) => (
            <label key={a.key} className="flex min-h-11 items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" className="h-5 w-5" checked={amenities.includes(a.key)} onChange={() => setAmenities(toggle(amenities, a.key))} />
              {amenityLabel(a.key, lang)} <span className="text-metadata text-text-secondary">({localizeDigits(a.count, lang)})</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button type="submit">{fa ? "اعمال فیلترها" : "Apply filters"}</Button>
    </form>
  );
}
