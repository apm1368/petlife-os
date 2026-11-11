import { PublicBlogIndexView } from "@/features/content/PublicBlogIndexView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "blog");
}

export default function BlogIndexPage() {
  return <PublicBlogIndexView />;
}
