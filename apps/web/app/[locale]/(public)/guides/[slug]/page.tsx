import { PublicBlogArticleView } from "@/features/content/PublicBlogArticleView";

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBlogArticleView slug={slug} section="guides" />;
}
