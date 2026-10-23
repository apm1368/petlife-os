"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PetSpecies, type ProductCategoryDto } from "@petlife/types";
import { speciesLabel } from "@/features/pets/pet-identity";
import { Button, Search, Select } from "@petlife/ui";

/** Shop-home discovery uses the same URL contract as the full results page. */
export function ShopSidebar({ categories }: { categories: ProductCategoryDto[] }) {
  const t = useTranslations("commerce.design");
  const f = useTranslations("commerce.results");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [species, setSpecies] = useState("");
  const [inStock, setInStock] = useState(false);
  return <aside className="commerce-sidebar shop-sidebar" aria-label={t("filters")}>
    <h2>{t("filters")}</h2><p>{t("filterHint")}</p>
    <form role="search" onSubmit={(event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (category) params.set("category", category);
      if (species) params.set("species", species);
      if (inStock) params.set("inStock", "true");
      router.push(`/${locale}/shop/products${params.size ? `?${params}` : ""}`);
    }}>
      <label className="commerce-search"><Search size={18} aria-hidden="true" /><span className="sr-only">{f("searchLabel")}</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={f("searchPlaceholder")} /></label>
      <Select label={f("categories")} value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: "", label: f("allCategories") }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
      <Select label={f("filters.species")} value={species} onChange={(e) => setSpecies(e.target.value)} options={[{ value: "", label: f("filters.any") }, ...Object.values(PetSpecies).map((value) => ({ value, label: speciesLabel({ species: value }, locale === "fa" ? "fa" : "en") }))]} />
      <label className="commerce-toggle"><span>{f("filters.inStock")}</span><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /></label>
      <Button type="submit">{t("applyFilters")}</Button>
    </form>
  </aside>;
}
