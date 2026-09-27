"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Clock3, EmptyState, ErrorRecovery, Heart, House, LocateFixed, MapPin, Search, Skeleton, Star } from "@petlife/ui";
import { discoveryService, type DiscoveryQuery, type DiscoverySort, type ProviderDiscoveryResult } from "@/services/discovery.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { useSessionStore } from "@/stores/session-store";
import { CinematicPageHero } from "@/features/experience/CinematicPageHero";
import { categoryLabel, providerTypeLabel } from "./labels";

const SORTS: { value: DiscoverySort; fa: string; en: string }[] = [
  { value: "RECOMMENDED", fa: "پیشنهادی", en: "Recommended" },
  { value: "EARLIEST", fa: "نزدیک‌ترین زمان آزاد", en: "Earliest availability" },
  { value: "NEAREST", fa: "نزدیک‌ترین مکان", en: "Nearest" },
  { value: "TOP_RATED", fa: "بیشترین امتیاز", en: "Top rated" },
  { value: "LOWEST_PRICE", fa: "کمترین قیمت", en: "Lowest price" },
];

const VET_SPECIALTIES = ["LAB_TEST", "IMAGING_STUDY", "DENTAL_CARE", "REHAB_SESSION", "NUTRITION_CONSULT", "VACCINATION"] as const;

/** Repository-owned fallback artwork; provider media wins when the provider uploaded it. */
const FALLBACK_COVER: Record<string, string> = {
  VET: "/images/experience/vet-hero.png",
  GROOMING: "/images/experience/grooming-hero.png",
};

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

