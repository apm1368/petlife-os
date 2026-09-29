import type { Metadata } from "next";
import { CreateSupportNeedView } from "@/features/animal-support/CreateSupportNeedView";

/** Private, per-account page: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CreateSupportNeedPage() {
  return <CreateSupportNeedView />;
}
