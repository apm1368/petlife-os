import type { Locale } from "@prisma/client";

/** Guides are articles in this category; they have their own section (/guides), distinct from the blog. */
export const GUIDE_CATEGORY_SLUG = "guides";

/** The one place an article locale's public address is decided: `/{locale}/guides/{slug}` for guides, `/{locale}/blog/{slug}` otherwise. */
export function articleCanonicalPath(locale: Locale | string, slug: string, categorySlug?: string | null): string {
  return categorySlug === GUIDE_CATEGORY_SLUG ? `/${locale}/guides/${slug}` : `/${locale}/blog/${slug}`;
}
