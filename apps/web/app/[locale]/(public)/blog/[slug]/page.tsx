import { PublicBlogArticleView } from "@/features/content/PublicBlogArticleView";

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBlogArticleView slug={slug} />;
}
