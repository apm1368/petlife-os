"use client";
import { useTranslations } from "next-intl";
import type { ProductCategoryDto } from "@petlife/types";

/**
 * The shop taxonomy is seeded and keyed by slug; its display names live in the message catalog
 * (commerce.categoryNames.<slug>) so /fa, /en, /de and /es each show their own. A category that has no
 * translation yet keeps the name stored in the catalog.
 */
export function useCategoryName() {
  const t = useTranslations("commerce.categoryNames");
  return (category: Pick<ProductCategoryDto, "slug" | "name">) => (t.has(category.slug) ? t(category.slug) : category.name);
}
