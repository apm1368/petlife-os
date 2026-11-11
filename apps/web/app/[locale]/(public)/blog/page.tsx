import { ArticleIndexRoute, articleIndexMetadataFor } from "@/features/content/article-index-route";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props) {
  return articleIndexMetadataFor((await params).locale, { kind: "blog" }, await searchParams);
}

export default async function BlogIndexPage({ params, searchParams }: Props) {
  return <ArticleIndexRoute localeParam={(await params).locale} index={{ kind: "blog" }} searchParams={await searchParams} />;
}
