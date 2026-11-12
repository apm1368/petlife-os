"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { PublicArticleSummaryDto } from "@petlife/types";
import "./editorial-design.css";
import { localizedAuthorName } from "@/lib/content/author-name";

export function PublicBlogArticleCard({ article }: { article: PublicArticleSummaryDto }) {
  const locale = useLocale();
  return <Link href={article.canonicalPath} className="editorial-card">
    {article.coverMediaAsset ? <Image unoptimized width={900} height={600} src={article.coverMediaAsset.url} alt={article.coverMediaAsset.altText ?? article.title} className="editorial-card__image" /> : null}
    <div className="editorial-card__body">
      {article.category ? <span className="editorial-card__category">{article.category.name}</span> : null}
      <span className="editorial-card__title">{article.title}</span>
      {article.excerpt ? <p className="editorial-card__excerpt">{article.excerpt}</p> : null}
      <div className="editorial-card__meta">{article.author ? <span>{localizedAuthorName(article.author.name, locale)}</span> : <span />}<time dateTime={article.publishedAt}>{new Intl.DateTimeFormat({ fa: "fa-IR", en: "en-US", de: "de-DE", es: "es-ES", ar: "ar", nl: "nl-NL" }[locale] ?? "en-US", { dateStyle: "medium" }).format(new Date(article.publishedAt))}</time></div>
    </div>
  </Link>;
}
