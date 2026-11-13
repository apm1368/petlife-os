"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, Skeleton } from "@petlife/ui";
import { formatCurrency } from "@/lib/currency/format-currency";
import { placeName } from "@/lib/i18n/iran-places";
import { travelExternalService, type ExternalStay, type ExternalStayContext, type ExternalStayFacets } from "@/services/travel-external.service";
import { ExternalStayTile } from "./ExternalStayTile";
import "./external-stay-tile.css";

/** The external source whose pet-accepting stays are synced daily (facts only, click-out). */
export const JAJIGA_SOURCE = "JAJIGA";
export const JAJIGA_PAGE_SIZE = 20;

/** Nightly "from" price bands in IRR (shown in Toman). Ids go in the URL. */
export const PRICE_BANDS = [
  { id: "1", min: undefined, max: 20_000_000 },
  { id: "2", min: 20_000_000, max: 50_000_000 },
  { id: "3", min: 50_000_000, max: 100_000_000 },
  { id: "4", min: 100_000_000, max: 200_000_000 },
  { id: "5", min: 200_000_000, max: undefined },
] as const;
const GUEST_OPTIONS = [2, 4, 6, 8, 10, 15, 20];

/** The list's own filters, kept in the page URL under j-prefixed keys so they never clash with opetlife's search. */
const URL_KEYS = { province: "jprovince", city: "jcity", guests: "jguests", price: "jprice" } as const;
type Filters = { province: string; city: string; guests: string; price: string };

/**
 * Jajiga's pet-accepting stays as a real list (travel home and search): province and city filters taken from the places
 * the listings actually have, guests and a nightly price band, 20 at a time with "load more", and a small source chip
 * instead of a big heading. Facts only; every tile leaves through the logged /out redirect, with no booking or fee here.
 * Filters live in the URL (jprovince, jcity, jguests, jprice) so a filtered list can be shared and survives a reload.
 */
