import type { Metadata } from "next";
import { SystemState } from "@/features/system/SystemState";

export const metadata: Metadata = { title: "PET LIFE", robots: { index: false, follow: false } };

/** Consumer 404 inside the locale layout (RTL/LTR, fonts and theme come from there). */
export default function LocaleNotFound() {
  return (
    <main className="min-h-screen bg-surface-base px-4">
      <SystemState kind="NOT_FOUND" />
    </main>
  );
}
