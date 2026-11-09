import { HelpCategoryView } from "@/features/help-center/PublicHelpViews";

export default async function HelpCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HelpCategoryView slug={slug} />;
}
