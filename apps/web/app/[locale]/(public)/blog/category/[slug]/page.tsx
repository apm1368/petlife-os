import { PublicBlogCategoryView } from "@/features/content/PublicBlogCategoryView";

export default async function BlogCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBlogCategoryView slug={slug} />;
}
