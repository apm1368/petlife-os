import { HelpCenterHomeView } from "@/features/help-center/PublicHelpViews";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "help");
}

export default function HelpCenterPage() { return <HelpCenterHomeView />; }
