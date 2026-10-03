"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Search, Select, Sheet, SlidersHorizontal, Skeleton } from "@petlife/ui";
import type { ProductCategoryDto, ProductSearchResultDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService, type ProductSort, type SearchProductsInput } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { ProductCard } from "./ProductCard";
import { formatNumber } from "./commerce-ui";

const SORTS: ProductSort[] = ["RECOMMENDED", "NEWEST", "PRICE_ASC", "PRICE_DESC", "TOP_RATED"];
const PAGE_SIZE = 24;

/** Every filter lives in the URL, so a search is shareable, survives sign-in and the back button. */
export function readProductFilters(params: URLSearchParams): SearchProductsInput {
  const num = (key: string) => {
    const v = params.get(key);
    return v && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  const attr: Record<string, string> = {};
  params.forEach((value, key) => {
    const m = /^attr\[(.+)\]$/.exec(key);
    if (m && value) attr[m[1]!] = value;
  });
  return {
    search: params.get("search") ?? params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    species: params.get("species") ?? undefined,
    brand: params.get("brand") ?? undefined,
    seller: params.get("seller") ?? undefined,
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    inStock: params.get("inStock") === "true" || undefined,
    onPromotion: params.get("onPromotion") === "true" || undefined,
    minRating: num("minRating"),
    attr: Object.keys(attr).length ? attr : undefined,
    sort: (SORTS.includes(params.get("sort") as ProductSort) ? params.get("sort") : undefined) as ProductSort | undefined,
    page: num("page") ?? 1,
  };
}

/**
 * Product results (Commerce Discovery pattern): search, category, species,
 * brand, seller, price, stock, promotion, rating and structured variant
 * attributes; five explainable sorts; paginated. On mobile the filters
 * open in a bottom sheet instead of pushing results below the fold.
 */
export function ProductResultsView() {
  const t = useTranslations("commerce.results");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const locale = useLocale() as "fa" | "en";
  const { activePet } = useActivePet();

  const paramString = params.toString();
  const filters = useMemo(() => readProductFilters(new URLSearchParams(paramString)), [paramString]);
  const [data, setData] = useState<ProductSearchResultDto | null>(null);
  const [categories, setCategories] = useState<ProductCategoryDto[]>([]);
  const [error, setError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState(filters.search ?? "");
  const [retry, setRetry] = useState(0);

  useEffect(() => setQuery(filters.search ?? ""), [filters.search]);

  useEffect(() => {
    void commerceService.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setData(null);
    commerceService
      .searchProducts({ ...filters, petId: activePet?.id, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, activePet?.id, retry]);

  function update(patch: Record<string, string | undefined>, keepPage = false) {
    const next = new URLSearchParams(paramString);
    next.delete("q");
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete("page");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: keepPage });
  }

  function clearFilters() {
    const keep = new URLSearchParams();
    if (filters.category) keep.set("category", filters.category);
    if (filters.search) keep.set("search", filters.search);
    router.replace(`${pathname}${keep.toString() ? `?${keep}` : ""}`, { scroll: false });
  }

  const activeCount = [filters.brand, filters.seller, filters.minPrice, filters.maxPrice, filters.inStock, filters.onPromotion, filters.minRating, filters.species, ...Object.keys(filters.attr ?? {})].filter(Boolean).length;
  const topCategories = categories.filter((c) => !c.parentId);
  const childCategories = filters.category ? categories.filter((c) => c.parentId === filters.category) : [];
  const currentCategory = categories.find((c) => c.id === filters.category);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const filterPanel = data ? (
    <div className="flex flex-col gap-4">
      <Select
        label={t("filters.species")}
        value={filters.species ?? ""}
        onChange={(e) => update({ species: e.target.value || undefined })}
        options={[
          { value: "", label: t("filters.any") },
          { value: "DOG", label: t("filters.dog") },
          { value: "CAT", label: t("filters.cat") },
        ]}
      />
      {data.facets.brands.length ? (
        <Select
          label={t("filters.brand")}
          value={filters.brand ?? ""}
          onChange={(e) => update({ brand: e.target.value || undefined })}
          options={[{ value: "", label: t("filters.any") }, ...data.facets.brands.map((b) => ({ value: b.id, label: `${b.name} (${formatNumber(b.count, locale)})` }))]}
        />
      ) : null}
      {data.facets.sellers.length ? (
        <Select
          label={t("filters.seller")}
          value={filters.seller ?? ""}
          onChange={(e) => update({ seller: e.target.value || undefined })}
          options={[{ value: "", label: t("filters.any") }, ...data.facets.sellers.map((s) => ({ value: s.id, label: `${s.name} (${formatNumber(s.count, locale)})` }))]}
        />
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-metadata text-text-secondary">
          {t("filters.price")}
          {data.facets.priceRange ? (
            <span className="ms-1">
              ({formatCurrency(data.facets.priceRange.min, locale)} – {formatCurrency(data.facets.priceRange.max, locale)})
            </span>
          ) : null}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <PriceInput label={t("filters.minToman")} value={filters.minPrice} onCommit={(v) => update({ minPrice: v })} />
          <PriceInput label={t("filters.maxToman")} value={filters.maxPrice} onCommit={(v) => update({ maxPrice: v })} />
        </div>
      </fieldset>
      <Toggle label={t("filters.inStock")} checked={Boolean(filters.inStock)} onChange={(v) => update({ inStock: v ? "true" : undefined })} />
      <Toggle label={t("filters.onPromotion")} checked={Boolean(filters.onPromotion)} onChange={(v) => update({ onPromotion: v ? "true" : undefined })} />
      <Select
        label={t("filters.rating")}
        value={filters.minRating ? String(filters.minRating) : ""}
        onChange={(e) => update({ minRating: e.target.value || undefined })}
        options={[
          { value: "", label: t("filters.any") },
          { value: "4", label: t("filters.ratingAtLeast", { value: formatNumber(4, locale) }) },
          { value: "3", label: t("filters.ratingAtLeast", { value: formatNumber(3, locale) }) },
        ]}
      />
      {data.facets.attributes.map((facet) => (
        <Select
          key={facet.key}
          label={facet.key}
          value={filters.attr?.[facet.key] ?? ""}
          onChange={(e) => update({ [`attr[${facet.key}]`]: e.target.value || undefined })}
          options={[{ value: "", label: t("filters.any") }, ...facet.values.map((v) => ({ value: v, label: v }))]}
        />
      ))}
      {activeCount ? (
        <Button variant="ghost" onClick={clearFilters}>
          {t("filters.clear")}
        </Button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h1 className="text-page-title text-text-primary">{currentCategory?.name ?? (filters.search ? t("searchTitle", { query: filters.search }) : t("title"))}</h1>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: query.trim() || undefined });
          }}
        >
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-strong bg-surface-elevated px-3">
            <Search size={18} aria-hidden="true" className="shrink-0 text-text-secondary" />
            <span className="sr-only">{t("searchLabel")}</span>
            <input className="h-full w-full min-w-0 bg-transparent text-body text-text-primary outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
          </label>
          <Button type="submit">{t("searchButton")}</Button>
        </form>
        {topCategories.length ? (
          <nav aria-label={t("categories")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <CategoryChip label={t("allCategories")} active={!filters.category} onClick={() => update({ category: undefined })} />
            {(childCategories.length ? childCategories : topCategories).map((c) => (
              <CategoryChip key={c.id} label={c.name} active={filters.category === c.id} onClick={() => update({ category: c.id })} />
            ))}
          </nav>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label={t("filters.title")}>
          {filterPanel ?? <Skeleton className="h-80 w-full" />}
        </aside>

        <section className="flex min-w-0 flex-col gap-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-metadata text-text-secondary">{data ? t("resultCount", { count: data.total }) : " "}</p>
            <div className="flex items-end gap-2">
              <Button variant="secondary" className="lg:hidden" onClick={() => setSheetOpen(true)}>
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  {t("filters.title")}
                  {activeCount ? <span className="rounded-full bg-brand-solid px-1.5 text-metadata text-on-brand">{formatNumber(activeCount, locale)}</span> : null}
                </span>
              </Button>
              <div className="w-44">
                <Select label={t("sort.label")} value={filters.sort ?? "RECOMMENDED"} onChange={(e) => update({ sort: e.target.value === "RECOMMENDED" ? undefined : e.target.value })} options={SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) }))} />
              </div>
            </div>
          </div>

          {error ? <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={() => setRetry((n) => n + 1)} /> : null}
          {!error && !data ? (
            <div className="product-grid" aria-label={t("loading")}>
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full" />
              ))}
            </div>
          ) : null}
          {data && data.items.length === 0 ? (
            <EmptyState
              title={t("empty")}
              description={activeCount || filters.search ? t("emptyHint") : undefined}
              actionLabel={activeCount || filters.search ? t("filters.clear") : undefined}
              onAction={() => router.replace(pathname)}
            />
          ) : null}
          {data && data.items.length ? (
            <div className="product-grid">
              {data.items.map((product) => (
                <ProductCard key={product.id} product={product} onClick={() => router.push(`/${locale}/shop/products/${product.id}`)} />
              ))}
            </div>
          ) : null}

          {data && totalPages > 1 ? (
            <nav aria-label={t("pagination.label")} className="flex items-center justify-center gap-3 pt-2">
              <Button variant="secondary" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) }, true)}>
                {t("pagination.previous")}
              </Button>
              <span className="text-metadata text-text-secondary">{t("pagination.status", { page: formatNumber(data.page, locale), total: formatNumber(totalPages, locale) })}</span>
              <Button variant="secondary" disabled={data.page >= totalPages} onClick={() => update({ page: String(data.page + 1) }, true)}>
                {t("pagination.next")}
              </Button>
            </nav>
          ) : null}
        </section>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("filters.title")}>
        <div className="flex flex-col gap-4">
          {filterPanel}
          <Button onClick={() => setSheetOpen(false)}>{data ? t("filters.showResults", { count: data.total }) : t("filters.close")}</Button>
        </div>
      </Sheet>
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-metadata ${active ? "border-brand-natural bg-brand-solid text-on-brand" : "border-border-subtle bg-surface-elevated text-text-secondary hover:border-border-strong"}`}
    >
      {label}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-body text-text-primary">
      {label}
      <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Customers think in Toman; the API filters in IRR (×10). Persian digits are accepted. */
function PriceInput({ label, value, onCommit }: { label: string; value: number | undefined; onCommit: (rial: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ? String(Math.round(value / 10)) : "");
  useEffect(() => setDraft(value ? String(Math.round(value / 10)) : ""), [value]);
  const commit = () => {
    const digits = draft.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d]/g, "");
    const next = digits ? String(Number(digits) * 10) : undefined;
    if (next !== (value ? String(value) : undefined)) onCommit(next);
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-metadata text-text-secondary">{label}</span>
      <input
        inputMode="numeric"
        className="h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface-elevated px-3 text-body text-text-primary"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}
