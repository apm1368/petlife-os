import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isRouteLocale, type RouteLocale } from "@/lib/i18n/config";
import { fetchArticleList, fetchCategories, fetchCategory, fetchTag } from "@/lib/seo/blog-server";
import { articleIndexMetadata } from "@/lib/seo/article-metadata";
import { articleListJsonLd } from "@/lib/seo/article-jsonld";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { SITE_NAME, absoluteUrl, jsonLdScript } from "@/lib/seo/site";
import { GUIDE_CATEGORY_SLUG } from "./content-sections";
import { PublicBlogIndexView } from "./PublicBlogIndexView";
import { ARTICLE_INDEX_PAGE_SIZE } from "./content-sections";

export type IndexKind = { kind: "blog" } | { kind: "guides" } | { kind: "category"; slug: string } | { kind: "tag"; slug: string };

function pageFrom(searchParams: Record<string, string | string[] | undefined>): number {
  const raw = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const value = Number(raw ?? 1);
  return Number.isInteger(value) && value >= 1 && value <= 500 ? value : 1;
}

function listInput(index: IndexKind, page: number) {
  const base = { page, pageSize: ARTICLE_INDEX_PAGE_SIZE };
  switch (index.kind) {
    case "blog":
      return { ...base, excludeCategorySlug: GUIDE_CATEGORY_SLUG };
    case "guides":
      return { ...base, categorySlug: GUIDE_CATEGORY_SLUG };
    case "category":
      return { ...base, categorySlug: index.slug };
    case "tag":
      return { ...base, tagSlug: index.slug };
  }
}

function suffixOf(index: IndexKind): string {
  return index.kind === "blog" ? "blog" : index.kind === "guides" ? "guides" : index.kind === "category" ? `blog/category/${index.slug}` : `blog/tag/${index.slug}`;
}

async function headingFor(locale: RouteLocale, index: IndexKind): Promise<{ title: string; description: string } | null> {
  if (index.kind === "blog" || index.kind === "guides") {
    const meta = publicPageMetadata(locale, index.kind);
    return { title: String(meta.title), description: String(meta.description) };
  }
  const editorial = await getTranslations({ locale, namespace: "rollout.editorial" });
  if (index.kind === "category") {
    const category = await fetchCategory(locale, index.slug).catch(() => null);
    if (!category) return null;
    return { title: `${category.name} | ${SITE_NAME[locale]}`, description: category.description ?? editorial("description") };
  }
  const tag = await fetchTag(locale, index.slug).catch(() => null);
  if (!tag) return null;
  return { title: `${tag.name} | ${SITE_NAME[locale]}`, description: editorial("description") };
}

/**
 * Article indexes (blog, guides, a category, a tag), rendered on the server with crawlable `?page=N` links.
 * Blog, guides and categories are indexable once they list at least one article; tag archives stay
 * `noindex, follow` (thin, overlapping lists) but still pass crawlers on to the articles.
 */
export async function articleIndexMetadataFor(localeParam: string, index: IndexKind, searchParams: Record<string, string | string[] | undefined>): Promise<Metadata> {
  if (!isRouteLocale(localeParam)) return { robots: { index: false, follow: false } };
  const locale = localeParam;
  const page = pageFrom(searchParams);
  const [heading, list] = await Promise.all([headingFor(locale, index), fetchArticleList(locale, listInput(index, page))]);
  if (!heading) return { robots: { index: false, follow: true } };
  const hasArticles = (list?.items.length ?? 0) > 0;
  const sameSuffixEverywhere = index.kind === "blog" || index.kind === "guides";
  return articleIndexMetadata(locale, {
    suffix: suffixOf(index),
    title: heading.title,
    description: heading.description,
    indexable: hasArticles && index.kind !== "tag",
    page,
    availableIn: sameSuffixEverywhere ? undefined : [locale],
  });
}

export async function ArticleIndexRoute({ localeParam, index, searchParams }: { localeParam: string; index: IndexKind; searchParams: Record<string, string | string[] | undefined> }) {
  if (!isRouteLocale(localeParam)) notFound();
  const locale = localeParam;
  const page = pageFrom(searchParams);
  const [heading, list, categories] = await Promise.all([headingFor(locale, index), fetchArticleList(locale, listInput(index, page)), fetchCategories(locale)]);
  if (!heading) notFound();
  if (list && page > 1 && list.items.length === 0) notFound();
  const basePath = `/${locale}/${suffixOf(index)}`;
  const visibleTitle = heading.title.split(" | ")[0]!;
  return (
    <>
      {list?.items.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(articleListJsonLd(locale, absoluteUrl(basePath), visibleTitle, list.items)) }} /> : null}
      <PublicBlogIndexView
        section={index.kind === "guides" ? "guides" : "blog"}
        categorySlug={index.kind === "category" ? index.slug : undefined}
        tagSlug={index.kind === "tag" ? index.slug : undefined}
        titleOverride={index.kind === "blog" ? undefined : visibleTitle}
        descriptionOverride={index.kind === "category" ? heading.description : undefined}
        initialPage={list ?? undefined}
        initialCategories={categories ?? undefined}
        pageNumber={page}
        basePath={basePath}
      />
    </>
  );
}
