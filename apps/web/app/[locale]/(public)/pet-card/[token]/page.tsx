import type { Metadata } from "next";
import { PublicPetCardView } from "@/features/pet-safety/PublicPetCardView";

// A private link: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicPetCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicPetCardView token={token} />;
}
