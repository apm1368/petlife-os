"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, ChevronLeft, ChevronRight, Clock3, EmptyState, ErrorRecovery, Heart, House, LocateFixed, MapPin, Search, Sheet, SlidersHorizontal, Skeleton, Star, X } from "@petlife/ui";
import { discoveryService, type DiscoveryQuery, type DiscoverySort, type ProviderDiscoveryResult } from "@/services/discovery.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { useSessionStore } from "@/stores/session-store";
import { categoryLabel, providerTypeLabel } from "./labels";
import { formatCount } from "@/lib/number/format-number";
import { formatDay } from "@/lib/date/jalali";
import { DateField } from "@/features/shared/date-picker/DateField";

const SORTS: { value: DiscoverySort; fa: string; en: string }[] = [
  { value: "RECOMMENDED", fa: "پیشنهادی", en: "Recommended" },
  { value: "EARLIEST", fa: "نزدیک‌ترین زمان آزاد", en: "Earliest availability" },
  { value: "NEAREST", fa: "نزدیک‌ترین مکان", en: "Nearest" },
  { value: "TOP_RATED", fa: "بیشترین امتیاز", en: "Top rated" },
  { value: "LOWEST_PRICE", fa: "کمترین قیمت", en: "Lowest price" },
];

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
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
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

  const fmtTime = (iso: string) => new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(iso));
  const title = category ? categoryLabel(category, fa) : fa ? "همه خدمات" : "All services";
  const speciesLabel = (s: "DOG" | "CAT") => (s === "DOG" ? (fa ? "سگ" : "Dog") : fa ? "گربه" : "Cat");
  const navQuery = (() => {
    const next = new URLSearchParams(params.toString());
    next.delete("serviceType");
    return next.toString() ? `?${next}` : "";
  })();

  const active: { key: string; label: string; clear: Record<string, undefined> }[] = [
    ...(query.q ? [{ key: "q", label: `«${query.q}»`, clear: { q: undefined } }] : []),
    ...(query.city ? [{ key: "city", label: query.city, clear: { city: undefined } }] : []),
    ...(query.date ? [{ key: "date", label: formatDay(query.date, locale, { year: false }), clear: { date: undefined } }] : []),
    ...(query.species ? [{ key: "species", label: speciesLabel(query.species), clear: { species: undefined } }] : []),
    ...(query.homeVisit ? [{ key: "homeVisit", label: fa ? "خدمت در منزل" : "Home visit", clear: { homeVisit: undefined } }] : []),
    ...(query.minRating ? [{ key: "minRating", label: fa ? "امتیاز ۴ به بالا" : "Rated 4+", clear: { minRating: undefined } }] : []),
    ...(query.maxPrice ? [{ key: "maxPrice", label: `${fa ? "تا" : "Up to"} ${formatCurrency(query.maxPrice, locale)}`, clear: { maxPrice: undefined } }] : []),
    ...(query.serviceType ? [{ key: "serviceType", label: serviceTypeLabel(query.serviceType, fa), clear: { serviceType: undefined } }] : []),
    ...(query.lat !== undefined ? [{ key: "near", label: fa ? "نزدیک من" : "Near me", clear: { lat: undefined, lng: undefined } }] : []),
  ];
  const filterCount = active.filter((a) => a.key !== "q").length;
  const clearAll = () => {
    setText("");
    setParam(Object.fromEntries([...FILTER_KEYS, "q"].map((k) => [k, undefined])));
  };

  const filters = (
    <div className="disc-filters">
      <label className="disc-field">
        <span>{fa ? "شهر" : "City"}</span>
        <select value={query.city ?? ""} onChange={(e) => setParam({ city: e.target.value || undefined })}>
          <option value="">{fa ? "همه شهرها" : "All cities"}</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <DateField label={fa ? "روز مراجعه" : "Date"} placeholder={fa ? "هر روز" : "Any day"} value={query.date ?? ""} min={new Date().toISOString().slice(0, 10)} onChange={(iso) => setParam({ date: iso || undefined })} />
      <fieldset className="disc-field">
        <legend>{fa ? "حیوان" : "Pet"}</legend>
        <div className="disc-segment">
          {(["DOG", "CAT"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={query.species === s} onClick={() => setParam({ species: query.species === s ? undefined : s })}>{speciesLabel(s)}</button>
          ))}
        </div>
      </fieldset>
      <label className="disc-field">
        <span>{fa ? "حداکثر قیمت (تومان)" : "Max price (Toman)"}</span>
        <input key={query.maxPrice ?? "none"} inputMode="numeric" defaultValue={query.maxPrice ? String(query.maxPrice / 10) : ""} onBlur={(e) => setParam({ maxPrice: e.target.value ? String(Number(e.target.value.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))) * 10) : undefined })} />
      </label>
      <div className="disc-toggles">
        <button type="button" className="disc-toggle" aria-pressed={Boolean(query.homeVisit)} onClick={() => setParam({ homeVisit: query.homeVisit ? undefined : "true" })}>
          <House size={16} aria-hidden="true" /> {fa ? "در منزل" : "Home visit"}
        </button>
        <button type="button" className="disc-toggle" aria-pressed={query.minRating === 4} onClick={() => setParam({ minRating: query.minRating === 4 ? undefined : "4" })}>
          <Star size={16} aria-hidden="true" /> {fa ? "امتیاز ۴ به بالا" : "4★ and up"}
        </button>
        <button type="button" className="disc-toggle" aria-pressed={query.lat !== undefined} onClick={() => (query.lat !== undefined ? setParam({ lat: undefined, lng: undefined }) : locateMe())} aria-busy={locating === "busy"}>
          <LocateFixed size={16} aria-hidden="true" /> {fa ? "نزدیک من" : "Near me"}
        </button>
      </div>
      {locating === "denied" ? <p role="status" className="disc-note">{fa ? "دسترسی به موقعیت داده نشد؛ شهر را انتخاب کنید." : "Location unavailable; choose a city instead."}</p> : null}
      {category === "VET" ? (
        <fieldset className="disc-field">
          <legend>{fa ? "نوع خدمت دامپزشکی" : "Veterinary service"}</legend>
          <div className="disc-chips">
            {VET_SPECIALTIES.map((type) => (
              <button key={type} type="button" aria-pressed={query.serviceType === type} onClick={() => setParam({ serviceType: query.serviceType === type ? undefined : type })}>
                {serviceTypeLabel(type, fa)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );

  const Go = fa ? ChevronLeft : ChevronRight;

  return (
    <div className="disc">
      <header className="disc-head">
        <div className="disc-head__text">
          <p className="disc-head__eyebrow"><BadgeCheck size={16} aria-hidden="true" />{fa ? "فقط ارائه‌دهندگان تأییدشده" : "Verified providers only"}</p>
          <h1>{title}</h1>
          <p>{fa ? "زمان‌های آزاد واقعی و نظر کسانی که واقعاً رزرو کرده‌اند." : "Real open times and reviews from people who actually booked."}</p>
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
          <input value={text} onChange={(event) => setText(event.target.value)} aria-label={fa ? "جست‌وجوی نام یا تخصص" : "Search name or specialty"} placeholder={fa ? "نام کلینیک، متخصص یا تخصص…" : "Clinic, professional or specialty…"} />
          <button type="submit">{fa ? "جست‌وجو" : "Search"}</button>
        </form>
      </header>

      <nav className="disc-cats" aria-label={fa ? "دسته‌های خدمات" : "Service categories"}>
        <Link href={`/${locale}/services/search${navQuery}`} aria-current={!category ? "page" : undefined}>{fa ? "همه" : "All"}</Link>
        {CATEGORY_NAV.map((c) => (
          <Link key={c} href={`/${locale}/services/${c}${navQuery}`} aria-current={category === c ? "page" : undefined}>{categoryLabel(c, fa)}</Link>
        ))}
      </nav>

      <div className="disc-layout">
        <aside className="disc-rail" aria-label={fa ? "فیلترها" : "Filters"}>
          <div className="disc-rail__head">
            <h2>{fa ? "فیلترها" : "Filters"}</h2>
            {filterCount ? <button type="button" onClick={clearAll}>{fa ? "پاک کردن" : "Clear"}</button> : null}
          </div>
          {sheet ? null : filters}
        </aside>

        <section className="disc-results" aria-label={fa ? "نتایج" : "Results"}>
          <div className="disc-toolbar">
            <p className="disc-count" aria-live="polite">
              {results ? (fa ? `${formatCount(total, "fa")} ارائه‌دهنده` : `${formatCount(total, "en")} ${total === 1 ? "provider" : "providers"}`) : fa ? "در حال جست‌وجو…" : "Searching…"}
            </p>
            <label className="disc-sort">
              <span>{fa ? "مرتب‌سازی" : "Sort"}</span>
              <select value={query.sort} onChange={(e) => (e.target.value === "NEAREST" && query.lat === undefined ? locateMe() : setParam({ sort: e.target.value }))}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{fa ? s.fa : s.en}</option>
                ))}
              </select>
            </label>
            <button type="button" className="disc-filter-btn" onClick={() => setSheet(true)}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              {fa ? "فیلترها" : "Filters"}
              {filterCount ? <span className="disc-filter-btn__n">{formatCount(filterCount, locale)}</span> : null}
            </button>
          </div>

          {active.length ? (
            <ul className="disc-active" aria-label={fa ? "فیلترهای فعال" : "Active filters"}>
              {active.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => { if (a.key === "q") setText(""); setParam(a.clear); }} aria-label={fa ? `حذف فیلتر ${a.label}` : `Remove filter ${a.label}`}>
                    <span dir="auto">{a.label}</span>
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li><button type="button" className="disc-active__clear" onClick={clearAll}>{fa ? "پاک کردن همه" : "Clear all"}</button></li>
            </ul>
          ) : null}

          {error ? (
            <ErrorRecovery title={fa ? "نتایج بارگیری نشد" : "Results could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />
          ) : !results ? (
            <div className="disc-list" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title={fa ? "ارائه‌دهنده‌ای با این فیلترها پیدا نشد" : "No providers match these filters"}
              description={fa ? "فیلترها را کمتر کنید یا شهر دیگری انتخاب کنید." : "Loosen the filters or choose another city."}
              actionLabel={fa ? "پاک کردن فیلترها" : "Clear filters"}
              onAction={clearAll}
            />
          ) : (
            <>
              {query.sort === "RECOMMENDED" ? <p className="disc-note">{fa ? "ترتیب بر اساس زمان آزاد، امتیاز، تجربه و فاصله است؛ جایگاه تبلیغاتی وجود ندارد." : "Ordered by availability, rating, experience and distance — there is no paid placement."}</p> : null}
              <ul className="disc-list">
                {results.map((p) => {
                  const href = `/${locale}/providers/${p.id}`;
                  const isVet = p.services.some((s) => s.category === "VET") || p.type.startsWith("VET");
                  return (
                    <li key={p.id} className="disc-row">
                      <div className="disc-row__media">
                        {p.coverImageUrl ? (
                          <Image unoptimized src={p.coverImageUrl} alt="" fill sizes="128px" />
                        ) : (
                          // No photo of their own: a monogram, never a stock photo that implies a different place.
                          <span className="provider-monogram" aria-hidden="true">{p.name.trim().charAt(0)}</span>
                        )}
                      </div>
                      <div className="disc-row__main">
                        <p className="disc-row__kicker">
                          <span>{providerTypeLabel(p.type, fa)}</span>
                          {p.verified ? <span className="disc-row__verified"><BadgeCheck size={14} aria-hidden="true" />{fa ? "تأییدشده" : "Verified"}</span> : null}
                        </p>
                        <h3><Link href={href} className="disc-row__link">{p.name}</Link></h3>
                        <p className="disc-row__services">
                          {isVet && p.specialties.length ? p.specialties.slice(0, 4).join(fa ? "، " : ", ") : p.services.slice(0, 3).map((s) => s.name).join(fa ? "، " : ", ")}
                        </p>
                        <p className="disc-row__meta">
                          {p.location ? <span><MapPin size={14} aria-hidden="true" />{[p.location.region, p.location.city].filter(Boolean).join(fa ? "، " : ", ")}{p.distanceKm !== null ? ` · ${formatCount(p.distanceKm, locale)} ${fa ? "کیلومتر" : "km"}` : ""}</span> : null}
                          <span className={p.nextAvailableAt ? "disc-row__open" : undefined}><Clock3 size={14} aria-hidden="true" />{p.nextAvailableAt ? `${fa ? "اولین زمان آزاد: " : "Next opening: "}${fmtTime(p.nextAvailableAt)}` : fa ? "در ۷ روز آینده زمان آزاد ندارد" : "No opening in the next 7 days"}</span>
                          {p.homeVisit ? <span><House size={14} aria-hidden="true" />{fa ? "خدمت در منزل" : "Home visits"}</span> : null}
                          {p.petTypes.length ? <span>{p.petTypes.map((t) => (t === "DOG" ? (fa ? "سگ" : "Dogs") : fa ? "گربه" : "Cats")).join(fa ? " و " : " & ")}</span> : null}
                        </p>
                      </div>
                      <div className="disc-row__side">
                        {p.rating.count ? (
                          <p className="disc-row__rating" aria-label={fa ? `امتیاز ${formatCount(p.rating.average ?? 0, "fa")} از ۵ در ${formatCount(p.rating.count, "fa")} نظر` : `Rated ${p.rating.average} of 5 from ${p.rating.count} reviews`}>
                            <Star size={14} aria-hidden="true" />
                            <strong>{formatCount(p.rating.average ?? 0, locale)}</strong>
                            <span>({formatCount(p.rating.count, locale)})</span>
                          </p>
                        ) : (
                          <p className="disc-row__rating disc-row__rating--none">{fa ? "هنوز نظری ثبت نشده" : "No reviews yet"}</p>
                        )}
                        <p className="disc-row__price">{p.startingPrice ? <><small>{fa ? "از" : "From"}</small> {formatCurrency(p.startingPrice, locale)}</> : fa ? "قیمت پس از استعلام" : "Price on request"}</p>
                        <span className="disc-row__cta" aria-hidden="true">
                          {fa ? "مشاهده و رزرو" : "View and book"}
                          <Go size={16} aria-hidden="true" />
                        </span>
                      </div>
                      <button type="button" onClick={() => void toggleFavorite(p.id)} aria-pressed={favorites.has(p.id)} aria-label={favorites.has(p.id) ? (fa ? `حذف ${p.name} از ذخیره‌ها` : `Remove ${p.name} from saved`) : fa ? `ذخیره ${p.name}` : `Save ${p.name}`} className="disc-row__save">
                        <Heart size={18} aria-hidden="true" fill={favorites.has(p.id) ? "currentColor" : "none"} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="disc-note">{fa ? "نمای نقشه تا اتصال سرویس نقشه در دسترس نیست؛ فاصله‌ها از مختصات ثبت‌شده محاسبه می‌شوند." : "Map view is unavailable until a map provider is connected; distances use registered coordinates."}</p>
            </>
          )}
        </section>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title={fa ? "فیلترها" : "Filters"}>
        <div className="disc-sheet">
          {sheet ? filters : null}
          <div className="disc-sheet__actions">
            {filterCount ? <button type="button" className="disc-sheet__clear" onClick={clearAll}>{fa ? "پاک کردن همه" : "Clear all"}</button> : null}
            <button type="button" className="disc-sheet__show" onClick={() => setSheet(false)}>
              {results ? (fa ? `نمایش ${formatCount(total, "fa")} نتیجه` : `Show ${formatCount(total, "en")} ${total === 1 ? "result" : "results"}`) : fa ? "نمایش نتایج" : "Show results"}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function serviceTypeLabel(type: string, fa: boolean): string {
  const map: Record<string, [string, string]> = {
    LAB_TEST: ["آزمایشگاه", "Laboratory"],
    IMAGING_STUDY: ["تصویربرداری", "Imaging"],
    DENTAL_CARE: ["دندانپزشکی", "Dental"],
    REHAB_SESSION: ["توان‌بخشی", "Rehab"],
    NUTRITION_CONSULT: ["تغذیه", "Nutrition"],
    VACCINATION: ["واکسیناسیون", "Vaccination"],
  };
  return map[type]?.[fa ? 0 : 1] ?? type;
}
