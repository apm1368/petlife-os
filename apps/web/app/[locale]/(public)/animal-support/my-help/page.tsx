import type { Metadata } from "next";
import { MyHelpOffersView } from "@/features/animal-support/MyHelpOffersView";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MyHelpPage() {
  return <MyHelpOffersView />;
}
