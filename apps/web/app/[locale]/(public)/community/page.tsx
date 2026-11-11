import { CommunityFeedView } from "@/features/community/CommunityFeedView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "community");
}

export default function CommunityFeedPage() {
  return <CommunityFeedView />;
}
