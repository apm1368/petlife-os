import {ExternalStaysView} from "@/features/travel-external/ExternalStaysView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "travelExternal");
}

export const dynamic="force-dynamic";
export default function ExternalStaysPage(){return <ExternalStaysView/>}