export function JajigaStaysSection({
  city: cityProp,
  context = {},
  hideWhenEmpty = false,
  headingLevel = 2,
}: {
  /** City typed in the page's own search; preselected, and replaced when the page's search changes. */
  city?: string;
  context?: ExternalStayContext;
  hideWhenEmpty?: boolean;
  headingLevel?: 1 | 2;
}) {
  const t = useTranslations("externalTravel");
  const locale = useLocale() as "fa" | "en" | "de" | "es" | "ar" | "nl";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const nf = new Intl.NumberFormat(locale);
  const [facets, setFacets] = useState<ExternalStayFacets | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    province: params.get(URL_KEYS.province) ?? "",
    city: params.get(URL_KEYS.city) ?? cityProp ?? "",
    guests: params.get(URL_KEYS.guests) ?? "",
    price: params.get(URL_KEYS.price) ?? "",
  }));
  const [rows, setRows] = useState<ExternalStay[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const { checkIn, checkOut, pets } = context;

  useEffect(() => {
    const controller = new AbortController();
    travelExternalService.facets(JAJIGA_SOURCE, controller.signal).then(setFacets, () => {
      if (!controller.signal.aborted) setFacets({ provinces: [], cities: [] });
    });
    return () => controller.abort();
  }, []);

  // The page's own search changed its city: follow it (not on first render, where the URL's jcity wins).
  const lastCityProp = useRef(cityProp);
  useEffect(() => {
    if (lastCityProp.current === cityProp) return;
    lastCityProp.current = cityProp;
    setFilters((f) => ({ ...f, city: cityProp ?? "" }));
  }, [cityProp]);

  // A province from the URL is used only once the facets confirm it exists (the API rejects unknown provinces).
  const waitingForFacets = Boolean(filters.province) && facets === null;
  const knownProvince = !filters.province || (facets?.provinces.some((p) => p.name === filters.province) ?? false);
  const cities = useMemo(() => {
    const list = (facets?.cities ?? []).filter((c) => !filters.province || c.province === filters.province);
    // A city from the page search that has no listing of its own (or is a province name) still shows as chosen.
    return filters.city && !list.some((c) => c.name === filters.city) ? [{ name: filters.city, province: null, count: 0 }, ...list] : list;
  }, [facets, filters.province, filters.city]);
  const band = PRICE_BANDS.find((b) => b.id === filters.price);

  const request = useMemo(
    () => ({
      province: knownProvince ? filters.province || undefined : undefined,
      city: filters.city || undefined,
      guests: Number(filters.guests) || undefined,
      // A price band filters on the nightly "from" price, which is not tied to dates; with dates the API would look
      // for a dated quote instead, which this source rarely has.
      ...(band ? { minPrice: band.min, maxPrice: band.max } : { checkIn, checkOut }),
      pets,
      source: JAJIGA_SOURCE,
      pageSize: JAJIGA_PAGE_SIZE,
    }),
    [knownProvince, filters, band, checkIn, checkOut, pets],
  );

  // A new filter starts the list again from the first 20.
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setFailed(false);
    setPage(1);
    if (waitingForFacets) return () => controller.abort();
    travelExternalService
      .search({ ...request, page: 1 }, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setRows(value.items);
        setTotal(value.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [request, revision, waitingForFacets]);

  function change(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    const query = new URLSearchParams(params.toString());
    for (const key of Object.keys(next) as (keyof Filters)[]) {
      if (merged[key]) query.set(URL_KEYS[key], merged[key]);
      else query.delete(URL_KEYS[key]);
    }
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await travelExternalService.search({ ...request, page: page + 1 });
      setRows((current) => {
        const seen = new Set((current ?? []).map((s) => s.id));
        return [...(current ?? []), ...next.items.filter((s) => !seen.has(s.id))];
      });
      setTotal(next.total);
      setPage(page + 1);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = Boolean(filters.province || filters.city || filters.guests || filters.price);
  if (hideWhenEmpty && rows !== null && rows.length === 0 && !filtered) return null;
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const money = (irr: number) => formatCurrency(irr, locale);
  const bandLabel = (b: (typeof PRICE_BANDS)[number]) =>
    b.min === undefined ? t("browser.priceUpTo", { max: money(b.max!) }) : b.max === undefined ? t("browser.priceOver", { min: money(b.min) }) : t("browser.priceBetween", { min: money(b.min), max: money(b.max) });

  return (
    <section aria-labelledby="jajiga-stays-title" className="flex flex-col gap-3">
      <div className="xs-head">
        <Heading id="jajiga-stays-title" className={headingLevel === 1 ? "text-page-title text-text-primary" : "text-section-title text-text-primary"}>
          {t("browser.title")}
        </Heading>
        {rows ? <span className="text-metadata text-text-secondary" aria-live="polite">{t("browser.count", { count: nf.format(total) })}</span> : null}
      </div>
      <p className="text-metadata text-text-secondary">{t("browser.hint")}</p>

      <div className="xs-filters" role="group" aria-label={t("browser.filters")}>
        <label>
          {t("browser.province")}
          <select value={filters.province} onChange={(e) => change({ province: e.target.value, city: "" })}>
            <option value="">{t("browser.allProvinces")}</option>
            {(facets?.provinces ?? []).map((p) => (
              <option key={p.name} value={p.name}>{placeName(p.name, locale)} ({nf.format(p.count)})</option>
            ))}
          </select>
        </label>
        <label>
          {t("browser.city")}
          <select value={filters.city} onChange={(e) => change({ city: e.target.value })}>
            <option value="">{t("browser.allCities")}</option>
            {cities.map((c) => (
              <option key={`${c.province ?? ""}-${c.name}`} value={c.name}>{c.count ? `${placeName(c.name, locale)} (${nf.format(c.count)})` : placeName(c.name, locale)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("browser.guests")}
          <select value={filters.guests} onChange={(e) => change({ guests: e.target.value })}>
            <option value="">{t("browser.anyGuests")}</option>
            {GUEST_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>{t("browser.guestsAtLeast", { count: nf.format(n) })}</option>
            ))}
          </select>
        </label>
        <label>
          {t("browser.price")}
          <select value={filters.price} onChange={(e) => change({ price: e.target.value })}>
            <option value="">{t("browser.anyPrice")}</option>
            {PRICE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>{bandLabel(b)}</option>
            ))}
          </select>
        </label>
        {filtered ? (
          <Button size="sm" variant="ghost" onClick={() => change({ province: "", city: "", guests: "", price: "" })}>{t("browser.clear")}</Button>
        ) : null}
      </div>

      {failed && rows === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-text-secondary">{t("loadFailed")}</p>
          <Button size="sm" variant="secondary" onClick={() => setRevision((v) => v + 1)}>{t("retry")}</Button>
        </div>
      ) : rows === null ? (
        <div className="xs-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary">{filtered ? t("browser.noMatch") : t("empty")}</p>
      ) : (
        <>
          <ul className="xs-grid" aria-label={t("browser.title")}>
            {rows.map((stay) => (
              <li key={stay.id} className="min-w-0">
                <ExternalStayTile stay={stay} context={context} />
              </li>
            ))}
          </ul>
          {failed ? <p role="alert" className="text-sm text-text-secondary">{t("loadFailed")}</p> : null}
          {rows.length < total ? (
            <div className="flex justify-center">
              <Button variant="secondary" isLoading={loadingMore} onClick={() => void loadMore()}>
                {t("browser.loadMore", { shown: nf.format(rows.length), total: nf.format(total) })}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <p className="text-metadata text-text-secondary">{t("browser.mediaNote")}</p>
    </section>
  );
}
