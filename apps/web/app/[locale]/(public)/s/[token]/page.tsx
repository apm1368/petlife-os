import type { Metadata } from "next";
import { ClinicSmsOptOutView } from "@/features/clinic/ClinicSmsOptOutView";

/** A personal opt-out link from a clinic text: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ClinicSmsOptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClinicSmsOptOutView token={token} />;
}