export function ProviderDiscoveryView({ category }: { category?: string }) {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sessionStatus = useSessionStore((s) => s.status);
  const query = useMemo(() => readQuery(new URLSearchParams(params.toString()), category), [params, category]);
  const [results, setResults] = useState<ProviderDiscoveryResult[] | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [text, setText] = useState(query.q ?? "");

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
      setResults((await discoveryService.search(query)).items);
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

  return (
    <div className="experience-stack">
      <CinematicPageHero compact image={FALLBACK_COVER[category ?? ""] ?? "/images/experience/grooming-hero.png"} eyebrow={fa ? "متخصص‌های تأییدشده" : "VERIFIED PROFESSIONALS"} title={title} description={fa ? "فقط ارائه‌دهندگان تأییدشده، با زمان‌های واقعی و نظر مشتریانی که واقعاً رزرو کرده‌اند." : "Verified providers only, with real availability and reviews from customers who actually booked."}>
        <form
          className="experience-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setParam({ q: text.trim() || undefined });
          }}
        >
          <label>
            <Search size={20} aria-hidden="true" />
            <input value={text} onChange={(event) => setText(event.target.value)} aria-label={fa ? "جست‌وجوی نام یا تخصص" : "Search name or specialty"} placeholder={fa ? "نام کلینیک، متخصص یا تخصص…" : "Clinic, professional or specialty…"} />
          </label>
          <button type="submit">{fa ? "جست‌وجو" : "Search"}</button>
        </form>
      </CinematicPageHero>

      <section aria-label={fa ? "فیلترها" : "Filters"} className="grid gap-3 border-b border-border-subtle pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{fa ? "شهر" : "City"}</span>
          <select className="rounded border border-border-subtle bg-surface-base p-2" value={query.city ?? ""} onChange={(e) => setParam({ city: e.target.value || undefined })}>
            <option value="">{fa ? "همه شهرها" : "All cities"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{fa ? "مرتب‌سازی" : "Sort by"}</span>
          <select className="rounded border border-border-subtle bg-surface-base p-2" value={query.sort} onChange={(e) => (e.target.value === "NEAREST" && query.lat === undefined ? locateMe() : setParam({ sort: e.target.value }))}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{fa ? s.fa : s.en}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{fa ? "روز مراجعه" : "Date"}</span>
          <input type="date" className="rounded border border-border-subtle bg-surface-base p-2" value={query.date ?? ""} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setParam({ date: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">{fa ? "حداکثر قیمت (تومان)" : "Max price (Toman)"}</span>
          <input inputMode="numeric" className="rounded border border-border-subtle bg-surface-base p-2" defaultValue={query.maxPrice ? String(query.maxPrice / 10) : ""} onBlur={(e) => setParam({ maxPrice: e.target.value ? String(Number(e.target.value.replace(/[^\d]/g, "")) * 10) : undefined })} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          {(["DOG", "CAT"] as const).map((s) => (
            <button key={s} type="button" className="experience-pill" aria-pressed={query.species === s} onClick={() => setParam({ species: query.species === s ? undefined : s })}>
              {s === "DOG" ? (fa ? "سگ" : "Dog") : fa ? "گربه" : "Cat"}
            </button>
          ))}
          <button type="button" className="experience-pill" aria-pressed={Boolean(query.homeVisit)} onClick={() => setParam({ homeVisit: query.homeVisit ? undefined : "true" })}>
            <House size={14} aria-hidden="true" /> {fa ? "در منزل" : "Home visit"}
          </button>
          <button type="button" className="experience-pill" aria-pressed={query.minRating === 4} onClick={() => setParam({ minRating: query.minRating === 4 ? undefined : "4" })}>
            <Star size={14} aria-hidden="true" /> {fa ? "امتیاز ۴ به بالا" : "4★ and up"}
          </button>
          {category === "VET"
            ? VET_SPECIALTIES.map((type) => (
                <button key={type} type="button" className="experience-pill" aria-pressed={query.serviceType === type} onClick={() => setParam({ serviceType: query.serviceType === type ? undefined : type })}>
                  {serviceTypeLabel(type, fa)}
                </button>
              ))
            : null}
          <button type="button" className="experience-pill" onClick={locateMe} aria-busy={locating === "busy"}>
            <LocateFixed size={14} aria-hidden="true" /> {fa ? "نزدیک من" : "Near me"}
          </button>
          {locating === "denied" ? <span role="status" className="text-sm text-text-secondary">{fa ? "دسترسی به موقعیت داده نشد؛ شهر را انتخاب کنید." : "Location unavailable; choose a city instead."}</span> : null}
        </div>
      </section>

      {error ? (
        <ErrorRecovery title={fa ? "نتایج بارگیری نشد" : "Results could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />
      ) : !results ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          title={fa ? "ارائه‌دهنده‌ای با این فیلترها پیدا نشد" : "No providers match these filters"}
          description={fa ? "فیلترها را کمتر کنید یا شهر دیگری انتخاب کنید." : "Loosen the filters or choose another city."}
          actionLabel={fa ? "پاک کردن فیلترها" : "Clear filters"}
          onAction={() => router.replace(pathname)}
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary" aria-live="polite">
            {results.length.toLocaleString(locale)} {fa ? "ارائه‌دهنده" : "providers"}
            {query.sort === "RECOMMENDED" ? (fa ? " — ترتیب بر اساس زمان آزاد، امتیاز، تجربه و فاصله؛ بدون تبلیغ." : " — ordered by availability, rating, experience and distance; no paid placement.") : null}
          </p>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <li key={p.id} className="experience-card relative flex flex-col">
                <Link href={`/${locale}/providers/${p.id}`} className="flex flex-1 flex-col focus-visible:outline-none">
                  <div className="experience-card__media">
                    <Image unoptimized={Boolean(p.coverImageUrl)} src={p.coverImageUrl ?? FALLBACK_COVER[category ?? p.services[0]?.category ?? ""] ?? "/images/experience/grooming-hero.png"} alt="" fill sizes="(max-width:768px) 100vw, 33vw" />
                  </div>
                  <div className="experience-card__body flex flex-1 flex-col gap-2">
                    <div className="experience-card__row">
                      <span className="experience-badge"><BadgeCheck size={14} aria-hidden="true" />{fa ? "تأییدشده" : "Verified"}</span>
                      {p.rating.count ? (
                        <span className="experience-badge experience-badge--gold" aria-label={fa ? `امتیاز ${p.rating.average} از ۵ در ${p.rating.count} نظر` : `Rated ${p.rating.average} of 5 from ${p.rating.count} reviews`}>
                          <Star size={13} aria-hidden="true" />
                          {p.rating.average?.toLocaleString(locale)} ({p.rating.count.toLocaleString(locale)})
                        </span>
                      ) : (
                        <span className="text-xs text-text-secondary">{fa ? "هنوز نظری ثبت نشده" : "No reviews yet"}</span>
                      )}
                    </div>
                    <h3 className="text-section-title text-text-primary">{p.name}</h3>
                    <p className="text-sm text-text-secondary">{providerTypeLabel(p.type, fa)} · {p.services.slice(0, 3).map((s) => s.name).join("، ")}</p>
                    <div className="experience-meta">
                      {p.location ? <span><MapPin size={14} aria-hidden="true" />{[p.location.region, p.location.city].filter(Boolean).join("، ")}{p.distanceKm !== null ? ` · ${p.distanceKm.toLocaleString(locale)} ${fa ? "کیلومتر" : "km"}` : ""}</span> : null}
                      <span><Clock3 size={14} aria-hidden="true" />{p.nextAvailableAt ? fmtTime(p.nextAvailableAt) : fa ? "در ۷ روز آینده زمان آزاد ندارد" : "No opening in the next 7 days"}</span>
                      {p.homeVisit ? <span><House size={14} aria-hidden="true" />{fa ? "خدمت در منزل" : "Home visits"}</span> : null}
                    </div>
                    <p className="text-xs text-text-secondary">
                      {p.petTypes.map((t) => (t === "DOG" ? (fa ? "سگ" : "Dogs") : fa ? "گربه" : "Cats")).join(fa ? " و " : " & ")}
                      {p.completedBookings ? ` · ${p.completedBookings.toLocaleString(locale)} ${fa ? "نوبت انجام‌شده" : "completed bookings"}` : ""}
                    </p>
                    <div className="experience-price mt-auto">{p.startingPrice !== null ? `${fa ? "از" : "From"} ${formatCurrency(p.startingPrice, locale)}` : fa ? "قیمت پس از استعلام" : "Price on request"}</div>
                  </div>
                </Link>
                <button type="button" onClick={() => void toggleFavorite(p.id)} aria-pressed={favorites.has(p.id)} aria-label={favorites.has(p.id) ? (fa ? `حذف ${p.name} از ذخیره‌ها` : `Remove ${p.name} from saved`) : fa ? `ذخیره ${p.name}` : `Save ${p.name}`} className="absolute end-3 top-3 rounded-full bg-surface-base/90 p-2 shadow-sm">
                  <Heart size={18} aria-hidden="true" fill={favorites.has(p.id) ? "currentColor" : "none"} className={favorites.has(p.id) ? "text-state-urgent" : "text-text-secondary"} />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-secondary">{fa ? "نمای نقشه تا اتصال سرویس نقشه در دسترس نیست؛ فاصله‌ها از مختصات ثبت‌شده محاسبه می‌شوند." : "Map view is unavailable until a map provider is connected; distances use registered coordinates."}</p>
        </>
      )}
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
