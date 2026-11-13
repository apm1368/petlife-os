import { ArticleRoute, articleRouteMetadata } from "@/features/content/article-route";

type Params = { params: Promise<{ locale: string; slug: string }> };

export function generateMetadata({ params }: Params) {
  return articleRouteMetadata(params, "guides");
}

/** Guides: practical care articles in the "guides" category, a section of their own — not the blog. */
export default function GuidePage({ params }: Params) {
  return <ArticleRoute params={params} section="guides" />;
}
