"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import type { Locale as ContentLocale, PublicCategoryDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { PublicBlogIndexView } from "./PublicBlogIndexView";

/** Category-filtered blog index — resolves the category's own localized name for the page header. */
export function PublicBlogCategoryView({ slug }: { slug: string }) {
  const t = useTranslations("blog.index");
  const locale = useLocale() as ContentLocale;
  const [category, setCategory] = useState<PublicCategoryDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setCategory(null);
    try {
      setCategory(await blogService.getCategory(locale, slug));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);

  if (error) return <ErrorRecovery title={t("categoryNotFoundTitle")} message={t("categoryNotFoundMessage")} retryLabel={t("retry")} onRetry={load} />;
  if (!category) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return <PublicBlogIndexView categorySlug={slug} titleOverride={category.name} />;
}
