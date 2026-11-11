import { ShopHomeView } from "@/features/commerce/ShopHomeView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "shop");
}

export default function ShopPage() {
  return <ShopHomeView />;
}
