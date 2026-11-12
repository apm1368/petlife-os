import { ArticleIndexRoute, articleIndexMetadataFor } from "@/features/content/article-index-route";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  return articleIndexMetadataFor(locale, { kind: "tag", slug }, await searchParams);
}

export default async function BlogTagPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  return <ArticleIndexRoute localeParam={locale} index={{ kind: "tag", slug }} searchParams={await searchParams} />;
}
