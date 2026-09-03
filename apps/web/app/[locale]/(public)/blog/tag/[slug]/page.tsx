import { PublicBlogTagView } from "@/features/content/PublicBlogTagView";

export default async function BlogTagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicBlogTagView slug={slug} />;
}
