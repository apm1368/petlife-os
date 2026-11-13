"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, ChevronLeft, ChevronRight, Clock3, EmptyState, ErrorRecovery, Heart, House, LocateFixed, MapPin, Search, Sheet, SlidersHorizontal, Skeleton, Star, X } from "@petlife/ui";
import { discoveryService, type DiscoveryQuery, type DiscoverySort, type ProviderDiscoveryResult } from "@/services/discovery.service";
import { useSessionStore } from "@/stores/session-store";
import { categoryLabel, providerTypeLabel } from "./labels";
import { formatCount } from "@/lib/number/format-number";
import { DateField } from "@/features/shared/date-picker/DateField";
import { DiscoveryPage } from "./DiscoveryPage";
import type { RouteLocale } from "@/lib/i18n/config";
import { serviceCategorySlug } from "@/lib/services/category-slug";
import { placeName } from "@/lib/i18n/iran-places";

const SORTS: DiscoverySort[] = ["RECOMMENDED", "EARLIEST", "NEAREST", "TOP_RATED", "LOWEST_PRICE"];

/** The category routes that exist; "all" is the search route. */
const CATEGORY_NAV = ["VET", "GROOMING", "TRAINING", "WALKING", "SITTING", "BOARDING", "PET_TAXI"] as const;

const VET_SPECIALTIES = ["LAB_TEST", "IMAGING_STUDY", "DENTAL_CARE", "REHAB_SESSION", "NUTRITION_CONSULT", "VACCINATION"] as const;

/** Query keys the filter rail owns — "clear all" removes these and keeps nothing else but the search text. */
const FILTER_KEYS = ["city", "date", "species", "homeVisit", "minRating", "maxPrice", "serviceType", "lat", "lng"] as const;

function readQuery(params: URLSearchParams, category?: string): DiscoveryQuery {
  const num = (key: string) => (params.get(key) ? Number(params.get(key)) : undefined);
  return {
    category,
    q: params.get("q") ?? undefined,
    city: params.get("city") ?? undefined,
    serviceType: params.get("serviceType") ?? undefined,
    species: (params.get("species") as "DOG" | "CAT" | null) ?? undefined,
    homeVisit: params.get("homeVisit") === "true" || undefined,
    minRating: num("minRating"),
    maxPrice: num("maxPrice"),
    date: params.get("date") ?? undefined,
    lat: num("lat"),
    lng: num("lng"),
    sort: (params.get("sort") as DiscoverySort | null) ?? "RECOMMENDED",
  };
}

/**
 * DISCOVERY PATTERN (services + vets): a compact header with search, the category strip, then a
 * filter rail beside a single result list on desktop; on phones the same filters open in a sheet
 * that reports the live result count. Every filter is a real API parameter and every active one
 * is listed above the results with its own remove control.
 */
