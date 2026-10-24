import type { Metadata } from "next";
import { ManageSupportNeedView } from "@/features/animal-support/ManageSupportNeedView";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManageSupportNeedPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <ManageSupportNeedView listingId={listingId} />;
}
