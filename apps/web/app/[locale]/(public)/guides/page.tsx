import { ArticleIndexRoute, articleIndexMetadataFor } from "@/features/content/article-index-route";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props) {
  return articleIndexMetadataFor((await params).locale, { kind: "guides" }, await searchParams);
}

/** Guides: practical care articles, a section of their own — not the blog. */
export default async function GuidesIndexPage({ params, searchParams }: Props) {
  return <ArticleIndexRoute localeParam={(await params).locale} index={{ kind: "guides" }} searchParams={await searchParams} />;
}
