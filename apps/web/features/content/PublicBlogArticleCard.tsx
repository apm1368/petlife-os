"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ContextSurface } from "@petlife/ui";
import type { PublicArticleSummaryDto } from "@petlife/types";

export function PublicBlogArticleCard({ article }: { article: PublicArticleSummaryDto }) {
  const locale = useLocale() as "fa" | "en";
  return (
    <Link href={article.canonicalPath} className="block">
      <ContextSurface className="flex flex-col gap-2">
        {article.coverMediaAsset ? <img src={article.coverMediaAsset.url} alt={article.coverMediaAsset.altText ?? article.title} className="h-40 w-full rounded-md object-cover" /> : null}
        {article.category ? <span className="text-metadata text-brand-natural">{article.category.name}</span> : null}
        <span className="text-body font-medium text-text-primary">{article.title}</span>
        {article.excerpt ? <p className="text-metadata text-text-secondary">{article.excerpt}</p> : null}
        <div className="flex items-center justify-between gap-2 text-metadata text-text-secondary">
          {article.author ? <span>{article.author.name}</span> : <span />}
          <span>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(article.publishedAt))}</span>
        </div>
      </ContextSurface>
    </Link>
  );
}
