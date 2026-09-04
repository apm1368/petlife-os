import { CommunityPostDetailView } from "@/features/community/CommunityPostDetailView";

export default async function CommunityPostDetailPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <CommunityPostDetailView postId={postId} />;
}
