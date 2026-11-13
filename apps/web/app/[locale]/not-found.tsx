import type { Metadata } from "next";
import { SystemState } from "@/features/system/SystemState";
import { NotFoundFrame } from "@/features/system/NotFoundFrame";
import "@/features/landing/opl/opl-landing.css";
import "@/features/landing/opl/opl-body.css";

export const metadata: Metadata = { title: "opetlife", robots: { index: false, follow: false } };

/** Consumer 404 inside the locale layout (RTL/LTR, fonts and theme come from there), on the 2026-11 pattern. */
export default function LocaleNotFound() {
  return (
    <NotFoundFrame>
      <SystemState kind="NOT_FOUND" home="site" />
    </NotFoundFrame>
  );
}
