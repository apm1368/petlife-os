import { ExploreServicesView } from "@/features/services/ExploreServicesView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "services");
}

export default function ExploreServicesPage() {
  return <ExploreServicesView />;
}