export function ProviderDiscoveryView({ category }: { category?: string }) {
  const tTaxi = useTranslations("petTaxi.member");
  const locale = useLocale() as RouteLocale;
  const fa = locale === "fa";
  const t = useTranslations("providerDiscovery");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sessionStatus = useSessionStore((s) => s.status);
  const query = useMemo(() => readQuery(new URLSearchParams(params.toString()), category), [params, category]);
  const [results, setResults] = useState<ProviderDiscoveryResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cities, setCities] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [text, setText] = useState(query.q ?? "");
  const [sheet, setSheet] = useState(false);
  /** Covers that failed to load (a moved file, an expired upload) fall back to the monogram, never a broken image. */
  const [brokenCovers, setBrokenCovers] = useState<Set<string>>(() => new Set());

  const setParam = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const load = useCallback(async () => {
    setError(false);
    setResults(null);
    try {
      const page = await discoveryService.search(query);
      setResults(page.items);
      setTotal(page.total ?? page.items.length);
    } catch {
      setError(true);
    }
  }, [query]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    void discoveryService.cities().then(setCities).catch(() => setCities([]));
  }, []);
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    void discoveryService.favorites().then((rows) => setFavorites(new Set(rows.map((r) => r.id)))).catch(() => undefined);
  }, [sessionStatus]);

  async function toggleFavorite(id: string) {
    if (sessionStatus !== "authenticated") {
      router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(`${pathname}?${params.toString()}`)}`);
      return;
    }
    const saved = favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (saved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      if (saved) await discoveryService.unfavorite(id);
      else await discoveryService.favorite(id);
    } catch {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (saved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setLocating("denied");
      return;
    }
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating("idle");
        setParam({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4), sort: "NEAREST" });
      },
      () => setLocating("denied"),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "ar" ? "ar" : locale === "nl" ? "nl-NL" : "en-GB";
  const categoryName = (value: string) => t.has(`categories.${value}`) ? t(`categories.${value}`) : categoryLabel(value, fa);
  const providerName = (value: string) => t.has(`providerTypes.${value}`) ? t(`providerTypes.${value}`) : providerTypeLabel(value, fa);
  const formatPrice = (amountRial: number) => `${Math.round(amountRial / 10).toLocaleString(dateLocale)} ${t("currencyUnit")}`;
  const fmtTime = (iso: string) => new Intl.DateTimeFormat(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(iso));
  const title = category ? categoryName(category) : t("allServices");
  const speciesLabel = (s: "DOG" | "CAT") => t(`species.${s}`);
  const navQuery = (() => {
    const next = new URLSearchParams(params.toString());
    next.delete("serviceType");
    return next.toString() ? `?${next}` : "";
  })();

  const active: { key: string; label: string; clear: Record<string, undefined> }[] = [
    ...(query.q ? [{ key: "q", label: `«${query.q}»`, clear: { q: undefined } }] : []),
    ...(query.city ? [{ key: "city", label: query.city, clear: { city: undefined } }] : []),
    ...(query.date ? [{ key: "date", label: new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${query.date}T12:00:00Z`)), clear: { date: undefined } }] : []),
    ...(query.species ? [{ key: "species", label: speciesLabel(query.species), clear: { species: undefined } }] : []),
    ...(query.homeVisit ? [{ key: "homeVisit", label: t("filters.homeVisit"), clear: { homeVisit: undefined } }] : []),
    ...(query.minRating ? [{ key: "minRating", label: t("filters.ratedFourPlus"), clear: { minRating: undefined } }] : []),
    ...(query.maxPrice ? [{ key: "maxPrice", label: t("filters.upTo", { amount: formatPrice(query.maxPrice) }), clear: { maxPrice: undefined } }] : []),
    ...(query.serviceType ? [{ key: "serviceType", label: t.has(`specialties.${query.serviceType}`) ? t(`specialties.${query.serviceType}`) : query.serviceType, clear: { serviceType: undefined } }] : []),
    ...(query.lat !== undefined ? [{ key: "near", label: t("filters.nearMe"), clear: { lat: undefined, lng: undefined } }] : []),
  ];
  const filterCount = active.filter((a) => a.key !== "q").length;
  const clearAll = () => {
    setText("");
    setParam(Object.fromEntries([...FILTER_KEYS, "q"].map((k) => [k, undefined])));
  };

  const filters = (
    <div className="disc-filters">
      <label className="disc-field">
        <span>{t("filters.city")}</span>
        <select value={query.city ?? ""} onChange={(e) => setParam({ city: e.target.value || undefined })}>
          <option value="">{t("filters.allCities")}</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <DateField label={t("filters.date")} placeholder={t("filters.anyDay")} value={query.date ?? ""} min={new Date().toISOString().slice(0, 10)} onChange={(iso) => setParam({ date: iso || undefined })} />
      <fieldset className="disc-field">
        <legend>{t("filters.pet")}</legend>
        <div className="disc-segment">
          {(["DOG", "CAT"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={query.species === s} onClick={() => setParam({ species: query.species === s ? undefined : s })}>{speciesLabel(s)}</button>
          ))}
        </div>
      </fieldset>
      <label className="disc-field">
        <span>{t("filters.maxPrice")}</span>
        <input key={query.maxPrice ?? "none"} inputMode="numeric" defaultValue={query.maxPrice ? String(query.maxPrice / 10) : ""} onBlur={(e) => setParam({ maxPrice: e.target.value ? String(Number(e.target.value.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) * 10) : undefined })} />
      </label>
      <div className="disc-toggles">
        <button type="button" className="disc-toggle" aria-pressed={Boolean(query.homeVisit)} onClick={() => setParam({ homeVisit: query.homeVisit ? undefined : "true" })}>
          <House size={16} aria-hidden="true" /> {t("filters.homeVisit")}
        </button>
        <button type="button" className="disc-toggle" aria-pressed={query.minRating === 4} onClick={() => setParam({ minRating: query.minRating === 4 ? undefined : "4" })}>
          <Star size={16} aria-hidden="true" /> {t("filters.fourStarsAndUp")}
        </button>
        <button type="button" className="disc-toggle" aria-pressed={query.lat !== undefined} onClick={() => (query.lat !== undefined ? setParam({ lat: undefined, lng: undefined }) : locateMe())} aria-busy={locating === "busy"}>
          <LocateFixed size={16} aria-hidden="true" /> {t("filters.nearMe")}
        </button>
      </div>
      {locating === "denied" ? <p role="status" className="disc-note">{t("filters.locationUnavailable")}</p> : null}
      {category === "PET_TAXI" ? (
        <p className="disc-note">
          <Link href={`/${locale}/pet-taxi`} className="font-semibold underline">
            {tTaxi("requestNow")}
          </Link>{" "}
          · {tTaxi("requestNowHint")}
        </p>
      ) : null}
      {category === "VET" ? (
        <fieldset className="disc-field">
          <legend>{t("filters.veterinaryService")}</legend>
          <div className="disc-chips">
            {VET_SPECIALTIES.map((type) => (
              <button key={type} type="button" aria-pressed={query.serviceType === type} onClick={() => setParam({ serviceType: query.serviceType === type ? undefined : type })}>
                {t(`specialties.${type}`)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );

  const Go = fa ? ChevronLeft : ChevronRight;

  return (
    <DiscoveryPage kind="services"><div className="disc">
      <header className="disc-head">
        <div className="disc-head__text">
          <p className="disc-head__eyebrow"><BadgeCheck size={16} aria-hidden="true" />{t("verifiedOnly")}</p>
          <h1>{title}</h1>
          <p>{t("intro")}</p>
        </div>
        <form
          className="disc-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setParam({ q: text.trim() || undefined });
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input value={text} onChange={(event) => setText(event.target.value)} aria-label={t("search.label")} placeholder={t("search.placeholder")} />
          <button type="submit">{t("search.submit")}</button>
        </form>
      </header>

      <nav className="disc-cats" aria-label={t("serviceCategories")}>
        <Link href={`/${locale}/services/search${navQuery}`} aria-current={!category ? "page" : undefined}>{t("all")}</Link>
        {CATEGORY_NAV.map((c) => (
          <Link key={c} href={`/${locale}/services/${serviceCategorySlug(c)}${navQuery}`} aria-current={category === c ? "page" : undefined}>{categoryName(c)}</Link>
        ))}
      </nav>

      <div className="disc-layout">
        <aside className="disc-rail" aria-label={t("filters.title")}>
          <div className="disc-rail__head">
            <h2>{t("filters.title")}</h2>
            {filterCount ? <button type="button" onClick={clearAll}>{t("filters.clear")}</button> : null}
          </div>
          {sheet ? null : filters}
        </aside>

        <section className="disc-results" aria-label={t("results")}>
          <div className="disc-toolbar">
            <p className="disc-count" aria-live="polite">
              {results ? t("providerCount", { count: total }) : t("searching")}
            </p>
            <label className="disc-sort">
              <span>{t("sort.label")}</span>
              <select aria-label={t("sort.label")} value={query.sort} onChange={(e) => (e.target.value === "NEAREST" && query.lat === undefined ? locateMe() : setParam({ sort: e.target.value }))}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>{t(`sort.${s}`)}</option>
                ))}
              </select>
            </label>
            <button type="button" className="disc-filter-btn" onClick={() => setSheet(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              {t("filters.title")}
              {filterCount ? <span className="disc-filter-btn__n">{formatCount(filterCount, locale)}</span> : null}
            </button>
          </div>

          {active.length ? (
            <ul className="disc-active" aria-label={t("filters.active")}>
              {active.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => { if (a.key === "q") setText(""); setParam(a.clear); }} aria-label={t("filters.remove", { label: a.label })}>
                    <span dir="auto">{a.label}</span>
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><button type="button" className="disc-active__clear" onClick={clearAll}>{t("filters.clearAll")}</button></li>
            </ul>
          ) : null}

          {error ? (
            <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />
          ) : !results ? (
            <div className="disc-list" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title={t("empty.title")}
              description={t("empty.description")}
              actionLabel={t("empty.clearFilters")}
              onAction={clearAll}
            />
          ) : (
            <>
              {query.sort === "RECOMMENDED" ? <p className="disc-note">{t("recommendedOrderNote")}</p> : null}
              <ul className="disc-list">
                {results.map((p) => {
                  const href = `/${locale}/providers/${p.id}`;
                  const isVet = p.services.some((s) => s.category === "VET") || p.type.startsWith("VET");
                  return (
                    <li key={p.id} className="disc-row">
                      <div className="disc-row__media">
                        {p.coverImageUrl && !brokenCovers.has(p.id) ? (
                          <Image unoptimized src={p.coverImageUrl} alt="" fill sizes="128px" onError={() => setBrokenCovers((prev) => new Set(prev).add(p.id))} />
                        ) : (
                          // No photo of their own: a monogram, never a stock photo that implies a different place.
                          <span className="provider-monogram" aria-hidden="true">{p.name.trim().charAt(0)}</span>
                        )}
                      </div>
                      <div className="disc-row__main">
                        <p className="disc-row__kicker">
                          <span>{providerName(p.type)}</span>
                          {p.verified ? <span className="disc-row__verified"><BadgeCheck size={14} aria-hidden="true" />{t("verified")}</span> : null}
                        </p>
                        <h3><Link href={href} className="disc-row__link">{p.name}</Link></h3>
                        <p className="disc-row__services">
                          {isVet && p.specialties.length ? p.specialties.slice(0, 4).join(fa ? "، " : ", ") : p.services.slice(0, 3).map((s) => s.name).join(fa ? "، " : ", ")}
                        </p>
                        <p className="disc-row__meta">
                          {p.location ? <span><MapPin size={14} aria-hidden="true" />{[placeName(p.location.region, locale), placeName(p.location.city, locale)].filter(Boolean).join(fa ? "، " : ", ")}{p.distanceKm !== null ? ` · ${formatCount(p.distanceKm, locale)} ${t("distanceUnit")}` : ""}</span> : null}
                          <span className={p.nextAvailableAt ? "disc-row__open" : undefined}><Clock3 size={14} aria-hidden="true" />{p.nextAvailableAt ? `${t("nextOpening")}: ${fmtTime(p.nextAvailableAt)}` : t("noOpening")}</span>
                          {p.homeVisit ? <span><House size={14} aria-hidden="true" />{t("filters.homeVisitPlural")}</span> : null}
                          {p.petTypes.length ? <span>{p.petTypes.map((petType) => t(petType === "DOG" ? "species.dogs" : "species.cats")).join(fa ? " و " : locale === "de" ? " und " : locale === "es" ? " y " : locale === "ar" ? " و " : locale === "nl" ? " en " : " & ")}</span> : null}
                        </p>
                      </div>
                      <div className="disc-row__side">
                        {p.rating.count ? (
                          <p className="disc-row__rating" aria-label={t("ratingAria", { average: formatCount(p.rating.average ?? 0, locale), count: formatCount(p.rating.count, locale) })}>
                            <Star size={14} aria-hidden="true" />
                            <strong>{formatCount(p.rating.average ?? 0, locale)}</strong>
                            <span>({formatCount(p.rating.count, locale)})</span>
                          </p>
                        ) : (
                          <p className="disc-row__rating disc-row__rating--none">{t("noReviews")}</p>
                        )}
                        <p className="disc-row__price">{p.startingPrice ? <><small>{t("from")}</small> {formatPrice(p.startingPrice)}</> : t("priceOnRequest")}</p>
                        <span className="disc-row__cta" aria-hidden="true">
                          {t("viewAndBook")}
                          <Go size={16} aria-hidden="true" />
                        </span>
                      </div>
                      <button type="button" onClick={() => void toggleFavorite(p.id)} aria-pressed={favorites.has(p.id)} aria-label={favorites.has(p.id) ? t("removeSaved", { name: p.name }) : t("save", { name: p.name })} className="disc-row__save">
                        <Heart size={18} aria-hidden="true" fill={favorites.has(p.id) ? "currentColor" : "none"} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="disc-note">{t("mapUnavailable")}</p>
            </>
          )}
        </section>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={t("filters.title")}>
        <div className="disc-sheet">
          {sheet ? filters : null}
          <div className="disc-sheet__actions">
            {filterCount ? <button type="button" className="disc-sheet__clear" onClick={clearAll}>{t("filters.clearAll")}</button> : null}
            <button type="button" className="disc-sheet__show" onClick={() => setSheet(false)}>
              {results ? t("showResults", { count: total }) : t("showResultsFallback")}
            </button>
          </div>
        </div>
      </Sheet>
    </div></DiscoveryPage>
  );
}
