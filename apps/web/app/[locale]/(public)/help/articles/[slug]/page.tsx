import { HelpArticleView } from "@/features/help-center/PublicHelpViews";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HelpArticleView slug={slug} />;
}
