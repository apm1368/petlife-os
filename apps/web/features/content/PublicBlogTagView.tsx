"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import type { Locale as ContentLocale, PublicTagDto } from "@petlife/types";
import { blogService } from "@/services/blog.service";
import { PublicBlogIndexView } from "./PublicBlogIndexView";

/** Tag-filtered blog index — resolves the tag's own localized name for the page header. */
export function PublicBlogTagView({ slug }: { slug: string }) {
  const t = useTranslations("blog.index");
  const locale = useLocale() as ContentLocale;
  const [tag, setTag] = useState<PublicTagDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setTag(null);
    try {
      setTag(await blogService.getTag(locale, slug));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);

  if (error) return <ErrorRecovery title={t("tagNotFoundTitle")} message={t("tagNotFoundMessage")} retryLabel={t("retry")} onRetry={load} />;
  if (!tag) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return <PublicBlogIndexView tagSlug={slug} titleOverride={tag.name} />;
}
