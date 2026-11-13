import { ArticleRoute, articleRouteMetadata } from "@/features/content/article-route";

type Params = { params: Promise<{ locale: string; slug: string }> };

export function generateMetadata({ params }: Params) {
  return articleRouteMetadata(params, "blog");
}

export default function BlogArticlePage({ params }: Params) {
  return <ArticleRoute params={params} section="blog" />;
}
