import type { Metadata } from "next";
import { MySupportNeedsView } from "@/features/animal-support/MySupportNeedsView";

/** Private, per-account page: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MySupportNeedsPage() {
  return <MySupportNeedsView />;
}
